// All sound is synthesised with WebAudio: no asset files, works offline.
// Sound direction matches the art: dry, chunky and toy-like. Everything pitched is a
// marimba-style "tok" in one pentatonic key, so play makes little melodies.
// Browsers only start audio after a touch/click/key press (a gamepad press does not count on iOS).
import { createMusic, BAR } from './music.js';

const store = (() => { try { return JSON.parse(localStorage.getItem('padpoker.audio')) || {}; } catch { return {}; } })();
export const settings = { sfx: store.sfx ?? true, music: store.music ?? true };
const save = () => { try { localStorage.setItem('padpoker.audio', JSON.stringify(settings)); } catch { /* private mode */ } };

let ctx, sfxBus, musicBus, musicFilter, verb, noiseBuf, musicTimer;
let level = 0; // how much of the band is playing, see music.js
const MUSIC_VOL = 0.8;
let heat = 0; // climbs with every bet/raise in a hand, so the table "heats up"
const rnd = (a, b) => a + Math.random() * (b - a);
const midi = (n) => 440 * 2 ** ((n - 69) / 12);
const PENTA = [0, 2, 4, 7, 9];
// i-th note of C major pentatonic, i = 0 at middle C
const scale = (i) => 60 + 12 * Math.floor(i / 5) + PENTA[((i % 5) + 5) % 5];

