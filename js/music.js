// Background music: a slow lo-fi groove in A minor, synthesised live.
// Design goals: sit under the game for an hour without fatigue or sameness. So: soft
// electric-piano chords, round bass, quiet brushed drums, everything low-passed, a gentle
// "tape" pitch drift. The piece has a written home theme that returns every fourth
// section; the sections in between are arranged procedurally (see planSection): the
// chords, the melody, and which instruments play and how are re-rolled each time, so it
// never loops exactly but always comes home.
// Works with any BaseAudioContext so it can also be rendered offline for checking.
export const BPM = 82;
const S16 = 60 / BPM / 4; // one sixteenth note
export const BAR = S16 * 16;
const midi = (n) => 440 * 2 ** ((n - 69) / 12);

// name: [bass note, electric-piano voicing]
export const CH = {
  Am9: [45, [55, 59, 60, 64]], Fmaj9: [41, [57, 60, 64, 67]], Dm9: [38, [53, 57, 60, 64]],
  Em7: [40, [55, 59, 62, 64]], E7: [40, [56, 59, 62, 64]], G6: [43, [55, 59, 62, 64]], Cmaj7: [36, [55, 59, 60, 64]],
};
// melody phrases: [bar within phrase, sixteenth, note, length in sixteenths]
const P1 = [[0, 4, 76, 2], [0, 7, 79, 2], [0, 10, 81, 5], [1, 6, 79, 2], [1, 8, 76, 6],
  [2, 4, 74, 2], [2, 7, 76, 2], [2, 10, 72, 5], [3, 6, 74, 2], [3, 8, 71, 7]];
const P2 = [[0, 2, 69, 2], [0, 4, 72, 2], [0, 6, 76, 2], [0, 10, 79, 4], [1, 4, 81, 3], [1, 8, 79, 2], [1, 10, 76, 5],
  [2, 2, 77, 3], [2, 6, 76, 2], [2, 8, 74, 2], [2, 12, 72, 3], [3, 4, 71, 2], [3, 8, 68, 7]];
const P3 = [[0, 0, 72, 3], [0, 4, 69, 2], [0, 8, 72, 2], [0, 12, 74, 3], [1, 0, 74, 3], [1, 4, 71, 2], [1, 8, 74, 2], [1, 12, 76, 3],
  [2, 0, 76, 6], [2, 10, 79, 2], [2, 12, 76, 3], [3, 8, 74, 2], [3, 10, 72, 2], [3, 12, 69, 4]];
const P4 = [[0, 0, 81, 3], [0, 4, 79, 2], [0, 8, 76, 2], [0, 12, 72, 3], [1, 0, 74, 3], [1, 4, 79, 2], [1, 8, 71, 2], [1, 12, 74, 3],
  [2, 0, 76, 3], [2, 4, 79, 4], [2, 10, 76, 2], [2, 12, 72, 3], [3, 0, 71, 4], [3, 6, 74, 2], [3, 8, 76, 8]];
const ARPS = [[0, 1, 2, 3, 2, 1, 2, 3], [0, 2, 1, 3, 0, 2, 1, 3], [3, 2, 1, 0, 1, 2, 3, 2], [0, 3, 1, 3, 2, 3, 1, 3], [0, 1, 3, 2, 0, 1, 3, 2]];
// The home theme, and the four-bar progressions the in-between sections draw from.
export const HOME = [[['Am9', 'Fmaj9', 'Dm9', 'Em7'], P1], [['Am9', 'Fmaj9', 'Dm9', 'E7'], P2], [['Fmaj9', 'G6', 'Am9', 'Am9'], P3], [['Fmaj9', 'G6', 'Cmaj7', 'E7'], P4]];
export const PROGS = [
  ['Am9', 'Fmaj9', 'Dm9', 'Em7'], ['Am9', 'Fmaj9', 'Dm9', 'E7'], ['Fmaj9', 'G6', 'Am9', 'Am9'], ['Fmaj9', 'G6', 'Cmaj7', 'E7'],
  ['Am9', 'Dm9', 'G6', 'Cmaj7'], ['Fmaj9', 'Em7', 'Dm9', 'E7'], ['Am9', 'G6', 'Fmaj9', 'E7'], ['Dm9', 'G6', 'Cmaj7', 'Am9'],
  ['Fmaj9', 'G6', 'Em7', 'Am9'], ['Dm9', 'Em7', 'Fmaj9', 'G6'], ['Am9', 'Am9', 'Fmaj9', 'Em7'], ['Cmaj7', 'G6', 'Am9', 'Fmaj9'],
];
// Melody rhythms for one bar: [sixteenth, length]. The empty one is a bar's rest.
const RHYTHMS = [
  [[4, 2], [7, 2], [10, 5]], [[0, 3], [4, 2], [8, 2], [12, 3]], [[6, 2], [8, 6]], [[2, 2], [4, 2], [6, 2], [10, 4]],
  [[0, 6], [10, 2], [12, 3]], [[8, 2], [10, 2], [12, 4]], [[0, 2], [3, 2], [6, 4], [12, 2]], [[4, 6], [12, 3]], [],
];
const ENDINGS = [[[0, 4], [6, 2], [8, 8]], [[4, 2], [8, 7]], [[0, 3], [4, 10]], [[2, 2], [4, 2], [8, 8]]];
export const SCALE = [64, 67, 69, 72, 74, 76, 79, 81, 84]; // A minor pentatonic, the melody's range

