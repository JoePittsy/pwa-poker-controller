// All sound is synthesised with WebAudio: no asset files, works offline.
// Sound direction matches the art: dry, chunky and toy-like. Everything pitched is a
// marimba-style "tok" in one pentatonic key, so play makes little melodies.
// Browsers only start audio after a touch/click/key press (a gamepad press does not count on iOS).
import { createMusic, barSeconds } from './music.js';

const store = (() => { try { return JSON.parse(localStorage.getItem('padpoker.audio')) || {}; } catch { return {}; } })();
export const settings = { sfx: store.sfx ?? true, music: store.music ?? true };
const save = () => { try { localStorage.setItem('padpoker.audio', JSON.stringify(settings)); } catch { /* private mode */ } };

let ctx, sfxBus, musicBus, musicFilter, verb, noiseBuf, musicTimer;
let level = 0; // how much of the band is playing, see music.js
// Each venue plays the music in its own key with its own arpeggio; pitched effects follow the key.
// Tempo is a multiple of the tune's own 82 beats a minute; swing is how late the off-beats land, in seconds.
const FLAVOURS = [
  { key: 0, arp: 0, tempo: 1, swing: 0.022, lead: 'mallet' }, // the kitchen table: the tune as written
  { key: -2, arp: 1, tempo: 0.93, swing: 0.03, lead: 'pad' }, // the back room: slower and lazier
  { key: 3, arp: 2, tempo: 1.07, swing: 0.012, lead: 'glass' }, // the club: brighter and tighter
  { key: -4, arp: 3, tempo: 0.88, swing: 0.034, lead: 'mallet' }, // high rollers: low and unhurried
  { key: 5, arp: 4, tempo: 1.12, swing: 0.006, lead: 'glass' }, // the vault: quick and straight
  { key: -5, arp: 2, tempo: 0.97, swing: 0.026, lead: 'pad' }, // cash game: settled in for a long sit
  { key: 2, arp: 0, tempo: 1.16, swing: 0.01, lead: 'mallet' }, // sit and go: up-tempo
  { key: -1, arp: 3, tempo: 1.03, swing: 0.018, lead: 'glass' }, // heads-up ladder
];
let flavour = FLAVOURS[0];
let songKeyNow = 0; // the key the music is in right now, so pitched effects stay in tune as it moves
export function setVenue(i) { flavour = FLAVOURS[((i % FLAVOURS.length) + FLAVOURS.length) % FLAVOURS.length]; }
const MUSIC_VOL = 0.8;
let heat = 0; // climbs with every bet/raise in a hand, so the table "heats up"
const rnd = (a, b) => a + Math.random() * (b - a);
const midi = (n) => 440 * 2 ** ((n - 69) / 12);
const PENTA = [0, 2, 4, 7, 9];
// i-th note of C major pentatonic, i = 0 at middle C
const scale = (i) => 60 + 12 * Math.floor(i / 5) + PENTA[((i % 5) + 5) % 5];

