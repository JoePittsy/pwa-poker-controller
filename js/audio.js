// All sound is synthesised with WebAudio: no asset files, works offline.
// Browsers only start audio after a touch/click/key press (a gamepad press does not count on iOS).
const store = (() => { try { return JSON.parse(localStorage.getItem('padpoker.audio')) || {}; } catch { return {}; } })();
export const settings = { sfx: store.sfx ?? true, music: store.music ?? true };
const save = () => { try { localStorage.setItem('padpoker.audio', JSON.stringify(settings)); } catch { /* private mode */ } };

let ctx, sfxBus, musicBus, musicFilter, verb, noiseBuf, musicTimer;
const rnd = (a, b) => a + Math.random() * (b - a);
const midi = (n) => 440 * 2 ** ((n - 69) / 12);

function init() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 5;
  comp.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.gain.value = settings.sfx ? 1 : 0; sfxBus.connect(comp);
  musicFilter = ctx.createBiquadFilter(); musicFilter.type = 'lowpass'; musicFilter.frequency.value = 16000; musicFilter.connect(comp);
  musicBus = ctx.createGain(); musicBus.gain.value = settings.music ? 0.55 : 0; musicBus.connect(musicFilter);
  // small synthetic room reverb
  const len = ctx.sampleRate * 1.8;
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3.2;
  }
  verb = ctx.createConvolver(); verb.buffer = ir;
  const wet = ctx.createGain(); wet.gain.value = 0.45;
  verb.connect(wet); wet.connect(comp);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  return true;
}

export function unlock() {
  if (!ctx && !init()) return false;
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  if (!musicTimer) startMusic();
  return ctx.state === 'running';
}
export const running = () => !!ctx && ctx.state === 'running';
document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.hidden) ctx.suspend(); else ctx.resume().catch(() => {});
});

function out(node, bus, wet) {
  node.connect(bus);
  if (wet) { const s = ctx.createGain(); s.gain.value = wet; node.connect(s); s.connect(verb); }
}
function shape(g, t, a, d, v) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}
// delay is in seconds from now
function tone({ f, f2, type = 'sine', delay = 0, a = 0.004, d = 0.15, v = 0.3, wet = 0, bus = sfxBus }) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + a + d);
  shape(g, t, a, d, v);
  o.connect(g); out(g, bus, wet);
  o.start(t); o.stop(t + a + d + 0.05);
}
function noise({ delay = 0, a = 0.003, d = 0.1, v = 0.2, type = 'bandpass', f = 2000, f2, q = 1, wet = 0, bus = sfxBus }) {
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource(), flt = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; s.loop = true;
  flt.type = type; flt.Q.value = q;
  flt.frequency.setValueAtTime(f, t);
  if (f2) flt.frequency.exponentialRampToValueAtTime(f2, t + a + d);
  shape(g, t, a, d, v);
  s.connect(flt); flt.connect(g); out(g, bus, wet);
  s.start(t, Math.random()); s.stop(t + a + d + 0.05);
}
const ok = () => ctx && ctx.state === 'running' && settings.sfx;
const sfx = (fn) => (...args) => { if (ok()) fn(...args); };

export const card = sfx((delay = 0) => {
  const p = rnd(0.85, 1.2);
  noise({ delay, f: 3200 * p, f2: 900 * p, d: 0.075, v: 0.32, q: 0.8 });
  tone({ delay, f: 190 * p, f2: 110, d: 0.04, v: 0.18 });
});
export const flip = sfx((delay = 0) => {
  noise({ delay, f: 900, f2: 3600, d: 0.09, v: 0.22, q: 1.2 });
  noise({ delay: delay + 0.08, f: 2600, f2: 1200, d: 0.05, v: 0.25 });
});
export const chips = sfx((n = 1, delay = 0, pitch = 1) => {
  for (let i = 0; i < n; i++) {
    const t = delay + i * rnd(0.035, 0.06), p = pitch * rnd(0.92, 1.1);
    tone({ delay: t, f: 3050 * p, d: 0.07, v: 0.13, wet: 0.15 });
    tone({ delay: t, f: 4720 * p, type: 'triangle', d: 0.05, v: 0.09 });
    noise({ delay: t, type: 'highpass', f: 5000, d: 0.02, v: 0.1 });
  }
});
export const check = sfx(() => {
  for (const delay of [0, 0.11]) {
    tone({ delay, f: 170, f2: 70, d: 0.08, v: 0.55 });
    noise({ delay, type: 'lowpass', f: 900, d: 0.04, v: 0.25 });
  }
});
export const fold = sfx(() => noise({ type: 'lowpass', f: 2400, f2: 250, a: 0.02, d: 0.24, v: 0.24 }));
export const turn = sfx(() => {
  tone({ f: 660, type: 'triangle', d: 0.22, v: 0.2, wet: 0.5 });
  tone({ delay: 0.09, f: 990, type: 'triangle', d: 0.3, v: 0.2, wet: 0.5 });
});
export const tick = sfx(() => tone({ f: 980, type: 'triangle', d: 0.03, v: 0.1 }));
export const confirm = sfx(() => tone({ f: 620, f2: 1040, type: 'triangle', d: 0.09, v: 0.2, wet: 0.2 }));
export const back = sfx(() => tone({ f: 520, f2: 330, type: 'triangle', d: 0.09, v: 0.16 }));
export const slider = sfx((frac) => tone({ f: 380 * 2 ** (frac * 1.6), type: 'triangle', d: 0.04, v: 0.13 }));
export const count = sfx((frac) => tone({ f: 700 * 2 ** frac, type: 'square', d: 0.03, v: 0.045 }));
export const allin = sfx(() => {
  noise({ f: 250, f2: 4200, a: 0.42, d: 0.1, v: 0.3, q: 2, wet: 0.3 });
  tone({ delay: 0.45, f: 110, f2: 38, d: 0.6, v: 0.9 });
  noise({ delay: 0.45, type: 'lowpass', f: 600, d: 0.25, v: 0.5, wet: 0.4 });
  chips(7, 0.5, 0.9);
});
export const heartbeat = sfx(() => {
  for (const delay of [0, 0.19]) tone({ delay, f: 72, f2: 42, d: 0.16, v: 0.75 });
});
const SCALE = [72, 76, 79, 84, 88, 91, 96];
export const win = sfx((size = 1) => { // 0 = someone else won, 1..3 = our win by size
  const n = size ? 3 + size : 2;
  const v = size ? 0.2 : 0.09;
  for (let i = 0; i < n; i++) {
    const delay = i * 0.085;
    tone({ delay, f: midi(SCALE[i]), type: 'triangle', d: 0.32, v, wet: 0.6 });
    tone({ delay, f: midi(SCALE[i] + 12), d: 0.2, v: v * 0.4, wet: 0.6 });
  }
  if (size) for (const m of [72, 76, 79, 84]) tone({ delay: n * 0.085, f: midi(m), type: 'triangle', a: 0.01, d: 0.9, v: 0.13, wet: 0.8 });
});
export const lose = sfx(() => {
  [64, 60, 55].forEach((m, i) => tone({ delay: i * 0.16, f: midi(m), type: 'triangle', d: 0.4, v: 0.14, wet: 0.6 }));
});