export function mulberry(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pc = (n) => ((n % 12) + 12) % 12;
/** Pitch classes of a chord's bass note and voicing. */
const chordTones = (name) => new Set([CH[name][0], ...CH[name][1]].map(pc));
/**
 * True if `note` is not a tone of the chord but sits a semitone from one that is (a pentatonic G over E7's G sharp,
 * a C over a chord with B): the one clash a pentatonic melody makes over this chord set, and it grates.
 */
export function clashes(note, name) {
  const tones = chordTones(name);
  return !tones.has(pc(note)) && (tones.has(pc(note + 1)) || tones.has(pc(note - 1)));
}
/**
 * The walking bass for one bar: root, third, fifth, then the seventh (or sixth). Every note is read off the bar's own
 * chord, so it can never leave the chord or the key. (It used to add fixed semitone offsets to the root, which gave a
 * major third under minor chords, a flat seventh under major ones and a leading tone in bar four: out-of-key notes.)
 */
export function walkLine(name) {
  const [root, voicing] = CH[name];
  const above = (lo, hi) => root + voicing.map((n) => pc(n - root)).find((d) => d >= lo && d <= hi);
  return [root, above(3, 4), root + 7, above(9, 11)];
}

// A new melody for four bars: a short motif, answered, repeated with a twist, then resolved.
// It walks the pentatonic scale by step and lands each bar on a note of that bar's chord.
export function writeMelody(prog, rnd) {
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const a = pick(RHYTHMS.slice(0, 8)), b = pick(RHYTHMS);
  const bars = [a, b, rnd() < 0.6 ? a : pick(RHYTHMS.slice(0, 8)), pick(ENDINGS)];
  let idx = 2 + Math.floor(rnd() * 4);
  const notes = [];
  bars.forEach((rhythm, bar) => {
    const [root, voicing] = CH[prog[bar]];
    const tones = new Set([root, ...voicing].map((n) => n % 12));
    rhythm.forEach(([step, len], k) => {
      idx = Math.max(0, Math.min(SCALE.length - 1, idx + pick([-2, -1, -1, 0, 1, 1, 2])));
      if (k === rhythm.length - 1) { // land on a chord tone: search outwards from where we are
        for (const d of [0, -1, 1, -2, 2]) {
          const j = idx + d;
          if (j >= 0 && j < SCALE.length && tones.has(SCALE[j] % 12)) { idx = j; break; }
        }
      }
      // The pentatonic scale has notes a semitone from a chord tone (G over E7's G sharp, C over B in Em7 or G6).
      // Step to the nearest scale note that does not clash with this bar's chord.
      for (const d of [0, 1, -1, 2, -2, 3, -3]) {
        const j = idx + d;
        if (j >= 0 && j < SCALE.length && !clashes(SCALE[j], prog[bar])) { idx = j; break; }
      }
      notes.push([bar, step, SCALE[idx], len]);
    });
  });
  return notes;
}

// Decide how one four-bar section is played. Every fourth section is the written theme;
// the rest are re-rolled. A slow swell of energy thins the band out and builds it back.
function planSection(sec, seed, arpBase) {
  const rnd = mulberry((seed ^ Math.imul(sec + 1, 0x9e3779b1)) | 0);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const home = sec % 4 === 0;
  const energy = 0.5 + 0.5 * Math.sin(sec * 0.86 + (seed % 7)) * 0.8 + (rnd() - 0.5) * 0.3;
  let prog, melody;
  if (home) {
    [prog, melody] = HOME[(sec / 4) % 2 === 0 ? 0 : 1];
  } else if (rnd() < 0.25) {
    [prog, melody] = pick(HOME.slice(2)); // the written B phrases turn up now and then
  } else {
    prog = pick(PROGS);
    melody = rnd() < 0.8 ? writeMelody(prog, rnd) : null; // sometimes the tune just rests
  }
  return {
    prog, melody,
    drums: home ? 'full' : energy < 0.22 ? 'none' : energy < 0.42 ? pick(['light', 'half']) : 'full',
    arp: !home && energy < 0.3 ? null : { shape: ARPS[(arpBase + Math.floor(rnd() * 3)) % ARPS.length], slow: !home && rnd() < 0.25 },
    keys: home ? 0 : pick([0, 0, 1, 2]), // electric-piano rhythm
    bassLine: home ? 0 : pick([0, 0, 1, energy > 0.6 ? 2 : 0]),
    fill: rnd() < 0.45,
    sparkle: !home && rnd() < 0.3,
  };
}

// A long session should not sound like one track. Each venue has its own key, tempo, swing and lead
// voice (its flavour), and within a venue the key moves every six sections (about a minute and a half),
// through keys that sit well next to each other, coming home again at the end of the cycle.
export const DRIFT = [0, 5, -2, 3, -4, 0];
/** The key, in semitones from A minor, for a section of the tune at a venue. */
export const songKey = (flavour, secIdx) => (flavour.key || 0) + DRIFT[Math.floor(Math.max(0, secIdx) / 6) % DRIFT.length];
/** One sixteenth note, in seconds, at a venue's tempo. */
export const sixteenth = (flavour) => S16 / (flavour?.tempo || 1);
/** One bar, in seconds, at a venue's tempo. */
export const barSeconds = (flavour) => sixteenth(flavour) * 16;
export function createMusic(ctx, dest, seed = Math.floor(Math.random() * 1e9)) {
  const plans = new Map(); // section index -> how it is played
  // ---- signal chain ----
  const master = ctx.createBiquadFilter(); // also closed down for tension
  master.type = 'lowpass'; master.frequency.value = 8000; master.Q.value = 0.3;
  master.connect(dest);
  const pump = ctx.createGain(); // ducked on every kick so the chords breathe
  const warm = ctx.createBiquadFilter(); warm.type = 'lowpass'; warm.frequency.value = 6000; warm.Q.value = 0.5;
  pump.connect(warm); warm.connect(master);
  const delay = ctx.createDelay(1); delay.delayTime.value = S16 * 3;
  const fb = ctx.createGain(); fb.gain.value = 0.32;
  const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 1600;
  const dsend = ctx.createGain(); dsend.gain.value = 0.22;
  warm.connect(dsend); dsend.connect(delay); delay.connect(dlp); dlp.connect(fb); fb.connect(delay); dlp.connect(master);
  const len = Math.floor(ctx.sampleRate * 2.4);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) { lp += ((Math.random() * 2 - 1) - lp) * 0.25; d[i] = lp * (1 - i / len) ** 2.6; } // dark tail
  }
  const verb = ctx.createConvolver(); verb.buffer = ir;
  const vsend = ctx.createGain(); vsend.gain.value = 0.5;
  warm.connect(vsend); vsend.connect(verb); verb.connect(master);
  const drums = ctx.createBiquadFilter(); drums.type = 'lowpass'; drums.frequency.value = 7500;
  drums.connect(master);
  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  // slow pitch drift shared by every oscillator, like a slightly tired tape
  const wow = ctx.createOscillator(); wow.frequency.value = 0.23;
  const wowAmt = ctx.createGain(); wowAmt.gain.value = 7; // cents
  wow.connect(wowAmt); wow.start();

  const osc = (type, f, t, stop) => {
    const o = ctx.createOscillator();
    o.type = type; o.frequency.value = f;
    wowAmt.connect(o.detune);
    o.start(t); o.stop(stop);
    return o;
  };

  // electric piano: two-operator FM whose brightness decays, like a struck tine
  function ep(note, t, dur, v) {
    const f = midi(note + key), end = t + dur + 0.5;
    const car = osc('sine', f, t, end), mod = osc('sine', f, t, end);
    const idx = ctx.createGain();
    idx.gain.setValueAtTime(f * 3.2, t);
    idx.gain.exponentialRampToValueAtTime(f * 0.6, t + 0.6);
    mod.connect(idx); idx.connect(car.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + 0.012);
    g.gain.exponentialRampToValueAtTime(v * 0.45, t + 0.5);
    g.gain.setValueAtTime(v * 0.45, t + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.45);
    car.connect(g); g.connect(pump);
  }
  function bass(note, t, dur, v) {
    const f = midi(note + key), end = t + dur + 0.15;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + 0.015);
    g.gain.exponentialRampToValueAtTime(v * 0.6, t + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.12);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    osc('sine', f, t, end).connect(g);
    const tri = osc('triangle', f, t, end), tg = ctx.createGain(); tg.gain.value = 0.9;
    tri.connect(lp); lp.connect(tg); tg.connect(g);
    g.connect(master);
  }
  function pluck(note, t, v) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.5;
    lp.frequency.setValueAtTime(5200, t); lp.frequency.exponentialRampToValueAtTime(700, t + 0.25);
    osc('triangle', midi(note + key), t, t + 0.35).connect(lp); lp.connect(g); g.connect(pump);
  }
  // The melody voice: a soft mallet, an octave below where it is written. Each note is struck
  // and dies away (no held tone, no vibrato), and it is filtered dark so it never pierces.
  function lead(note, t, dur, v) {
    // three voices, all soft: a low mallet, the same an octave up and shorter (glass), or a slower-blooming pad
    const up = voice === 'glass' ? 0 : -12, f = midi(note + key + up), ring = Math.max(0.45, dur + 0.25) * (voice === 'glass' ? 0.7 : voice === 'pad' ? 1.5 : 1);
    if (voice === 'glass') v *= 0.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + (voice === 'pad' ? 0.12 : 0.01));
    g.gain.exponentialRampToValueAtTime(v * 0.3, t + ring * 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ring + 0.4);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1500; lp.Q.value = 0.3;
    osc('sine', f, t, t + ring + 0.5).connect(lp);
    const o2 = osc('sine', f * 2, t, t + 0.3), g2 = ctx.createGain(); // a touch of the octave on the strike only
    g2.gain.setValueAtTime(0.2, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o2.connect(g2); g2.connect(lp);
    lp.connect(g); g.connect(pump);
  }
  function hit(t, { f, q = 1, d, v, type = 'bandpass' }) {
    const s = ctx.createBufferSource(), flt = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; s.loop = true;
    flt.type = type; flt.frequency.value = f; flt.Q.value = q;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    s.connect(flt); flt.connect(g); g.connect(drums);
    s.start(t, (t * 7.3) % 0.9); s.stop(t + d + 0.02);
  }
  function kick(t, v) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(115, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.3);
    pump.gain.setValueAtTime(0.5, t);
    pump.gain.linearRampToValueAtTime(1, t + 0.28);
  }

  // level: 0 = keys and bass only, 1 = + drums and arpeggio, 2 = + melody
  // flavour: { key: semitones to transpose, arp: which arpeggio shapes } — each venue has its own
  let key = 0, voice = 'mallet';
  // level: 0 = keys and bass only, 1 = + drums and arpeggio, 2 = + melody
  function scheduleBar(bar, t0, level, flavour = {}) {
    const secIdx = Math.floor(bar / 4), inSec = bar % 4;
    key = songKey(flavour, secIdx);
    voice = flavour.lead || 'mallet';
    const s16 = sixteenth(flavour);
    if (!plans.has(secIdx)) { plans.set(secIdx, planSection(secIdx, seed, flavour.arp || 0)); plans.delete(secIdx - 3); }
    const plan = plans.get(secIdx);
    const [root, voicing] = CH[plan.prog[inSec]];
    const at = (step) => t0 + step * s16 + (step % 2 ? flavour.swing ?? 0.022 : 0); // lazy sixteenth swing
    const odd = bar % 2 === 1;

    // electric piano
    if (plan.keys === 1) { // one slow rolled chord per bar
      voicing.forEach((n, i) => ep(n, at(0) + i * 0.06, s16 * 12, 0.095));
    } else if (plan.keys === 2) { // pushed: on the one and just before the three
      voicing.forEach((n, i) => ep(n, at(0) + i * 0.012, s16 * 3, 0.1));
      voicing.forEach((n, i) => ep(n, at(7) + i * 0.01, s16 * 3, 0.07));
      voicing.slice(1).forEach((n, i) => ep(n, at(11) + i * 0.01, s16 * 4, 0.06));
    } else {
      voicing.forEach((n, i) => ep(n, at(0) + i * 0.012, s16 * 5, 0.1)); // slightly strummed
      voicing.forEach((n, i) => ep(n, at(6) + i * 0.01, s16 * 6, 0.07));
      if (odd) voicing.slice(1).forEach((n) => ep(n + 12, at(13), s16 * 2, 0.045));
    }
    if (plan.sparkle && inSec === 0) pluck(voicing[3] + 24, at(2), 0.07); // a high note that rings into the echo

    // bass
    if (plan.bassLine === 1) { // held root, then the fifth
      bass(root, at(0), s16 * 7, 0.2);
      bass(root + 7, at(8), s16 * 5, 0.16);
    } else if (plan.bassLine === 2) { // walking in quarter notes up the chord
      walkLine(plan.prog[inSec])
        .forEach((n, q) => bass(n, at(q * 4), s16 * 3.2, q ? 0.15 : 0.2));
    } else {
      bass(root, at(0), s16 * 5, 0.2);
      bass(root, at(6), s16 * 3, 0.16);
      if (odd) bass(root + 12, at(10), s16 * 1.5, 0.14);
      bass(root + 7, at(14), s16 * 1.6, 0.14);
    }

    if (level >= 1) {
      const snare = (s, v = 1) => { hit(at(s), { f: 1700, q: 0.7, d: 0.13, v: 0.17 * v }); hit(at(s), { f: 3800, q: 0.8, d: 0.07, v: 0.16 * v }); };
      const hat = (s, loud) => hit(at(s), { f: 6200, q: 1.2, d: loud ? 0.05 : 0.028, v: loud ? 0.15 : 0.08 });
      if (plan.drums === 'full') {
        kick(at(0), 0.4); kick(at(10), 0.34);
        if (odd) kick(at(7), 0.2);
        snare(4); snare(12);
        for (let s = 0; s < 16; s += 2) hat(s, s % 4 === 2);
      } else if (plan.drums === 'light') { // kick and a rim on four, hats in quarters
        kick(at(0), 0.36); kick(at(10), 0.26);
        snare(12, 0.6);
        for (let s = 0; s < 16; s += 4) hat(s + 2, false);
      } else if (plan.drums === 'half') { // half-time: the backbeat lands on three
        kick(at(0), 0.4);
        if (odd) kick(at(6), 0.22);
        snare(8, 0.9);
        for (let s = 0; s < 16; s += 2) hat(s, false);
      }
      if (plan.drums !== 'none' && inSec === 3) { // lead into the next section
        if (plan.fill) { snare(13, 0.35); snare(14, 0.5); snare(15, 0.7); kick(at(15), 0.25); }
        else hit(at(15), { f: 6200, q: 1.2, d: 0.09, v: 0.11 });
      }
      if (plan.arp) {
        const { shape, slow } = plan.arp;
        if (slow) for (let k = 0; k < 4; k++) pluck(voicing[shape[k]] + 12, at(k * 4), 0.08);
        else shape.forEach((i, k) => pluck(voicing[i] + 12, at(k * 2), k % 4 === 0 ? 0.085 : 0.06));
      }
    }
    if (level >= 2 && plan.melody) {
      for (const [b, s, n, l] of plan.melody) if (b === inSec) lead(n, at(s), l * s16, 0.11);
    }
    return key;
  }
  return { scheduleBar, filter: master };
}
