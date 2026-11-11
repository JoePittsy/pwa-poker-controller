import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../js/engine.js';
import { decide } from '../js/ai.js';
import { evaluate } from '../js/cards.js';
import { adjust } from '../js/reads.js';

// Each regular has a distinct, stable style. config.js pulls in the DOM, so read the numbers straight from its source.
const STYLE = {};
for (const m of readFileSync(new URL('../js/config.js', import.meta.url), 'utf8')
  .matchAll(/^ {2}(\w+): \{ tag: '[^']*'.*?style: \{ loose: ([\d.]+), aggr: ([\d.]+)/gm)) STYLE[m[1]] = { loose: +m[2], aggr: +m[3] };

const SEED = +process.env.STYLE_SEED || 20240611;
const mulberry32 = (a) => () => {
  a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const bot = (name, skill) => ({ name, style: { ...STYLE[name], skill } });
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

// Bot-only 4-handed table, preflop only (every hand starts from fresh stacks), the way the notebook counts it:
// "enters" = calls a bet or raises (checking the big blind for free does not count).
function preflopRates(skill, hands, rng) {
  const names = ['Mav', 'Dot', 'Ivy', 'Gus'];
  const g = new Game({ players: names.map((n) => bot(n, skill)), chips: 1000, rng });
  const seen = Object.fromEntries(names.map((n) => [n, { enter: 0, raise: 0 }]));
  for (let h = 0; h < hands; h++) {
    for (const p of g.players) p.chips = 1000;
    g.startHand();
    const entered = new Set(), raised = new Set();
    while (g.stage === 'betting') {
      const p = g.players[g.toAct], L = g.legal(p.seat);
      const a = decide(g, p.seat, rng, {});
      if ((a.type === 'call' && L.toCall > 0) || a.type === 'raise') entered.add(p.name);
      if (a.type === 'raise') raised.add(p.name);
      g.act(a.type, a.amount);
    }
    for (const n of names) { if (entered.has(n)) seen[n].enter++; if (raised.has(n)) seen[n].raise++; }
  }
  return Object.fromEntries(names.map((n) => [n, { enter: (100 * seen[n].enter) / hands, raise: (100 * seen[n].raise) / hands }]));
}

// Target ranges (% of hands); every bound is widened by 3 points on each side so a different seed cannot flake the test.
const WIDEN = 3;
const TARGET = {
  Dot: { enter: [12, 20], raise: [6, 12] }, // Careful: a nit
  Gus: { enter: [22, 30], raise: [14, 22] }, // Steady: tight-aggressive
  Ivy: { enter: [50, 62], raise: [4, 10] }, // Sticky: calling station
  Mav: { enter: [45, 58], raise: [28, 40] }, // Wild: maniac
};
for (const skill of [0.3, 1]) {
  test(`preflop styles at skill ${skill}: nit, tight-aggressive, calling station, maniac`, () => {
    const got = preflopRates(skill, 800, mulberry32(SEED + Math.round(skill * 10)));
    for (const [name, t] of Object.entries(TARGET)) {
      for (const k of ['enter', 'raise']) {
        const [lo, hi] = t[k];
        assert.ok(got[name][k] >= lo - WIDEN && got[name][k] <= hi + WIDEN,
          `${name} ${k}s ${got[name][k].toFixed(1)}% of hands, want ${lo}-${hi}% (+-${WIDEN})`);
      }
    }
  });
}

// A human who shoves every hand, profiled the way the game does it from the habits seen so far.
const shoverProfile = (h) => ({ shove: h.shoves / Math.max(6, h.acts), aggression: 0.9, foldToBet: 0.2 });
function shoveHand(g, h, rng) {
  let called = false, shoved = false;
  while (g.stage !== 'handOver') {
    if (g.stage === 'streetEnd') { g.nextStreet(); continue; }
    const p = g.players[g.toAct], L = g.legal(p.seat);
    let a;
    if (p.isHuman) {
      h.acts++;
      if (L.canRaise) { h.shoves++; shoved = true; a = { type: 'raise', amount: L.maxTo }; } else a = { type: 'call' };
    } else {
      a = decide(g, p.seat, rng, shoverProfile(h));
      if (a.type !== 'fold' && L.toCall > 100) called = true;
    }
    g.act(a.type, a.amount);
  }
  return { called, shoved };
}

test('shoving every hand heads-up gets called soon: a few folds at most, two for Ivy and Mav', () => {
  const rng = mulberry32(SEED);
  for (const [name, most] of [['Dot', 4], ['Ivy', 2], ['Gus', 4], ['Mav', 2]]) {
    const folded = [];
    for (let run = 0; run < 301; run++) {
      const g = new Game({ players: [{ name: 'You', isHuman: true }, bot(name, 0.3)], chips: 2000, handsPerLevel: 10, rng });
      const h = { acts: 0, shoves: 0 };
      let n = 0;
      while (g.startHand() && n < 60) {
        const r = shoveHand(g, h, rng);
        if (r.called) break;
        if (r.shoved) n++; // a shove that was folded to (a hand the bot folded before we could shove does not count)
      }
      folded.push(n);
    }
    assert.ok(median(folded) <= most, `${name} folds ${median(folded)} shoves in a row before calling (median), want <= ${most}`);
  }
});

test('the very first shove is still folded to by most hands, before there is any shove history', () => {
  const rng = mulberry32(SEED + 1);
  for (const name of ['Dot', 'Ivy', 'Gus', 'Mav']) {
    let calls = 0;
    const N = 300;
    for (let i = 0; i < N; i++) {
      const g = new Game({ players: [{ name: 'You', isHuman: true }, bot(name, 0.3)], chips: 2000, rng });
      g.startHand();
      let called = false;
      while (g.stage !== 'handOver') {
        if (g.stage === 'streetEnd') { g.nextStreet(); continue; }
        const p = g.players[g.toAct], L = g.legal(p.seat);
        let a;
        if (p.isHuman) a = L.canRaise ? { type: 'raise', amount: L.maxTo } : { type: 'call' };
        else { a = decide(g, p.seat, rng, { shove: 0, aggression: 0.9, foldToBet: 0.2 }); if (a.type !== 'fold' && L.toCall > 100) called = true; }
        g.act(a.type, a.amount);
      }
      if (called) calls++;
    }
    assert.ok(calls / N < 0.5, `${name} calls a first shove ${calls} of ${N} times`);
  }
});

test('at Table 1, shoving every hand clears the table in no more than 15% of runs', () => {
  const rng = mulberry32(SEED + 2);
  let cleared = 0;
  const RUNS = 300;
  for (let run = 0; run < RUNS; run++) {
    const g = new Game({ players: [{ name: 'You', isHuman: true }, ...['Dot', 'Ivy', 'Gus'].map((n) => bot(n, 0.3))], chips: 1000, handsPerLevel: 10, rng });
    const h = { acts: 0, shoves: 0 };
    let n = 0;
    while (g.startHand() && n++ < 60) {
      shoveHand(g, h, rng);
      if (g.players[0].chips === 0 || g.players.filter((q) => q.chips > 0).length === 1) break;
    }
    if (g.players[0].chips > 0 && g.players.filter((q) => q.chips > 0).length === 1) cleared++;
  }
  assert.ok(cleared / RUNS <= 0.15, `shove-every-hand cleared the table ${cleared} of ${RUNS} runs`);
});

test('an opponent who is wise to you calls a pot-sized bet with any pair or better', () => {
  const rng = mulberry32(SEED + 3);
  const profile = adjust({ foldToBet: 0.4, aggression: 0.3 }, { wise: true, gaveUp: 3 });
  const cat = (v) => Math.floor(v / 13 ** 5);
  for (const name of ['Dot', 'Ivy', 'Gus', 'Mav']) {
    for (const [street, nb] of [['flop', 3], ['turn', 4], ['river', 5]]) {
      for (let i = 0, tested = 0; tested < 60; i++) {
        assert.ok(i < 5000, 'could not deal enough pair-or-better hands');
        const deck = Array.from({ length: 52 }, (_, k) => k);
        for (let k = 51; k > 0; k--) { const j = Math.floor(rng() * (k + 1)); [deck[k], deck[j]] = [deck[j], deck[k]]; }
        const hole = deck.slice(0, 2), board = deck.slice(2, 2 + nb);
        const ranks = [...hole, ...board].map((c) => c >> 2);
        const pair = hole.some((c) => ranks.filter((r) => r === c >> 2).length >= 2) || cat(evaluate([...hole, ...board])) > cat(evaluate(board));
        if (!pair) continue;
        tested++;
        const g = new Game({ players: [{ name: 'You', isHuman: true }, bot(name, tested % 2 ? 0.3 : 1)], chips: 1000, rng });
        g.startHand();
        const [you, them] = g.players;
        Object.assign(g, { street, board, currentBet: 40, lastRaise: 40, aggressor: you.seat, toAct: them.seat, stage: 'betting' });
        for (const p of g.players) Object.assign(p, { bet: 0, total: 20, chips: 980, folded: false, allIn: false, acted: false });
        Object.assign(you, { bet: 40, total: 60, chips: 940, acted: true, cards: deck.slice(10, 12) });
        them.cards = hole;
        const a = decide(g, them.seat, rng, profile);
        assert.notEqual(a.type, 'fold', `${name} folded a pair or better to a pot-sized bet on the ${street}`);
      }
    }
  }
});
