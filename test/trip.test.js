import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEALS, dealsFor, newTrip, readTrip, cashOut, PRICES, spend, takeHome, tableMods, RISKY, BOOST, speedBonus, canWalk, clearedCount, fastPar, quickPar } from '../js/trip.js';

test('a regular trip starts with an empty pocket; Backed starts with money', () => {
  assert.deepEqual(newTrip(), { deal: 'regular', pocket: 0, banked: 0, spent: 0, boost: 0, bribe: 0, risky: 0, buyin: 0, walked: 0 });
  assert.equal(newTrip('backed').pocket, 2000);
  assert.equal(newTrip('nonsense').deal, 'regular');
});
test('deals unlock with rank, and two are open from the start', () => {
  assert.deepEqual(dealsFor(0).filter((d) => !d.locked).map((d) => d.key), ['regular', 'short']);
  assert.equal(dealsFor(3).every((d) => !d.locked), true);
});
test('cashing out banks what you won beyond your own buy-in', () => {
  const t = { ...newTrip(), buyin: 1000 };
  assert.equal(cashOut(t, 1, 4000), 3000);
  assert.equal(cashOut(t, 1, 800), 0);
});
test('the deal and the hard route change the cash-out', () => {
  assert.equal(cashOut({ ...newTrip('short'), buyin: 600 }, 2, 3600), 4500);
  assert.equal(cashOut({ ...newTrip('backed'), buyin: 1000 }, 2, 4000), 1500);
  assert.equal(cashOut({ ...newTrip(), buyin: 1000, risky: 3 }, 3, 5000), 4000 * RISKY.cash);
  assert.equal(cashOut({ ...newTrip(), buyin: 1000, risky: 3 }, 4, 5000), 4000); // the route was for another table
});
test('perks cost more the more you hold, rerolls more each time, and Speed Freak pays less', () => {
  const t = newTrip();
  assert.deepEqual([0, 1, 3].map((n) => PRICES.perk(t, n)), [1200, 1600, 2400]);
  assert.deepEqual([0, 1, 2].map((n) => PRICES.reroll(t, n)), [200, 400, 600]);
  assert.equal(PRICES.perk(newTrip('speed'), 0), 850);
  assert.ok(PRICES.bribe(t) > PRICES.boost(t));
});
test('you cannot spend what you do not have', () => {
  const t = { ...newTrip(), pocket: 1000 };
  assert.equal(spend(t, 1200), false);
  assert.equal(t.pocket, 1000);
  assert.equal(spend(t, 600), true);
  assert.deepEqual([t.pocket, t.spent], [400, 600]);
});
test('a quarter of the pocket goes home at the end', () => {
  assert.equal(takeHome({ pocket: 4000 }), 1000);
  assert.equal(takeHome({ pocket: 55 }), 10);
  assert.equal(takeHome(null), 0);
});
test('a boost, a bribe and the hard route each apply to one table only', () => {
  const t = { ...newTrip('shark'), boost: 2, bribe: 2, risky: 3 };
  assert.deepEqual(tableMods(t, 2), { stack: BOOST, oppStack: 1.3, skill: 0.15, blinds: 1, payout: 2, fewer: 1 });
  const m3 = tableMods(t, 3);
  assert.deepEqual([m3.stack, m3.fewer, m3.skill], [1, 0, 0.15 + RISKY.skill]);
  assert.equal(m3.oppStack, 1.3 * RISKY.oppStack);
  assert.deepEqual(tableMods(newTrip('speed'), 1), { stack: 1, oppStack: 1, skill: 0, blinds: 0.5, payout: 1, fewer: 0 });
});
test('a saved trip is made safe to use', () => {
  assert.deepEqual(readTrip(undefined), newTrip());
  assert.deepEqual(readTrip({ deal: 'short', pocket: '1500', spent: -4, risky: 'x', boost: 2.9 }), { ...newTrip('short'), pocket: 1500, boost: 2 });
  for (const d of Object.values(DEALS)) assert.ok(d.name && d.text);
});

test('a fast clear pays more, scaled to the size of the table', () => {
  assert.deepEqual([fastPar(3), quickPar(3)], [24, 39]);
  assert.deepEqual([24, 25, 39, 40].map((h) => speedBonus(h, 3)), [0.5, 0.25, 0.25, 0]);
  assert.equal(speedBonus(30, 5), 0.5);
  assert.equal(cashOut({ ...newTrip(), buyin: 1000 }, 1, 4000, 0.5), 4500);
});
test('you may walk away once half your opponents are out, but not before, not at the end, and never from a boss', () => {
  const T = (...chips) => chips.map((c) => ({ chips: c }));
  assert.equal(canWalk(T(2000, 1000, 1000, 0), 0, false), false); // one of three
  assert.equal(canWalk(T(3000, 1000, 0, 0), 0, false), true); // two of three
  assert.equal(canWalk(T(2500, 0, 800, 700, 0), 0, false), true); // two of four
  assert.equal(canWalk(T(4000, 0, 0, 0), 0, false), false); // it is already won
  assert.equal(canWalk(T(0, 1000, 0, 0), 0, false), false); // nothing to walk with
  assert.equal(canWalk(T(1500, 500), 0, true), false); // a boss
  assert.equal(canWalk(T(900, 0, 1100), 2, false), true); // your seat need not be 0
});
test('tables you walked away from do not count as cleared', () => {
  assert.equal(clearedCount({ walked: 1 }, 3), 2);
  assert.equal(clearedCount(null, 3), 3);
  assert.equal(clearedCount({ walked: 5 }, 2), 0);
  assert.equal(readTrip({ walked: 2 }).walked, 2);
});
