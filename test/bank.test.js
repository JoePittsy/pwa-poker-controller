import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readBank, pay, sit, cashOut, prize, restake, START, TOPUP, SNG } from '../js/bank.js';

test('a new player starts with the starting bankroll; odd stored values are tolerated', () => {
  assert.deepEqual(readBank(null), { chips: START, rung: 0 });
  assert.deepEqual(readBank('{broken'), { chips: START, rung: 0 });
  assert.deepEqual(readBank('{"chips":-5,"rung":"x"}'), { chips: START, rung: 0 });
  assert.deepEqual(readBank('{"chips":750.9,"rung":3,"seat":400}'), { chips: 750, rung: 3, seat: 400 });
});
test('sitting down moves the buy-in to the table and getting up brings back what is left', () => {
  const b = readBank(null);
  assert.equal(sit(b, 1000), true);
  assert.deepEqual(b, { chips: START - 1000, rung: 0, seat: 1000 });
  b.seat = 1640; // a good session
  assert.equal(cashOut(b), 1640);
  assert.deepEqual(b, { chips: START - 1000 + 1640, rung: 0 });
});
test('you cannot buy in for more than you have, or sit at two tables', () => {
  const b = readBank('{"chips":500}');
  assert.equal(sit(b, 1000), false);
  assert.equal(b.chips, 500);
  assert.equal(sit(b, 500), true);
  assert.equal(sit(b, 0), false);
});
test('chips left on a table when the app closed are not lost', () => {
  const b = readBank('{"chips":1000,"seat":830}');
  assert.equal(cashOut(b), 830);
  assert.equal(b.chips, 1830);
  assert.equal(cashOut(b), 0);
});
test('a sit-and-go pays out exactly what went in', () => {
  assert.equal(SNG.prizes.reduce((a, c) => a + c, 0), SNG.buyin * 6);
  assert.deepEqual([1, 2, 3, 4, 6].map(prize), [600, 360, 240, 0, 0]);
});
test('the house restakes you only when you are broke and not sitting anywhere', () => {
  const broke = readBank('{"chips":120}');
  assert.equal(restake(broke), TOPUP - 120);
  assert.equal(broke.chips, TOPUP);
  assert.equal(restake(readBank('{"chips":200}')), 0);
  assert.equal(restake(readBank('{"chips":0,"seat":300}')), 0);
  assert.equal(pay(readBank('{"chips":150}'), 200), false);
});
