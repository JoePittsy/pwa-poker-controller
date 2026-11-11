import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judge, habitOf, leaks, worstOf, facingBet, rangeEquity } from '../js/coach.js';
import { equity } from '../js/ai.js';

const D = (type, eq, need, extra = {}) => ({ type, street: 'flop', eq, need, toCall: 50, to: 100, ...extra });
test('a call is judged against its price', () => {
  assert.equal(judge(D('call', 0.15, 0.3))[0], 'bad');
  assert.equal(judge(D('call', 0.4, 0.3))[0], 'good');
  assert.equal(judge(D('call', 0.8, 0.3))[0], 'meh');
});
test('a fold is only a mistake when the price was clearly good', () => {
  assert.equal(judge(D('fold', 0.6, 0.2))[0], 'bad');
  assert.equal(judge(D('fold', 0.25, 0.2))[0], 'good');
});
test('each decision falls into one habit', () => {
  assert.equal(habitOf(D('call', 0.15, 0.3)), 'looseCall');
  assert.equal(habitOf(D('fold', 0.6, 0.2)), 'tightFold');
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

test('a call a little short of its price is marginal, not fair', () => {
  assert.equal(judge(D('call', 0.22, 0.3))[0], 'meh');
  assert.match(judge(D('call', 0.22, 0.3))[2], /marginal/);
  assert.equal(habitOf(D('call', 0.22, 0.3)), 'looseCall');
  assert.equal(judge(D('call', 0.36, 0.3))[0], 'good');
});
test('the chance shown is marked down when facing a bet, by its size and the street', () => {
  assert.equal(facingBet(0.5, 0, 100), 0.5);
  assert.ok(Math.abs(facingBet(0.5, 100, 200) - 0.3) < 1e-9); // a pot-sized bet on the flop: four tenths off
  assert.ok(facingBet(0.5, 20, 120) > facingBet(0.5, 100, 200));
  assert.ok(facingBet(0.5, 100, 200, 'river') < facingBet(0.5, 100, 200, 'flop'));
  assert.ok(facingBet(0.5, 5000, 5100, 'river') >= 0.5 * 0.4 - 1e-9); // never more than six tenths off
});
test('folding to a big river bet with a modest hand is not called a mistake', () => {
  // 375 into 460 on the river holding a hand that beats random cards 71% of the time
  const eq = facingBet(0.71, 375, 835, 'river');
  assert.ok(eq < 0.45, `still ${eq}`);
  assert.equal(judge(D('fold', eq, 375 / (835 + 375)))[0], 'good');
});

test('a call within five points of the price is a close call either way', () => {
  for (const eq of [0.25, 0.29, 0.3, 0.34]) {
    const [kind, , why] = judge(D('call', eq, 0.3));
    assert.equal(kind, 'meh');
    assert.match(why, /A close call: about \d+% to win against the 30% it needed\. Either choice was fine\./);
    assert.equal(habitOf(D('call', eq, 0.3)), 'sound');
  }
  assert.equal(judge(D('call', 0.36, 0.3))[0], 'good');
});
test('a fold is only called a mistake when you were also better than even', () => {
  assert.equal(judge(D('fold', 0.45, 0.2))[0], 'good'); // 25 points over the price, but under 50%
  assert.equal(judge(D('fold', 0.55, 0.2))[0], 'bad');
});

// ---- rangeEquity ----
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const card = (r, s) => ('23456789TJQKA'.indexOf(r) << 2) | 'shdc'.indexOf(s);
const hands = (str) => str.split(' ').map((x) => card(x[0], x[1]));
const careful = { loose: 0.25, pressure: 1 }, wild = { loose: 0.8, pressure: 0 };

test('bottom pair against a careful bettor is far worse than against a loose checker', () => {
  const hole = hands('2s 7d'), board = hands('2h Jc Kd 9s');
  const tight = rangeEquity(hole, board, [careful], 600, mulberry32(1));
  const loose = rangeEquity(hole, board, [wild], 600, mulberry32(1));
  assert.ok(tight < 0.25, `tight ${tight}`);
  assert.ok(loose - tight >= 0.2, `loose ${loose} tight ${tight}`);
});
test('pocket aces stay strong against a big bettor', () => {
  assert.ok(rangeEquity(hands('As Ad'), [], [{ loose: 0.25, pressure: 1 }], 600, mulberry32(2)) > 0.7);
});
test('an opponent who has only limped and plays anything is a random hand', () => {
  const hole = hands('Kh Qd'), board = hands('Ts 4c 2d');
  const a = rangeEquity(hole, board, [{ loose: 1, pressure: 0 }], 2000, mulberry32(3));
  const b = equity(hole, board, 1, 2000, mulberry32(4));
  assert.ok(Math.abs(a - b) < 0.06, `${a} vs ${b}`);
});
test('rangeEquity is repeatable for a seed and leaves its inputs alone', () => {
  const hole = hands('Qs Jh'), board = hands('Th 9d 2c'), opps = [careful, wild, { loose: 0.5, pressure: 0.5 }];
  const copy = JSON.stringify([hole, board, opps]);
  const a = rangeEquity(hole, board, opps, 200, mulberry32(7));
  assert.equal(a, rangeEquity(hole, board, opps, 200, mulberry32(7)));
  assert.equal(JSON.stringify([hole, board, opps]), copy);
  assert.ok(a >= 0 && a <= 1);
});
test('omaha falls back to random hands', () => {
  const hole = hands('As Ad Kh Kd');
  assert.equal(rangeEquity(hole, [], [careful], 100, mulberry32(5), 'omaha'), equity(hole, [], 1, 100, mulberry32(5), 'omaha'));
});
