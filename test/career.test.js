import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LADDER, xpOf, rankOf, rankName } from '../js/career.js';

test('a new player is a Rookie with nothing', () => {
  const r = rankOf(xpOf({}));
  assert.deepEqual([r.index, r.name, r.xp, r.progress], [0, 'Rookie', 0, 0]);
  assert.equal(r.toNext, LADDER[1][0]);
});
test('experience adds up across everything', () => {
  assert.equal(xpOf({ hands: 100, won: 30, knockouts: 4, tables: 2, bosses: 1 }, { daily: 3, stickers: 2 }), 100 + 60 + 40 + 80 + 80 + 90 + 50);
});
test('junk in saved stats cannot break or lower it', () => {
  assert.equal(xpOf({ hands: 'x', won: -5, tables: null, knockouts: 1.9 }), 10);
});
test('ranks change exactly at their thresholds and stop at the top', () => {
  for (let i = 1; i < LADDER.length; i++) {
    assert.equal(rankOf(LADDER[i][0] - 1).index, i - 1);
    assert.equal(rankOf(LADDER[i][0]).index, i);
  }
  const top = rankOf(10 ** 9);
  assert.deepEqual([top.name, top.next, top.toNext, top.progress], ['Legend', '', 0, 1]);
});
test('a rank number from another device is always turned into a real rank', () => {
  assert.equal(rankName(4), 'Shark');
  assert.equal(rankName(99), 'Legend');
  assert.equal(rankName(-3), 'Rookie');
  assert.equal(rankName('<b>'), 'Rookie');
});
