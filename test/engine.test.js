import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, describe, onBoard } from '../js/cards.js';
import { Game } from '../js/engine.js';
import { decide } from '../js/ai.js';

const C = (s) => s.split(' ').map((x) => '23456789TJQKA'.indexOf(x[0]) * 4 + 'shdc'.indexOf(x[1]));
const name = (s) => describe(evaluate(C(s)));

function rng(seed) { // mulberry32
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('hand evaluator', () => {
  assert.equal(name('As Ks Qs Js Ts 2d 3c'), 'Royal Flush');
  assert.equal(name('5s 4s 3s 2s As Kd Kc'), 'Straight Flush, Five high');
  assert.equal(name('9s 9h 9d 9c Ks 2d 3c'), 'Four Nines');
  assert.equal(name('9s 9h 9d Kc Ks Kd 3c'), 'Full House, Kings over Nines');
  assert.equal(name('As 9s 7s 4s 2s Kd Kc'), 'Flush, Ace high');
  assert.equal(name('Ah 2s 3d 4c 5s Kd Kc'), 'Straight, Five high');
  assert.equal(name('6h 6s 6d 4c 5s Kd Qc'), 'Three Sixes');
  assert.equal(name('6h 6s 4d 4c 5s 5d Qc'), 'Two Pair, Sixes & Fives');
  assert.equal(name('6h 6s 2d 4c 9s Td Qc'), 'Pair of Sixes');
  assert.equal(name('Ah 6s 2d 4c 9s Td Qc'), 'Ace high');
  const order = ['Ah 6s 2d 4c 9s Td Qc', '6h 6s 2d 4c 9s Td Qc', '6h 6s 4d 4c 5s 5d Qc', '6h 6s 6d 4c 5s Kd Qc',
    'Ah 2s 3d 4c 5s Kd Kc', 'As 9s 7s 4s 2s Kd Kc', '9s 9h 9d Kc Ks Kd 3c', '9s 9h 9d 9c Ks 2d 3c', '5s 4s 3s 2s As Kd Kc'];
  for (let i = 1; i < order.length; i++) assert.ok(evaluate(C(order[i])) > evaluate(C(order[i - 1])), order[i]);
  assert.ok(evaluate(C('Ah Kd 7s 7c 2d 3h 9s')) > evaluate(C('Ah Qd 7s 7c 2d 3h 9s')), 'kicker');
});

test('side pots: short stack only wins the main pot', () => {
  const g = new Game({ players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }], rng: rng(1) });
  g.players[0].chips = 100;
  g.startHand();
  while (g.stage === 'betting') g.act('raise', 1e9); // everyone shoves
  g.players[0].cards = C('As Ah'); g.players[1].cards = C('Ks Kh'); g.players[2].cards = C('7d 2c');
  g.deck = C('3d 4c 9h Jd 8s 6h Qc 2s').reverse();
  while (g.stage === 'streetEnd') g.nextStreet();
  assert.deepEqual(g.players.map((p) => p.chips), [300, 1800, 0]);
});

test('heads-up: dealer posts the small blind and acts first preflop', () => {
  const g = new Game({ players: [{ name: 'A' }, { name: 'B' }], rng: rng(2) });
  g.startHand();
  assert.equal(g.players[g.dealer].bet, g.sb);
  assert.equal(g.toAct, g.dealer);
  g.act('call');
  assert.equal(g.stage, 'betting', 'big blind gets the option');
  g.act('check');
  assert.equal(g.stage, 'streetEnd');
  g.nextStreet();
  assert.notEqual(g.toAct, g.dealer, 'big blind acts first postflop');
});

test('min-raise and uncalled bets', () => {
  const g = new Game({ players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }], rng: rng(3) });
  g.startHand(); // dealer 0, sb 1, bb 2, first to act 0
  assert.equal(g.toAct, 0);
  assert.equal(g.legal().minTo, 20);
  g.act('raise', 50);
  assert.equal(g.legal().minTo, 90);
  g.act('fold'); g.act('fold');
  assert.equal(g.stage, 'handOver');
  assert.equal(g.players[0].chips, 1015, 'wins blinds, raise returned');
});

