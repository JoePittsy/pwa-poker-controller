import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, describe } from '../js/cards.js';
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
