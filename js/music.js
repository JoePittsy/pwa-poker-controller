// Background music: a composed (not random) slow lo-fi groove in A minor, synthesised live.
// Design goals: sit under the game for an hour without fatigue. So: soft electric-piano
// chords, round bass, quiet brushed drums, everything low-passed, a gentle "tape" pitch drift,
// and a written melody that only comes in once a hand is under way.
// Works with any BaseAudioContext so it can also be rendered offline for checking.
export const BPM = 82;
const S16 = 60 / BPM / 4; // one sixteenth note
export const BAR = S16 * 16;
const midi = (n) => 440 * 2 ** ((n - 69) / 12);

// name: [bass note, electric-piano voicing]
const CH = {
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
const SECTIONS = [
  [['Am9', 'Fmaj9', 'Dm9', 'Em7'], P1], [['Am9', 'Fmaj9', 'Dm9', 'E7'], P2],
  [['Fmaj9', 'G6', 'Am9', 'Am9'], P3], [['Fmaj9', 'G6', 'Cmaj7', 'E7'], P4],
  [['Am9', 'Fmaj9', 'Dm9', 'Em7'], null], [['Am9', 'Fmaj9', 'Dm9', 'E7'], P2],
];
const ARPS = [[0, 1, 2, 3, 2, 1, 2, 3], [0, 2, 1, 3, 0, 2, 1, 3], [3, 2, 1, 0, 1, 2, 3, 2], [0, 3, 1, 3, 2, 3, 1, 3], [0, 1, 3, 2, 0, 1, 3, 2]];

export function createMusic(ctx, dest) {
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
  function lead(note, t, dur, v) {
    const f = midi(note + key), end = t + dur + 0.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + 0.03);
    g.gain.setValueAtTime(v, t + Math.max(0.03, dur - 0.05));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.3);
    const o = osc('sine', f, t, end);
    const vib = ctx.createOscillator(), va = ctx.createGain();
    vib.frequency.value = 5.2;
    va.gain.setValueAtTime(0, t); va.gain.linearRampToValueAtTime(9, t + 0.35);
    vib.connect(va); va.connect(o.detune); vib.start(t); vib.stop(end);
    o.connect(g);
    const o2 = osc('triangle', f * 2, t, end), g2 = ctx.createGain(); g2.gain.value = 0.25;
    o2.connect(g2); g2.connect(g);
    g.connect(pump);
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
  // flavour: { key: semitones to transpose, arp: which arpeggio shape } — each venue has its own
  let key = 0;
  function scheduleBar(bar, t0, level, flavour = {}) {
    key = flavour.key || 0;
    const ARP = ARPS[(flavour.arp || 0) % ARPS.length];
    const sec = SECTIONS[Math.floor(bar / 4) % SECTIONS.length];
    const inSec = bar % 4;
    const [root, voicing] = CH[sec[0][inSec]];
    const at = (step) => t0 + step * S16 + (step % 2 ? 0.022 : 0); // lazy sixteenth swing
    const odd = bar % 2 === 1;

    voicing.forEach((n, i) => ep(n, at(0) + i * 0.012, S16 * 5, 0.1)); // slightly strummed
    voicing.forEach((n, i) => ep(n, at(6) + i * 0.01, S16 * 6, 0.07));
    if (odd) voicing.slice(1).forEach((n) => ep(n + 12, at(13), S16 * 2, 0.045));

    bass(root, at(0), S16 * 5, 0.2);
    bass(root, at(6), S16 * 3, 0.16);
    if (odd) bass(root + 12, at(10), S16 * 1.5, 0.14);
    bass(root + 7, at(14), S16 * 1.6, 0.14);

    if (level >= 1) {
      kick(at(0), 0.4); kick(at(10), 0.34);
      if (odd) kick(at(7), 0.2);
      for (const s of [4, 12]) { // brushed backbeat
        hit(at(s), { f: 1700, q: 0.7, d: 0.13, v: 0.17 });
        hit(at(s), { f: 3800, q: 0.8, d: 0.07, v: 0.16 });
      }
      for (let s = 0; s < 16; s += 2) hit(at(s), { f: 6200, q: 1.2, d: s % 4 === 2 ? 0.05 : 0.028, v: s % 4 === 2 ? 0.15 : 0.08 });
      if (inSec === 3) hit(at(15), { f: 6200, q: 1.2, d: 0.09, v: 0.11 });
      ARP.forEach((i, k) => pluck(voicing[i] + 12, at(k * 2), k % 4 === 0 ? 0.085 : 0.06));
    }
    if (level >= 2 && sec[1]) {
      for (const [b, s, n, l] of sec[1]) if (b === inSec) lead(n, at(s), l * S16, 0.12);
    }
  }
  return { scheduleBar, filter: master };
}