test('AI self-play conserves chips and always terminates', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const r = rng(seed);
    const styles = [0.2, 0.5, 0.8];
    const g = new Game({
      players: Array.from({ length: 6 }, (_, i) => ({ name: 'P' + i, style: { loose: styles[i % 3], aggr: styles[(i + seed) % 3] } })),
      rng: r, handsPerLevel: 5,
    });
    let hands = 0;
    while (g.startHand()) {
      let steps = 0;
      while (g.stage !== 'handOver') {
        assert.ok(++steps < 500, 'hand did not terminate');
        if (g.stage === 'streetEnd') { g.nextStreet(); continue; }
        const L = g.legal();
        assert.ok(L.toCall >= 0 && L.minTo <= L.maxTo);
        const a = decide(g, g.toAct, r);
        g.act(a.type, a.amount);
        assert.ok(g.players.every((p) => p.chips >= 0 && p.bet >= 0));
      }
      assert.equal(g.players.reduce((s, p) => s + p.chips, 0), 6000, `seed ${seed} hand ${g.handNo}`);
      assert.ok(++hands < 3000, 'game did not terminate');
    }
    assert.equal(g.players.filter((p) => p.chips > 0).length, 1);
  }
});

import { scoreHand, bestFiveOf } from '../js/cards.js';

test('short deck: flush beats full house, and A-6-7-8-9 is a straight', () => {
  const flush = evaluate(C('As Js 9s 8s 6s Kd Kc'), true), boat = evaluate(C('Ks Kh Kd 7c 7s 9d Tc'), true);
  assert.ok(flush > boat, 'flush outranks full house');
  assert.ok(evaluate(C('As Js 9s 8s 6s Kd Kc')) < evaluate(C('Ks Kh Kd 7c 7s 9d Tc')), 'but not in a full deck');
  assert.equal(describe(flush, true), 'Flush, Ace high');
  assert.equal(describe(boat, true), 'Full House, Kings over Sevens');
  assert.equal(describe(evaluate(C('Ah 6s 7d 8c 9s Kd Kc'), true), true), 'Straight, Nine high');
  assert.equal(describe(evaluate(C('Ah 6s 7d 8c 9s Kd Kc'))), 'Pair of Kings', 'not a straight in a full deck');
});

test('omaha: exactly two hole cards must play', () => {
  assert.equal(describe(scoreHand(C('As Ad Ac Kd'), C('Ah 2s 3d 9c Jh'), 'omaha')), 'Three Aces', 'three aces in hand cannot make quads');
  assert.equal(describe(scoreHand(C('As 2d 3c 4d'), C('Ks Qs Js Ts 7h'), 'omaha')), 'Ace high', 'one spade in hand is not a flush');
  assert.equal(describe(scoreHand(C('As 9s 3c 4d'), C('Ks Qs Js 2h 7h'), 'omaha')), 'Flush, Ace high');
  const five = bestFiveOf(C('As 9s 3c 4d'), C('Ks Qs Js 2h 7h'), 'omaha');
  assert.equal(five.filter((c) => C('As 9s 3c 4d').includes(c)).length, 2);
});

test('variants: self-play conserves chips and terminates', () => {
  for (const variant of ['short', 'omaha']) {
    for (let seed = 1; seed <= 4; seed++) {
      const r = rng(seed * 31);
      const g = new Game({ players: Array.from({ length: 6 }, (_, i) => ({ name: 'P' + i, style: { loose: 0.5, aggr: 0.5 } })), rng: r, handsPerLevel: 4, variant });
      let hands = 0;
      while (g.startHand()) {
        assert.equal(g.players.find((p) => p.cards.length).cards.length, variant === 'omaha' ? 4 : 2);
        if (variant === 'short') assert.ok(g.dealt.every((c) => (c >> 2) >= 4) && g.dealt.length === 36);
        let steps = 0;
        while (g.stage !== 'handOver') {
          assert.ok(++steps < 500);
          if (g.stage === 'streetEnd') { g.nextStreet(); continue; }
          const a = decide(g, g.toAct, r);
          g.act(a.type, a.amount);
        }
        assert.equal(g.players.reduce((s, p) => s + p.chips, 0), 6000, `${variant} seed ${seed} hand ${g.handNo}`);
        assert.ok(++hands < 3000);
      }
    }
  }
});

test('a cash game starts at its stake and the blinds never move', () => {
  const g = new Game({ players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }], chips: 5000, handsPerLevel: Infinity, startLevel: 3 });
  for (let i = 0; i < 12; i++) {
    g.startHand();
    assert.deepEqual([g.sb, g.bb], [25, 50]);
    while (g.stage !== 'handOver') { if (g.stage === 'betting') g.act(g.legal(g.toAct).canCheck ? 'check' : 'fold'); else g.nextStreet(); }
  }
});