function init() {
  const AC = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
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
/** @param {any} o */
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
/** @param {any} o */
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
/** @param {number} note @param {any} [o] */
function tok(note, { delay = 0, v = 0.3, d = 0.2, bus = sfxBus, wet = 0.15 } = {}) {
  const f = midi(note + (bus === musicBus ? 0 : songKeyNow));
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
let hushed = false; // effects are silenced while a folded hand is skipped
export function hush(on) { hushed = on; }
const ok = () => ctx && ctx.state === 'running' && settings.sfx && !hushed;
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
export const blindsUp = sfx(() => { tok(72, { v: 0.3, d: 0.25, wet: 0.3 }); tok(76, { delay: 0.12, v: 0.3, d: 0.25, wet: 0.3 }); tok(79, { delay: 0.24, v: 0.32, d: 0.45, wet: 0.4 }); });
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
  const base = [0, 67, 76, 55, 81, 62, 72, 48, 43, 84, 79, 70, 58, 65][seat] ?? 67;
  [0, 3, -2].forEach((n, i) => tone({ delay: i * 0.07, f: midi(base + n), type: 'triangle', d: 0.06, v: 0.13 }));
});
// clearing a table: a run up the bars, two big chords and a shower of chips
// The big one, for clearing a table or beating a boss: a roll up the scale, three rising hits, then a long
// shimmering chord. `big` adds a fourth hit and a higher shimmer.
export const victory = sfx((big = false) => {
  for (let i = 0; i < 14; i++) tok(scale(i) + 12, { delay: i * 0.045, v: 0.16 + i * 0.012, d: 0.14, wet: 0.3 });
  const hits = /** @type {[number, number[]][]} */ ([[0.7, [60, 67, 72]], [1.05, [62, 69, 74]], [1.4, [64, 72, 76, 79]]]);
  if (big) hits.push([1.75, [67, 72, 76, 79, 84]]);
  for (const [delay, notes] of hits) { for (const m of notes) tok(m + 12, { delay, v: 0.24, d: 0.5, wet: 0.5 }); thud(delay, 0.85); }
  const end = hits.at(-1)[0] + 0.4;
  for (const m of [60, 64, 67, 72, 76, 79, 84]) tok(m + 12, { delay: end, v: 0.26, d: 1.8, wet: 0.7 });
  thud(end, 1);
  for (let i = 0; i < (big ? 30 : 20); i++) tok(scale(5 + (i * 3) % 9) + 24, { delay: end + 0.15 + i * 0.065, v: 0.07, d: 0.08 });
});
export const fanfare = sfx(() => {
  for (let i = 0; i < 10; i++) tok(scale(i) + 12, { delay: i * 0.055, v: 0.2 + i * 0.012, d: 0.16, wet: 0.3 });
  for (const [delay, notes] of /** @type {[number, number[]][]} */ ([[0.62, [60, 67, 72, 76]], [1.0, [60, 64, 67, 72, 79, 84]]])) {
    for (const m of notes) tok(m + 12, { delay, v: 0.26, d: 1.1, wet: 0.6 });
    thud(delay, 0.8);
  }
  for (let i = 0; i < 16; i++) tok(scale(5 + (i * 3) % 9) + 24, { delay: 1.2 + i * 0.07, v: 0.07, d: 0.08 });
});
// a new venue sliding in
export const arrive = sfx(() => {
  noise({ f: 400, f2: 2200, a: 0.25, d: 0.2, v: 0.14, q: 1.2 });
  thud(0.42, 0.45);
  tok(scale(2) + 12, { delay: 0.45, v: 0.2, d: 0.3, wet: 0.3 });
});
export const sticker = sfx(() => { tok(79, { v: 0.26, d: 0.2, wet: 0.4 }); tok(84, { delay: 0.1, v: 0.26, d: 0.2, wet: 0.4 }); tok(91, { delay: 0.2, v: 0.3, d: 0.6, wet: 0.6 }); });
// chips thrown in rather than placed: a scatter of clacks and a thump, harder with power
export const thrown = sfx((power = 0.5) => {
  const n = 5 + Math.round(power * 7);
  for (let i = 0; i < n; i++) tok(scale(3 + ((i * 5) % 8)) + 12, { delay: 0.3 + i * 0.028 + Math.random() * 0.02, v: 0.12 + power * 0.14, d: 0.07 });
  thud(0.32, 0.3 + power * 0.6);
});
// the turn clock running down: a knock that climbs in pitch as time runs out
export const clockTick = sfx((urgency = 0, loud = 1) => knock(0, (0.22 + urgency * 0.3) * loud, 620 + urgency * 700));
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
    while (next < ctx.currentTime + 0.5) { songKeyNow = music.scheduleBar(bar++, next, level, flavour); next += barSeconds(flavour); }
  };
  musicTimer = setInterval(schedule, 150);
  schedule();
}