function init() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12; comp.ratio.value = 4;
  comp.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.gain.value = settings.sfx ? 1 : 0; sfxBus.connect(comp);
  musicBus = ctx.createGain(); musicBus.gain.value = settings.music ? MUSIC_VOL : 0; musicBus.connect(comp);
  // a short, dry room: just enough air to stop things sounding clinical
  const len = Math.floor(ctx.sampleRate * 0.45);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 4;
  }
  verb = ctx.createConvolver(); verb.buffer = ir;
  const wet = ctx.createGain(); wet.gain.value = 0.3;
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
function tone({ f, f2, type = 'sine', delay = 0, a = 0.003, d = 0.15, v = 0.3, wet = 0, bus = sfxBus }) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + a + d);
  shape(g, t, a, d, v);
  o.connect(g); out(g, bus, wet);
  o.start(t); o.stop(t + a + d + 0.05);
}
function noise({ delay = 0, a = 0.002, d = 0.1, v = 0.2, type = 'bandpass', f = 2000, f2, q = 1, wet = 0, bus = sfxBus }) {
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
// the house instrument: a wooden mallet "tok" (fundamental + the 4x partial a marimba bar has)
function tok(note, { delay = 0, v = 0.3, d = 0.2, bus = sfxBus, wet = 0.15 } = {}) {
  const f = midi(note);
  tone({ delay, f, d, v, wet, bus });
  tone({ delay, f: f * 4, d: 0.045, v: v * 0.3, bus });
  noise({ delay, f: 2400, q: 0.6, d: 0.012, v: v * 0.3, bus });
}
// a hollow knock, like a knuckle on a table or a woodblock
function knock(delay = 0, v = 0.5, f = 620) {
  tone({ delay, f, f2: f * 0.8, d: 0.045, v, wet: 0.2 });
  tone({ delay, f: f * 2.7, d: 0.02, v: v * 0.3 });
  tone({ delay, f: 150, f2: 80, d: 0.05, v: v * 0.6 });
}
// a rubber-stamp thud for things that land hard
function thud(delay = 0, v = 0.8) {
  tone({ delay, f: 140, f2: 46, d: 0.22, v });
  noise({ delay, type: 'lowpass', f: 1400, f2: 300, d: 0.07, v: v * 0.5, wet: 0.3 });
}
const ok = () => ctx && ctx.state === 'running' && settings.sfx;
const sfx = (fn) => (...args) => { if (ok()) fn(...args); };

// paper: a quick dry "thwip"
export const card = sfx((delay = 0) => {
  const p = rnd(0.9, 1.15);
  noise({ delay, f: 1800 * p, f2: 5200 * p, d: 0.045, v: 0.3, q: 1.4 });
  noise({ delay: delay + 0.04, type: 'lowpass', f: 700, d: 0.025, v: 0.22 });
});
// two riffles and a tap on the table
export const shuffle = sfx(() => {
  for (const t0 of [0.1, 0.42]) {
    for (let i = 0; i < 13; i++) noise({ delay: t0 + i * 0.017, f: 2400 + i * 150, d: 0.016, v: 0.1 + i * 0.008, q: 1.6 });
    noise({ delay: t0 + 0.22, f: 900, f2: 3000, d: 0.07, v: 0.14 });
  }
  knock(0.72, 0.3, 420);
});
export const flip = sfx((delay = 0) => {
  noise({ delay, f: 1200, f2: 4800, d: 0.07, v: 0.28, q: 1.6 });
  tone({ delay: delay + 0.07, f: 420, f2: 980, d: 0.06, v: 0.22 }); // pop
  noise({ delay: delay + 0.07, type: 'lowpass', f: 900, d: 0.03, v: 0.25 });
});
// chips are mallet notes: n notes climbing from scale step `from`
export const chips = sfx((n = 1, delay = 0, from = 2) => {
  for (let i = 0; i < n; i++) tok(scale(from + i) + 12, { delay: delay + i * 0.055, v: 0.2, d: 0.14 });
});
// a bet or raise: starts higher each time someone raises this hand
export const raise = sfx((n = 3) => {
  const from = Math.min(heat, 9);
  heat += 2;
  for (let i = 0; i < n; i++) tok(scale(from + i) + 12, { delay: 0.04 + i * 0.06, v: 0.24, d: 0.16 });
  thud(0.04 + n * 0.06, 0.45);
});
export function newHand() { heat = 0; }
export const check = sfx(() => { knock(0, 0.5); knock(0.1, 0.42); });
export const fold = sfx(() => { // a deflating "bwoop"
  tone({ f: 420, f2: 130, type: 'triangle', d: 0.17, v: 0.24 });
  noise({ f: 2600, f2: 900, d: 0.08, v: 0.12 });
});
export const turn = sfx(() => { tok(76, { v: 0.3, d: 0.3, wet: 0.3 }); tok(81, { delay: 0.11, v: 0.3, d: 0.4, wet: 0.3 }); });
export const tick = sfx(() => knock(0, 0.16, 980));
export const confirm = sfx(() => tone({ f: 330, f2: 990, d: 0.07, v: 0.28, wet: 0.1 })); // "bloop"
export const back = sfx(() => tone({ f: 700, f2: 260, d: 0.08, v: 0.22 }));
export const slider = sfx((frac) => tok(scale(Math.round(frac * 14)) + 12, { v: 0.2, d: 0.1 }));
export const count = sfx((frac) => tok(scale(Math.round(frac * 10)) + 24, { v: 0.09, d: 0.05, wet: 0 }));
export const allin = sfx(() => { // a run up the bars, then the stamp comes down
  for (let i = 0; i < 9; i++) tok(scale(i) + 12, { delay: i * 0.048, v: 0.16 + i * 0.02, d: 0.12 });
  thud(0.46, 1);
  tok(scale(10) + 12, { delay: 0.46, v: 0.4, d: 0.6, wet: 0.5 });
  tok(scale(7) + 12, { delay: 0.46, v: 0.3, d: 0.6, wet: 0.5 });
});
// the river of an all-in: a held breath, then the card slams down
export const riverSlam = sfx(() => {
  noise({ f: 300, f2: 2600, a: 0.8, d: 0.08, v: 0.22, q: 2.5 });
  for (let i = 0; i < 6; i++) tok(scale(i * 2) + 12, { delay: 0.35 + i * 0.09, v: 0.08 + i * 0.02, d: 0.1 });
  thud(0.98, 1);
  noise({ delay: 0.98, f: 1800, f2: 5000, d: 0.06, v: 0.3 });
});
export const heartbeat = sfx(() => { thud(0, 0.7); thud(0.2, 0.5); });
export const win = sfx((size = 1) => { // 0 = someone else won, 1..3 = our win by size
  if (!size) { tok(72, { v: 0.16 }); tok(76, { delay: 0.09, v: 0.16, d: 0.3 }); return; }
  const n = 3 + size * 2;
  for (let i = 0; i < n; i++) tok(scale(i + 2) + 12, { delay: i * 0.07, v: 0.26, d: 0.2, wet: 0.3 });
  const end = n * 0.07 + 0.05;
  for (const m of [72, 76, 79, 84]) tok(m + (size > 1 ? 12 : 0), { delay: end, v: 0.24, d: 0.7, wet: 0.5 });
  thud(end, 0.5);
});
// each opponent "speaks" in their own register: three quick blips
export const talk = sfx((seat = 1) => {
  const base = [0, 67, 76, 55, 81, 62][seat] ?? 67;
  [0, 3, -2].forEach((n, i) => tone({ delay: i * 0.07, f: midi(base + n), type: 'triangle', d: 0.06, v: 0.13 }));
});
export const lose = sfx(() => { // a little "wah-wah"
  tone({ f: midi(64), f2: midi(63), type: 'triangle', d: 0.22, v: 0.2, wet: 0.2 });
  tone({ delay: 0.24, f: midi(60), f2: midi(55), type: 'triangle', d: 0.4, v: 0.2, wet: 0.2 });
});

// ---------- settings ----------
export function setSfx(on) { settings.sfx = on; save(); if (ctx) sfxBus.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.05); }
export function setMusic(on) { settings.music = on; save(); if (ctx) musicBus.gain.setTargetAtTime(on ? MUSIC_VOL : 0, ctx.currentTime, 0.3); }
// while an all-in is run out the music sinks underwater
export function tension(on) { if (musicFilter) musicFilter.frequency.setTargetAtTime(on ? 380 : 8000, ctx.currentTime, on ? 0.3 : 0.8); }
export function musicLevel(n) { level = n; }

// ---------- background music (composed in music.js, scheduled a bar at a time) ----------
function startMusic() {
  const music = createMusic(ctx, musicBus);
  musicFilter = music.filter;
  let bar = 0, next = ctx.currentTime + 0.25;
  const schedule = () => {
    if (ctx.state !== 'running' || !settings.music) return;
    if (next < ctx.currentTime) next = ctx.currentTime + 0.15; // we were suspended: start a fresh bar
    while (next < ctx.currentTime + 0.5) { music.scheduleBar(bar++, next, level); next += BAR; }
  };
  musicTimer = setInterval(schedule, 150);
  schedule();
}
