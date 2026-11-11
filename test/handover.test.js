import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handover, expected } from '../js/handover.js';

const table = (stage) => ({ stage, dealer: 0, handNo: 7, players: [
  { name: 'Joe', chips: 900, total: 100, isHuman: true }, { name: 'Sam', chips: 950, total: 50, isHuman: true },
  { name: 'Gus', chips: 0, total: 0, isHuman: false }, { name: 'Al', chips: 1960, total: 40, isHuman: true }] });
const sum = (ps) => ps.reduce((a, p) => a + p.chips, 0);

test('the new host sits in seat 0 and the order round the table is kept', () => {
  const r = handover(table('betting'), 1);
  assert.deepEqual(r.players.map((p) => p.name), ['Sam', 'Gus', 'Al', 'Joe']);
  assert.equal(r.dealer, 3);
});
test('a hand in progress is voided: bets go back and no chips are made or lost', () => {
  const r = handover(table('betting'), 3);
  assert.equal(sum(r.players), 4000);
  assert.deepEqual(r.players.map((p) => p.chips), [2000, 1000, 1000, 0]);
  assert.equal(r.handNo, 6); // the voided hand is dealt again
  assert.equal(r.players[0].total, undefined);
});
test('between hands the stacks are final and nothing is refunded', () => {
  const r = handover(table('handOver'), 0);
  assert.deepEqual(r.players.map((p) => p.chips), [900, 950, 0, 1960]);
  assert.equal(r.handNo, 7);
});
test('the new host expects back the other people who still have chips', () => {
  assert.deepEqual(expected(handover(table('betting'), 1)).map((p) => [p.name, p.seat]), [['Al', 2]]); // not Joe: he was the host who vanished
  const broke = table('handOver'); broke.players[3].chips = 0;
  assert.deepEqual(expected(handover(broke, 1)), []);
  assert.equal(handover(table('betting'), 1).players[3].wasHost, true);
});
