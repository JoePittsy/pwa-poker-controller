import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readBank, pay, sit, cashOut, prize, restake, runFee, START, TOPUP, SNG, RUN_FEE, FREE_RUNS } from '../js/bank.js';

test('a new player starts with the starting bankroll; odd stored values are tolerated', () => {
  assert.deepEqual(readBank(null), { chips: START, rung: 0, stake: 0 });
  assert.deepEqual(readBank('{broken'), { chips: START, rung: 0, stake: 0 });
  assert.deepEqual(readBank('{"chips":-5,"rung":"x"}'), { chips: START, rung: 0, stake: 0 });
  assert.deepEqual(readBank('{"chips":750.9,"rung":3,"seat":400}'), { chips: 750, rung: 3, stake: 0, seat: 400 });
});
test('sitting down moves the buy-in to the table and getting up brings back what is left', () => {
  const b = readBank(null);
  assert.equal(sit(b, 1000), true);
  assert.deepEqual(b, { chips: START - 1000, rung: 0, stake: 0, seat: 1000 });
  b.seat = 1640; // a good session
  assert.equal(cashOut(b), 1640);
  assert.deepEqual(b, { chips: START - 1000 + 1640, rung: 0, stake: 0 });
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
  assert.equal(restake(readBank('{"chips":500}')), 0);
  assert.equal(restake(readBank('{"chips":0,"seat":300}')), 0);
  assert.equal(pay(readBank('{"chips":150}'), 200), false);
});
test('the house also restakes you when you cannot afford a run, even if you could afford a sit-and-go', () => {
  const b = readBank(`{"chips":${RUN_FEE - 1}}`);
  assert.ok(b.chips >= SNG.buyin);
  assert.equal(restake(b), TOPUP - (RUN_FEE - 1));
  assert.equal(b.chips, TOPUP);
  assert.equal(restake(readBank('{"chips":200}')), TOPUP - 200);
  assert.equal(restake(readBank(`{"chips":${RUN_FEE},"stake":0}`)), 0);
});
test('the first runs are free, then a run costs the fee', () => {
  assert.deepEqual([0, 1, 2].map(runFee), [0, 0, 0]);
  assert.equal(FREE_RUNS, 3);
  assert.deepEqual([3, 4, 50].map(runFee), [RUN_FEE, RUN_FEE, RUN_FEE]);
  assert.equal(RUN_FEE, 500);
});
test('the fee paid for the run in progress survives being stored and read back, tolerantly', () => {
  const b = readBank('{"chips":1500}');
  assert.equal(pay(b, 500), true);
  b.stake = 500;
  assert.equal(readBank(JSON.stringify(b)).stake, 500);
  assert.equal(readBank('{"chips":10}').stake, 0);
  assert.equal(readBank('{"stake":"x"}').stake, 0);
  assert.equal(readBank('{"stake":-4}').stake, 0);
  assert.equal(readBank('{"stake":500.7}').stake, 500);
});
