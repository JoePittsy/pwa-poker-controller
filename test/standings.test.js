import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placings, addGame, table, readLog, addLog, tally, placeOf } from '../js/standings.js';

test('finishing order is the winner, then last out to first out', () => {
  assert.deepEqual(placings('Joe', ['Gus', 'Sam', 'Al']), ['Joe', 'Al', 'Sam', 'Gus']);
  assert.deepEqual(placings('Joe', ['Gus', 'Gus', 'Joe']), ['Joe', 'Gus']);
});
test('a session adds up points and wins across games', () => {
  let s = addGame(null, ['Joe', 'Sam', 'Al', 'Gus']);
  s = addGame(s, ['Sam', 'Joe', 'Gus', 'Al']);
  s = addGame(s, ['Sam', 'Al']);
  assert.equal(s.games, 3);
  assert.deepEqual(table(s).map((r) => [r.name, r.points, r.wins, r.games]), [['Sam', 13, 2, 3], ['Joe', 8, 1, 2], ['Al', 6, 0, 3], ['Gus', 3, 0, 2]]);
  assert.deepEqual(table(null), []);
});
test('the record keeps the newest games, and reads back what it wrote', () => {
  let log = [];
  for (let i = 0; i < 45; i++) log = addLog(log, { at: i, order: ['Joe', 'Sam'], me: 'Sam', hands: 12 });
  assert.equal(log.length, 40);
  assert.equal(log[0].at, 44);
  assert.deepEqual(readLog(JSON.stringify(log)), log);
});
test('a damaged or tampered record is cleaned, not trusted', () => {
  assert.deepEqual(readLog('nope'), []);
  assert.deepEqual(readLog('{"a":1}'), []);
  const got = readLog(JSON.stringify([{ at: 5, order: ['<b>Joe</b>', 'Sam'], me: 'Sam' }, { at: 'x', order: ['A', 'B'] }, { at: 6, order: ['Solo'] }, null]));
  assert.deepEqual(got, [{ at: 5, order: ['bJoeb', 'Sam'], me: 'Sam', hands: 0 }]);
});
test('wins are tallied by name, and a place is found by name', () => {
  const log = [{ at: 3, order: ['Sam', 'Joe'] }, { at: 2, order: ['Joe', 'Sam', 'Al'] }, { at: 1, order: ['Sam', 'Al'] }];
  assert.deepEqual(tally(log), [{ name: 'Sam', wins: 2 }, { name: 'Joe', wins: 1 }]);
  assert.deepEqual([placeOf(log[1], 'Al'), placeOf(log[1], 'Joe'), placeOf(log[1], 'Nobody')], [3, 1, 0]);
});
