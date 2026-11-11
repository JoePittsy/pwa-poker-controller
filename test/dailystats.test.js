import { test } from 'node:test';
import assert from 'node:assert/strict';
import { streak, bestStreak, medal, makeChallenge, readChallenge, addFriend, board } from '../js/dailystats.js';

const S = (...days) => Object.fromEntries(days.map((d) => [d, 1000]));
test('a streak counts back from today, or from yesterday if today is not played yet', () => {
  assert.equal(streak(S('2026-03-01', '2026-03-02', '2026-03-03'), '2026-03-03'), 3);
  assert.equal(streak(S('2026-03-01', '2026-03-02'), '2026-03-03'), 2);
  assert.equal(streak(S('2026-03-01'), '2026-03-03'), 0);
  assert.equal(streak({}, '2026-03-03'), 0);
});
test('streaks cross month and year ends', () => {
  assert.equal(streak(S('2026-02-28', '2026-03-01'), '2026-03-01'), 2);
  assert.equal(streak(S('2025-12-31', '2026-01-01'), '2026-01-01'), 2);
});
test('the best streak is the longest run anywhere in the history', () => {
  assert.equal(bestStreak(S('2026-01-01', '2026-01-02', '2026-01-03', '2026-02-10', '2026-02-11')), 3);
  assert.equal(bestStreak({}), 0);
});
test('medals start at breaking even', () => {
  assert.deepEqual([999, 1000, 1499, 1500, 2500, 9000].map(medal), ['', 'Bronze', 'Bronze', 'Silver', 'Gold', 'Gold']);
});
test('a shared score survives the trip, and names are made safe', () => {
  assert.deepEqual(readChallenge(makeChallenge('2026-03-03', 1450.7, 'Zoë')), { date: '2026-03-03', score: 1450, name: 'Zoë' });
  assert.equal(readChallenge(makeChallenge('2026-03-03', 5, '<b>Al</b>')).name, 'bAlb');
  assert.equal(readChallenge(makeChallenge('2026-03-03', 5, '')).name, 'A friend');
});
test('things that are not shared scores are refused', () => {
  for (const bad of ['', 'hello', '2026-03-03', '2026-03-03.abc.Sam', '2026-03-03.99999999.Sam', '2026-03-03.5.%E0%A4%A', '2026-03-03.5.!!!']) assert.equal(readChallenge(bad), null);
});
test('a friend has one score a day, the newest; old days are dropped', () => {
  const d = { scores: {} };
  addFriend(d, { date: '2026-03-03', score: 900, name: 'Sam' }, '2026-03-03');
  addFriend(d, { date: '2026-03-03', score: 1200, name: 'sam' }, '2026-03-03');
  addFriend(d, { date: '2026-03-03', score: 1500, name: 'Al' }, '2026-03-03');
  addFriend(d, { date: '2026-01-01', score: 1, name: 'Old' }, '2026-03-03');
  assert.deepEqual(d.friends, { '2026-03-03': [{ name: 'Al', score: 1500 }, { name: 'sam', score: 1200 }] });
});
test('the board ranks you among friends once you have played', () => {
  const d = { scores: { '2026-03-03': 1300 }, friends: { '2026-03-03': [{ name: 'Al', score: 1500 }, { name: 'Sam', score: 1200 }] } };
  assert.deepEqual(board(d, '2026-03-03', 'Joe').rows.map((r) => r.name), ['Al', 'Joe', 'Sam']);
  assert.equal(board({ scores: {}, friends: d.friends }, '2026-03-03').played, false);
});