// Opponents facing an all-in before the flop, with a middling hand and the same chips as the shover.
function shoveSpot(cards) {
  const g = new Game({ players: [{ name: 'You', isHuman: true }, { name: 'Bot', style: { loose: 0.5, aggr: 0.5, skill: 1 } }], chips: 1000 });
  g.startHand();
  const bot = g.players[1], you = g.players[0];
  bot.cards = cards;
  if (g.toAct !== 0) g.act('call');
  g.act('raise', g.legal(0).maxTo); // the human moves all in
  assert.equal(g.toAct, 1);
  assert.ok(you.allIn);
  return g;
}
test('opponents call a habitual shover with far more hands than a rare one', () => {
  const hands = ['Ah 7c', 'Kd Jc', '8s 8d', 'Qh Ts', 'Ac 4d', '6h 6c', 'Kh 9h', 'Jd Tc'].map(C);
  const calls = (profile) => hands.filter((h) => decide(shoveSpot(h), 1, () => 0.5, profile).type === 'call').length;
  const rare = calls({ shove: 0 }), often = calls({ shove: 0.7 });
  assert.ok(rare <= 4, `called ${rare} of 8 against a rare shover`);
  assert.ok(often >= 6 && often - rare >= 3, `called ${often} of 8 against a habitual shover, ${rare} against a rare one`);
});
test('a careful opponent wants a better hand for all its chips than a loose one', () => {
  const g1 = shoveSpot(C('Ad Jc')), g2 = shoveSpot(C('Ad Jc'));
  g1.players[1].style = { loose: 0.2, aggr: 0.3, skill: 1 };
  g2.players[1].style = { loose: 0.85, aggr: 0.8, skill: 1 };
  assert.equal(decide(g1, 1, () => 0.5, {}).type, 'fold');
  assert.equal(decide(g2, 1, () => 0.5, {}).type, 'call');
});

test('a pair that is only on the board is recognised as everyone\'s', () => {
  const v = (s) => evaluate(C(s));
  assert.equal(onBoard(v('7h 9c 2s 2d Td 8c 4h'), C('2s 2d Td 8c 4h')), true); // the twos are on the board
  assert.equal(onBoard(v('2h 9c 2s Kd Td 8c 4h'), C('2s Kd Td 8c 4h')), false); // one of the twos is yours
  assert.equal(onBoard(v('Ah Kc Ts Td Tc 4s 3h'), C('Ts Td Tc 4s 3h')), true); // three tens on the board
  assert.equal(onBoard(v('Th Kc Ts Td 5c 4s 3h'), C('Ts Td 5c 4s 3h')), false);
  assert.equal(onBoard(v('Ah Kc 7s 7d 5c 5s 3h'), C('7s 7d 5c 5s 3h')), true); // both pairs on the board
  assert.equal(onBoard(v('Ah 7c 7s 2d 5c 5s 3h'), C('7s 2d 5c 5s 3h')), false);
  assert.equal(onBoard(v('Ah Kc Qs 9d 5c 4s 3h'), C('Qs 9d 5c 4s 3h')), false); // high card
});

test('a showdown result is the winner\'s net gain, and a chop says who split it', () => {
  const play = (h0, h1, board) => {
    const g = new Game({ players: [{ name: 'You', isHuman: true }, { name: 'Gus' }], chips: 1000, rng: rng(5) });
    g.startHand();
    g.players[0].cards = C(h0); g.players[1].cards = C(h1);
    const b = C(board);
    g.deck = [b[4], 0, b[3], 0, b[2], b[1], b[0], 0]; // popped from the end: burn, flop, burn, turn, burn, river
    while (g.stage !== 'handOver') { if (g.stage === 'streetEnd') g.nextStreet(); else g.act(g.legal().toCall ? 'call' : 'check'); }
    return g;
  };
  const win = play('As Ah', 'Kd 7c', '2s 5h 9d Jc 3h');
  assert.deepEqual(win.board, C('2s 5h 9d Jc 3h'));
  assert.equal(win.result.text, 'You win 10 \u2014 Pair of Aces');
  const lose = play('Kd 7c', 'As Ah', '2s 5h 9d Jc 3h');
  assert.equal(lose.result.text, 'Gus wins 10 \u2014 Pair of Aces');
  const chop = play('As Kd', 'Ah Kc', 'Qs Js Ts 3h 2c');
  assert.equal(chop.result.text, 'You and Gus split it \u2014 Straight, Ace high');
  assert.ok(!/ pot/.test(win.result.text));
});
