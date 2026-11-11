import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DRIFT, songKey, sixteenth, barSeconds, BAR } from '../js/music.js';

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
