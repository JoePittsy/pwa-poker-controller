import { test } from 'node:test';
import assert from 'node:assert/strict';
import { payout, setBonus, stackFactor, nextHeat, familyCount, PERKS, FAMILIES } from '../js/build.js';

test('no perks pay nothing', () => {
  assert.equal(payout({}, { won: 500, showdown: true, kos: 2, category: 6 }).total, 0);
});
test('each perk pays for its own kind of pot', () => {
  assert.equal(payout({ rakeback: 1 }, { won: 200 }).total, 20);
  assert.equal(payout({ bully: 1 }, { won: 200, showdown: false }).total, 30);
  assert.equal(payout({ bully: 1 }, { won: 200, showdown: true }).total, 0);
  assert.equal(payout({ showman: 1 }, { won: 200, showdown: true }).total, 40);
  assert.equal(payout({ madehand: 1 }, { won: 200, showdown: true, category: 3 }).total, 100);
  assert.equal(payout({ madehand: 1 }, { won: 200, showdown: true, category: 2 }).total, 0);
  assert.equal(payout({ hunter: 2 }, { won: 0, kos: 1 }).total, 200);
});
test('a lost hand pays nothing but knock-outs', () => {
  assert.equal(payout({ rakeback: 2, showman: 1, bully: 1 }, { won: 0, showdown: true }).total, 0);
});
test('perks of one family strengthen each other', () => {
  assert.equal(setBonus({ rakeback: 1 }, 'value'), 1);
  assert.equal(setBonus({ rakeback: 1, showman: 1 }, 'value'), 1.5);
  assert.equal(setBonus({ rakeback: 2, showman: 1 }, 'value'), 1.5); // copies of one perk are not a set
  assert.equal(setBonus({ rakeback: 1, showman: 1, madehand: 1 }, 'value'), 2);
  assert.equal(payout({ rakeback: 1, showman: 1 }, { won: 200, showdown: true }).total, Math.round(20 * 1.5) + Math.round(40 * 1.5));
  assert.equal(payout({ rakeback: 1, bully: 1 }, { won: 200, showdown: false }).total, 20 + 30); // different families: no bonus
});
test('heat only counts with Heater, and is capped', () => {
  assert.equal(payout({ rakeback: 1 }, { won: 200 }, 4).total, 20);
  assert.equal(payout({ rakeback: 1, heater: 1 }, { won: 200 }, 3).total, 26);
  assert.equal(payout({ rakeback: 1, heater: 1 }, { won: 200 }, 99).total, 30);
});
test('heat builds on pots won, survives folds, and goes out on a lost showdown', () => {
  assert.equal(nextHeat(2, { won: 50 }), 3);
  assert.equal(nextHeat(5, { won: 50 }), 5);
  assert.equal(nextHeat(3, { won: 0, showdown: true, folded: true }), 3);
  assert.equal(nextHeat(3, { won: 0, showdown: false }), 3);
  assert.equal(nextHeat(3, { won: 0, showdown: true, folded: false }), 0);
});
test('staying-power perks raise the starting stack', () => {
  assert.equal(stackFactor({}), 1);
  assert.equal(stackFactor({ bigstack: 1 }), 1.3);
  assert.equal(stackFactor({ bigstack: 1, lifeline: 1 }), 1.3 + 0.1);
  assert.equal(stackFactor({ lifeline: 1, slowblinds: 2 }), 1.1);
  assert.equal(stackFactor({ bigstack: 1, lifeline: 1, slowblinds: 1 }), 1.5);
});
test('every perk names a real family, and junk counts are ignored', () => {
  for (const p of Object.values(PERKS)) assert.ok(!p.family || FAMILIES[p.family]);
  assert.equal(familyCount({ rakeback: 'x', showman: -2, madehand: 1.9 }, 'value'), 1);
});