// ---------- settings ----------
export function setSfx(on) { settings.sfx = on; save(); if (ctx) sfxBus.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.05); }
export function setMusic(on) { settings.music = on; save(); if (ctx) musicBus.gain.setTargetAtTime(on ? 0.55 : 0, ctx.currentTime, 0.3); }
// muffle the music while an all-in is being run out
export function tension(on) { if (ctx) musicFilter.frequency.setTargetAtTime(on ? 420 : 16000, ctx.currentTime, on ? 0.25 : 0.6); }

// ---------- generative background music: slow, swung, late-night ----------
const BARS = [
  [38, [62, 65, 69, 72, 76]], [43, [59, 65, 69, 71, 76]], [36, [59, 64, 67, 71, 74]], [33, [60, 64, 67, 72, 76]],
  [41, [57, 60, 64, 69, 72]], [40, [59, 62, 64, 67, 74]], [38, [57, 60, 62, 65, 72]], [43, [59, 62, 65, 69, 76]],
];
const STEP = 60 / 74 / 2; // eighth notes at 74 bpm
function startMusic() {
  let step = 0, next = ctx.currentTime + 0.3;
  const m = { bus: musicBus };
  const schedule = () => {
    if (ctx.state !== 'running') { next = Math.max(next, ctx.currentTime + 0.1); return; }
    while (next < ctx.currentTime + 0.35) {
      if (settings.music) playStep(step, next - ctx.currentTime + (step % 2 ? STEP * 0.14 : 0), m);
      step++; next += STEP;
    }
  };
  musicTimer = setInterval(schedule, 110);
}
function playStep(step, delay, m) {
  const s = step % 8;
  const [root, notes] = BARS[Math.floor(step / 8) % BARS.length];
  if (s === 0) {
    for (const n of notes.slice(0, 4)) pad(midi(n), delay, STEP * 8);
    tone({ ...m, delay, f: midi(root), a: 0.02, d: 0.9, v: 0.34 });
  }
  if (s === 5 && Math.random() < 0.7) tone({ ...m, delay, f: midi(root + (Math.random() < 0.5 ? 7 : 12)), a: 0.02, d: 0.4, v: 0.22 });
  if (s === 0 || s === 4) tone({ ...m, delay, f: 105, f2: 44, d: 0.16, v: 0.3 });
  if (s === 2 || s === 6) noise({ ...m, delay, f: 1700, q: 0.7, d: 0.09, v: 0.06, wet: 0.3 });
  noise({ ...m, delay, type: 'highpass', f: 7500, d: 0.03, v: s % 2 ? 0.035 : 0.02 });
  if (Math.random() < 0.3) {
    const f = midi(notes[Math.floor(Math.random() * notes.length)] + 12);
    tone({ ...m, delay, f, a: 0.005, d: 0.5, v: 0.09, wet: 0.9 });
    tone({ ...m, delay, f: f * 2, a: 0.005, d: 0.15, v: 0.025, wet: 0.9 });
  }
}
function pad(f, delay, dur) {
  const t = ctx.currentTime + delay;
  const g = ctx.createGain(), flt = ctx.createBiquadFilter();
  flt.type = 'lowpass'; flt.frequency.value = 750;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.05, t + 0.5);
  g.gain.setValueAtTime(0.05, t + dur - 0.3);
  g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.5);
  for (const [type, det] of [['triangle', -6], ['sawtooth', 7]]) {
    const o = ctx.createOscillator();
    o.type = type; o.frequency.value = f; o.detune.value = det;
    o.connect(flt); o.start(t); o.stop(t + dur + 0.6);
  }
  flt.connect(g); out(g, musicBus, 0.5);
}
