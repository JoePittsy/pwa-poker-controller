import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBackup, readBackup, applyBackup } from '../js/backup.js';

const store = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), all: () => Object.fromEntries(m) }; };

test('a backup restores exactly what was saved', () => {
  const a = store({ 'padpoker.prefs': '{"name":"Zoë"}', 'padpoker.stats': '{"hands":12}', 'padpoker.best': '5', 'padpoker.seat': '{"code":"12345"}', other: 'x' });
  const b = store({ 'padpoker.save': '{"table":3}', 'padpoker.relay': 'ws://x' });
  applyBackup(b, readBackup(makeBackup(a)));
  assert.deepEqual(b.all(), { 'padpoker.prefs': '{"name":"Zoë"}', 'padpoker.stats': '{"hands":12}', 'padpoker.best': '5', 'padpoker.relay': 'ws://x' });
});

test('the online seat and relay are never put in a backup', () => {
  const text = makeBackup(store({ 'padpoker.seat': '{"key":"secret"}', 'padpoker.relay': 'ws://x', 'padpoker.best': '2' }));
  assert.deepEqual(Object.keys(readBackup(text).data), ['best']);
});

test('line breaks and spaces picked up when pasting are ignored', () => {
  const text = makeBackup(store({ 'padpoker.best': '4' }));
  assert.equal(readBackup(`  ${text.slice(0, 14)}\n${text.slice(14)} `).data.best, '4');
});

test('things that are not backups are refused with a reason', () => {
  assert.throws(() => readBackup('hello'), /not a PokerPad backup/);
  assert.throws(() => readBackup('POKERPAD1:%%%'), /damaged/);
  assert.throws(() => readBackup(makeBackup(store({ 'padpoker.best': '4' })).slice(0, -6)), /damaged/);
  assert.throws(() => readBackup(makeBackup(store({}))), /empty/);
});
