import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judge, habitOf, leaks, worstOf } from '../js/coach.js';

const D = (type, eq, need, extra = {}) => ({ type, street: 'flop', eq, need, toCall: 50, to: 100, ...extra });
test('a call is judged against its price', () => {
  assert.equal(judge(D('call', 0.15, 0.3))[0], 'bad');
  assert.equal(judge(D('call', 0.35, 0.3))[0], 'good');
  assert.equal(judge(D('call', 0.8, 0.3))[0], 'meh');
});
test('a fold is only a mistake when the price was clearly good', () => {
  assert.equal(judge(D('fold', 0.5, 0.2))[0], 'bad');
  assert.equal(judge(D('fold', 0.25, 0.2))[0], 'good');
});
test('each decision falls into one habit', () => {
  assert.equal(habitOf(D('call', 0.15, 0.3)), 'looseCall');
  assert.equal(habitOf(D('fold', 0.5, 0.2)), 'tightFold');
  assert.equal(habitOf(D('check', 0.8, 0)), 'missedValue');
  assert.equal(habitOf(D('call', 0.8, 0.3)), 'missedValue');
  assert.equal(habitOf(D('raise', 0.2, 0)), 'bluff');
  assert.equal(habitOf(D('raise', 0.5, 0)), 'thinBet');
  assert.equal(habitOf(D('raise', 0.7, 0)), 'sound');
});
test('a session adds up into leaks, mistakes first, with what they cost', () => {
  const r = leaks([{ mine: [D('call', 0.1, 0.3, { toCall: 80 }), D('call', 0.1, 0.3, { toCall: 20 }), D('check', 0.8, 0)] }, { mine: [D('fold', 0.2, 0.3)] }, { mine: [] }]);
  assert.equal(r.total, 4);
  assert.equal(r.hands, 2);
  assert.equal(r.sound, 0.25);
  assert.deepEqual(r.list.map((l) => [l.key, l.count, l.cost]), [['looseCall', 2, 100], ['missedValue', 1, 0], ['sound', 1, 0]]);
  assert.match(r.headline, /calling too loose/);
});
test('a clean session and an empty one are both handled', () => {
  assert.match(leaks([{ mine: [D('fold', 0.2, 0.3)] }]).headline, /Nothing to fix/);
  assert.deepEqual(leaks([]), { total: 0, hands: 0, sound: 0, headline: '', list: [] });
});
test('the coach picks the worst mistake in a hand, or stays quiet', () => {
  const w = worstOf({ mine: [D('call', 0.25, 0.35), D('call', 0.05, 0.4, { street: 'river' }), D('fold', 0.2, 0.3)] });
  assert.equal(w.street, 'river');
  assert.equal(worstOf({ mine: [D('fold', 0.2, 0.3), D('raise', 0.2, 0)] }), null);
  assert.equal(worstOf(null), null);
});
