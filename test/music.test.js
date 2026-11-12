import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DRIFT, songKey, sixteenth, barSeconds, BAR, CH, HOME, PROGS, SCALE, clashes, walkLine, writeMelody, mulberry } from '../js/music.js';

test('the key stays put within a block of six sections, then moves', () => {
  const f = { key: 3 };
  assert.deepEqual([0, 5].map((s) => songKey(f, s)), [3, 3]);
  assert.equal(songKey(f, 6), 3 + DRIFT[1]);
  assert.notEqual(songKey(f, 6), songKey(f, 5));
});
test('the key comes home at the end of the cycle and the cycle repeats', () => {
  assert.equal(DRIFT[0], 0);
  assert.equal(DRIFT.at(-1), 0);
  assert.equal(songKey({ key: -2 }, 6 * DRIFT.length), -2);
  assert.equal(songKey({ key: -2 }, 6 * DRIFT.length + 6), songKey({ key: -2 }, 6));
});
test('no key change is more than a fifth from the venue key, and each step is a small move', () => {
  for (const d of DRIFT) assert.ok(Math.abs(d) <= 5);
  for (let i = 1; i < DRIFT.length; i++) assert.ok(Math.abs(DRIFT[i] - DRIFT[i - 1]) <= 7);
});
test('tempo scales the bar; a venue with no tempo plays at the written speed', () => {
  assert.equal(barSeconds({}), BAR);
  assert.equal(barSeconds(undefined), BAR);
  assert.ok(Math.abs(barSeconds({ tempo: 1.1 }) - BAR / 1.1) < 1e-9);
  assert.equal(sixteenth({ tempo: 2 }) * 16, BAR / 2);
});

const pc = (n) => ((n % 12) + 12) % 12;
const A_MINOR = new Set([9, 11, 0, 2, 4, 5, 7]); // natural minor, as pitch classes (written key of A)
const tonesOf = (name) => new Set([CH[name][0], ...CH[name][1]].map(pc));
const allChords = new Set([...PROGS.flat(), ...HOME.flatMap(([prog]) => prog)]);

test('clashes() finds the semitone grind against a chord tone, and nothing else', () => {
  assert.ok(clashes(67, 'E7')); // G natural over E7's G sharp
  assert.ok(clashes(72, 'Em7')); // C over the B
  assert.ok(clashes(72, 'G6'));
  assert.ok(!clashes(67, 'Am9')); // a chord tone is never a clash
  assert.ok(!clashes(72, 'Am9')); // even when its neighbour is also a chord tone
  assert.ok(!clashes(74, 'Fmaj9'));
});
test('the walking bass is root, third, fifth, seventh of the bar\'s own chord, going up', () => {
  for (const name of allChords) {
    const line = walkLine(name), tones = tonesOf(name);
    assert.equal(line[0], CH[name][0]);
    for (const n of line) assert.ok(tones.has(pc(n)), `${name}: ${n} is not a chord tone`);
    for (const n of line) assert.ok(A_MINOR.has(pc(n)) || tones.has(pc(n)), `${name}: ${n} is outside the key`);
    assert.deepEqual([...line].sort((a, b) => a - b), line, `${name} does not ascend`);
    assert.equal(new Set(line.map(pc)).size, 4);
  }
  assert.deepEqual(walkLine('Am9').map(pc), [9, 0, 4, 7]); // A C E G: a minor third under a minor chord
  assert.deepEqual(walkLine('Dm9').map(pc), [2, 5, 9, 0]); // D F A C, not D F# A C
  assert.deepEqual(walkLine('E7').map(pc), [4, 8, 11, 2]);
});
test('generated melodies never clash with their bar\'s chord and stay in the scale or chord', () => {
  for (const prog of PROGS) for (let seed = 1; seed <= 150; seed++) {
    for (const [bar, , note] of writeMelody(prog, mulberry(seed * 7919))) {
      const name = prog[bar];
      assert.ok(!clashes(note, name), `seed ${seed} ${prog.join(' ')} bar ${bar}: ${note} clashes with ${name}`);
      assert.ok(A_MINOR.has(pc(note)) || tonesOf(name).has(pc(note)));
      assert.ok(note >= SCALE[0] && note <= SCALE.at(-1));
    }
  }
});
test('the written home phrases do not clash either', () => {
  for (const [prog, melody] of HOME) for (const [bar, , note] of melody) assert.ok(!clashes(note, prog[bar]), `${prog[bar]}: ${note}`);
});
