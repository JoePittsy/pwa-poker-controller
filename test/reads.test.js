import { test } from 'node:test';
import assert from 'node:assert/strict';
import { noteGaveUp, notePushed, noteShowdownWon, adjust, readText, READ_AT } from '../js/reads.js';

test('an opponent wises up after folding to you a few times, and says so once', () => {
  const mem = {};
  const said = Array.from({ length: READ_AT + 2 }, () => noteGaveUp(mem, 'Rex'));
  assert.deepEqual(said, ['', '', 'wise', '', '']);
  assert.equal(mem.Rex.wise, true);
});
test('an opponent leans on you after you fold to them a few times', () => {
  const mem = {};
  assert.deepEqual([notePushed(mem, 'Mav'), notePushed(mem, 'Mav'), notePushed(mem, 'Mav'), notePushed(mem, 'Mav')], ['', '', 'bully', '']);
});
test('reads are kept per opponent', () => {
  const mem = {};
  for (let i = 0; i < READ_AT; i++) noteGaveUp(mem, 'Rex');
  assert.equal(mem.Dot, undefined);
  assert.equal(adjust({ foldToBet: 0.4, aggression: 0.3 }, mem.Dot).aggression, 0.3);
  assert.equal(adjust({ foldToBet: 0.4, aggression: 0.3 }, mem.Rex).aggression, 0.8);
});
test('a read changes how they play you, within bounds', () => {
  assert.deepEqual(adjust({ foldToBet: 0.4, aggression: 0.3 }, { bully: true }), { foldToBet: 0.65, aggression: 0.3 });
  assert.equal(adjust({ foldToBet: 0.4, aggression: 0.3, shove: 0.8 }, { ko: 1 }).shove, 0.8); // how often you shove is not forgotten once they know you
  assert.equal(adjust({ foldToBet: 0.9, aggression: 0.9 }, { bully: true, wise: true }).foldToBet, 0.95);
});
test('a read that costs them is dropped, and can be earned again', () => {
  const mem = {};
  for (let i = 0; i < READ_AT; i++) noteGaveUp(mem, 'Rex');
  assert.equal(noteShowdownWon(mem, 'Rex', { youBet: false, youCalledThem: false }), '');
  assert.equal(noteShowdownWon(mem, 'Rex', { youBet: true, youCalledThem: false }), 'fooled');
  assert.equal(mem.Rex.wise, false);
  assert.deepEqual([noteGaveUp(mem, 'Rex'), noteGaveUp(mem, 'Rex'), noteGaveUp(mem, 'Rex')], ['', '', 'wise']);
  for (let i = 0; i < READ_AT; i++) notePushed(mem, 'Mav');
  assert.equal(noteShowdownWon(mem, 'Mav', { youBet: false, youCalledThem: true }), 'stood');
  assert.equal(noteShowdownWon(mem, 'Nobody', { youBet: true, youCalledThem: true }), '');
});
test('the notebook says what they think of you', () => {
  assert.equal(readText(undefined), '');
  assert.equal(readText({ ko: 2 }), '');
  assert.match(readText({ wise: true }), /Calls your bets lighter/);
  assert.match(readText({ wise: true, bully: true }), /Bets at you more/);
});
