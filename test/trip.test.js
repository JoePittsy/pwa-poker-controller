import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEALS, dealsFor, newTrip, readTrip, cashOut, PRICES, spend, takeHome, tableMods, RISKY, BOOST } from '../js/trip.js';

test('a regular trip starts with an empty pocket; Backed starts with money', () => {
  assert.deepEqual(newTrip(), { deal: 'regular', pocket: 0, banked: 0, spent: 0, boost: 0, bribe: 0, risky: 0, buyin: 0 });
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
