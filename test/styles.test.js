import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../js/engine.js';
import { chen, decide } from '../js/ai.js';
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

// Game-like conditions: Table 2's four characters and a human who folds 60% of hands before the flop (so it is often
// 3-handed), stacks carried from hand to hand (a fresh table every 60 hands, blinds rising), played to the river.
// "enters" = calls a bet or raises before the flop (checking the big blind for free does not count), "raises" = raises
// before the flop; `bluffs` is the share of postflop bets and raises that are bluffs.
const cat = (v) => Math.floor(v / 13 ** 5);
// Does she hold the goods for a big bet: a pair that uses one of her own cards or better, or a draw with 8+ outs?
function goods(hole, board) {
  const ranks = [...hole, ...board].map((c) => c >> 2);
  if (hole.some((c) => ranks.filter((r) => r === c >> 2).length >= 2)) return true;
  if (cat(evaluate([...hole, ...board])) > cat(evaluate(board))) return true;
  if (board.length >= 5) return false;
  const known = new Set([...hole, ...board]);
  let outs = 0;
  for (let c = 0; c < 52; c++) {
    if (known.has(c)) continue;
    const b2 = [...board, c], m = cat(evaluate([...hole, ...b2]));
    if (m >= 4 && m > cat(evaluate(b2))) outs++;
  }
  return outs >= 8;
}
function gameLikeRates(skill, hands, rng) {
  const names = ['Mav', 'Dot', 'Ivy', 'Gus'];
  const seen = Object.fromEntries(names.map((n) => [n, { hands: 0, enter: 0, raise: 0, bets: 0, bluffs: 0, reraises: 0, softReraises: 0, big: 0, bigWithout: 0 }]));
  for (let done = 0; done < hands;) {
    const g = new Game({ players: [{ name: 'You', isHuman: true }, ...names.map((n) => bot(n, skill))], chips: 1000, handsPerLevel: 8, rng });
    for (let k = 0; k < 60 && done < hands && g.startHand(); k++, done++) {
      const dealt = g.players.filter((p) => !p.out && !p.isHuman).map((p) => p.name);
      const flags = {};
      const youFold = rng() < 0.6;
      let youActed = false;
      while (g.stage !== 'handOver') {
        if (g.stage === 'streetEnd') { g.nextStreet(); continue; }
        const p = g.players[g.toAct], L = g.legal(p.seat);
        let a;
        if (p.isHuman) {
          a = g.street === 'preflop' && !youActed && youFold && L.toCall > 0 ? { type: 'fold' } : { type: L.toCall > 0 ? 'call' : 'check' };
          if (g.street === 'preflop') youActed = true;
        } else {
          a = decide(g, p.seat, rng, { foldToBet: 0.4, aggression: 0.3, shove: 0 });
          const f = flags[p.name] ||= {}, st = seen[p.name];
          if (g.street === 'preflop') {
            if ((a.type === 'call' && L.toCall > 0) || a.type === 'raise') f.enter = true;
            if (a.type === 'raise') f.raise = true;
            if (a.type === 'raise' && g.currentBet > g.bb) { st.reraises++; if (chen(p.cards) < 11) st.softReraises++; }
          } else {
            if (a.type === 'raise') { st.bets++; if (a.bluff) st.bluffs++; }
            const bigCall = a.type === 'call' && L.toCall > 0 && L.toCall / Math.max(g.pot - L.toCall, 1) >= 0.5;
            const bigBet = a.type === 'raise' && (L.toCall > 0 || a.amount >= 0.5 * g.pot);
            if (bigCall || bigBet) { st.big++; if (!goods(p.cards, g.board)) st.bigWithout++; }
          }
        }
        g.act(a.type, a.amount);
      }
      for (const n of dealt) { const s = seen[n]; s.hands++; if (flags[n]?.enter) s.enter++; if (flags[n]?.raise) s.raise++; }
    }
  }
  return Object.fromEntries(names.map((n) => {
    const s = seen[n];
    return [n, { ...s, enter: (100 * s.enter) / s.hands, raise: (100 * s.raise) / s.hands, bluffs: (100 * s.bluffs) / Math.max(1, s.bets) }];
  }));
}

// Target ranges (% of hands); every bound is widened by 3 points on each side so a different seed cannot flake the test.
const WIDEN = 3;
const TARGET = {
  Dot: { enter: [12, 20], raise: [6, 11] }, // Careful: a nit
  Gus: { enter: [20, 30], raise: [13, 22] }, // Steady: tight-aggressive
  Ivy: { enter: [45, 62], raise: [3, 10] }, // Sticky: calling station
  Mav: { enter: [45, 58], raise: [26, 40] }, // Wild: maniac
};
for (const skill of [0.3, 1]) {
  test(`game-like styles at skill ${skill}: nit, tight-aggressive, calling station, maniac`, () => {
    const got = gameLikeRates(skill, 1500, mulberry32(SEED + Math.round(skill * 10)));
    for (const [name, t] of Object.entries(TARGET)) {
      for (const k of ['enter', 'raise']) {
        const [lo, hi] = t[k];
        assert.ok(got[name][k] >= lo - WIDEN && got[name][k] <= hi + WIDEN,
          `${name} ${k}s ${got[name][k].toFixed(1)}% of hands, want ${lo}-${hi}% (+-${WIDEN})`);
      }
    }
    const dot = got.Dot;
    assert.ok(dot.big >= 100, `too few Dot samples: ${dot.big} big bets`);
    assert.equal(dot.softReraises, 0, `Dot re-raised a raise ${dot.softReraises} of ${dot.reraises} times without Chen 11`);
    assert.equal(dot.bigWithout, 0, `Dot bet or called half a pot or more ${dot.bigWithout} of ${dot.big} times without a pair of her own or an 8-out draw`);
    assert.ok(dot.bluffs < 6, `Dot's postflop bets are ${dot.bluffs.toFixed(1)}% bluffs`);
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
      if (shoved && a.type !== 'fold' && L.toCall > 0) called = true; // someone paid to see it
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

// ---- calling an all-in before the flop ----
const HANDS = [];
for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) HANDS.push([a, b]);
// A table where You have just moved all in (1000) and `name` is to act with `stack`; `n` players are still in.
function shoveSpot(name, { skill = 0.3, stack = 1000, n = 2 } = {}) {
  const rng = mulberry32(SEED + 7);
  const others = ['Dot', 'Gus', 'Ivy', 'Mav'].filter((x) => x !== name).slice(0, n - 2);
  const g = new Game({ players: [{ name: 'You', isHuman: true }, bot(name, skill), ...others.map((x) => bot(x, skill))], chips: 1000, rng });
  g.startHand();
  for (const p of g.players) Object.assign(p, { bet: 0, total: 0, chips: 1000, folded: false, allIn: false, acted: false, out: false });
  const you = g.players[0], me = g.players[1];
  Object.assign(you, { bet: 1000, total: 1000, chips: 0, allIn: true, acted: true });
  me.chips = stack;
  Object.assign(g, { street: 'preflop', currentBet: 1000, lastRaise: 990, aggressor: you.seat, toAct: me.seat, stage: 'betting' });
  return { g, me, rng };
}
// The share of the 1326 starting hands (each dealt twice, for the hand-by-hand wobble) that `name` calls with.
function callShare(name, { r = 0, wise = false, ...spot } = {}) {
  const { g, me, rng } = shoveSpot(name, spot);
  let calls = 0;
  for (let rep = 0; rep < 2; rep++) {
    for (const hand of HANDS) {
      me.cards = hand;
      if (decide(g, me.seat, rng, { shove: r, aggression: 0.9, foldToBet: 0.2, ...(wise ? { wise: true } : {}) }).type === 'call') calls++;
    }
  }
  return (100 * calls) / (2 * HANDS.length);
}
const CALLS = { // % of starting hands called with, by how often the human shoves
  0: { Dot: 5, Gus: 7, Ivy: 12, Mav: 14 },
  0.3: { Dot: 12, Gus: 16, Ivy: 28, Mav: 30 },
  0.5: { Dot: 20, Gus: 25, Ivy: 40, Mav: 40 },
};
test('the more you shove, the wider each opponent calls: 5-14%, then 12-30%, then 20-40% of hands', () => {
  for (const [r, row] of Object.entries(CALLS)) {
    for (const [name, want] of Object.entries(row)) {
      const got = callShare(name, { r: +r });
      assert.ok(Math.abs(got - want) <= 4.5, `${name} calls ${got.toFixed(1)}% of hands against a human who shoves ${r} of the time, want ~${want}%`);
    }
  }
  assert.ok(Math.abs(callShare('Dot', { r: 0.7 }) - callShare('Dot', { r: 0.5 })) < 1.5, 'the range stops widening at the 0.7 cap, same as 0.5');
});

test('short stacks call wide: 8 big blinds or fewer call with half the hands, 15 or fewer at least as wide as against a 0.3 shover', () => {
  for (const name of ['Dot', 'Gus', 'Ivy', 'Mav']) {
    for (const stack of [40, 80]) { // 4 and 8 big blinds at 5/10
      const got = callShare(name, { r: 0, stack });
      assert.ok(got >= 42 && got <= 58, `${name} with ${stack / 10} big blinds calls ${got.toFixed(1)}%, want about 50%`);
    }
    const at15 = callShare(name, { r: 0, stack: 150 });
    assert.ok(at15 >= CALLS[0.3][name] - 4.5, `${name} with 15 big blinds calls ${at15.toFixed(1)}%, want at least ~${CALLS[0.3][name]}%`);
    assert.ok(callShare(name, { r: 0, stack: 300 }) < CALLS[0.3][name], `${name} with 30 big blinds is back to a normal range`);
  }
});

test('an opponent who is wise to you calls your shove with at least the 0.5 range, even with no shove history', () => {
  for (const name of ['Dot', 'Gus', 'Ivy', 'Mav']) {
    const got = callShare(name, { r: 0, wise: true });
    assert.ok(got >= CALLS[0.5][name] - 4.5, `a wise ${name} calls ${got.toFixed(1)}%, want ~${CALLS[0.5][name]}%`);
    assert.ok(callShare(name, { r: 0 }) < got - 3, `${name} wise vs not wise`);
  }
});

test('a bigger table or a better player is never softer against a shove', () => {
  for (const name of ['Dot', 'Gus', 'Ivy', 'Mav']) {
    for (const r of [0, 0.3, 0.5]) {
      const base = callShare(name, { r });
      for (const spot of [{ n: 3 }, { n: 5 }, { skill: 1 }, { n: 5, skill: 1 }]) {
        const got = callShare(name, { r, ...spot });
        assert.ok(got >= base - 1.5, `${name} at r=${r} calls ${got.toFixed(1)}% with ${JSON.stringify(spot)}, but ${base.toFixed(1)}% heads-up at skill 0.3`);
      }
    }
  }
});

test('the very first shove is still folded to by each opponent at least 85% of the time (deep stacks, no history)', () => {
  const rng = mulberry32(SEED + 1);
  for (const name of ['Dot', 'Ivy', 'Gus', 'Mav']) {
    let calls = 0;
    const N = 1000;
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
    assert.ok(calls / N <= 0.15, `${name} calls a first shove ${calls} of ${N} times`);
  }
});

test('Dot only re-raises a raise with Chen 11 or better, and never as a bluff', () => {
  const { g, me, rng } = shoveSpot('Dot', { n: 4 });
  const you = g.players[0];
  Object.assign(you, { bet: 30, total: 30, chips: 970, allIn: false });
  Object.assign(g, { currentBet: 30, lastRaise: 20 });
  let raises = 0;
  for (const skill of [0.3, 1]) {
    me.style.skill = skill;
    for (let rep = 0; rep < 4; rep++) {
      for (const hand of HANDS) {
        me.cards = hand;
        const a = decide(g, me.seat, rng, { foldToBet: 0.4, aggression: 0.3, shove: 0 });
        if (a.type !== 'raise') continue;
        raises++;
        assert.ok(chen(hand) >= 11 && !a.bluff, `Dot re-raised with Chen ${chen(hand)}`);
      }
    }
  }
  assert.ok(raises > 0, 'Dot never re-raises, even with aces');
});

test('at Table 1, a human who shoves every hand is called, and knocked out far more often than he clears the table', () => {
  const rng = mulberry32(SEED + 2);
  const RUNS = 400;
  let cleared = 0, out = 0, chips = 0, shoves = 0, called = 0;
  for (let run = 0; run < RUNS; run++) {
    const g = new Game({ players: [{ name: 'You', isHuman: true }, ...['Dot', 'Ivy', 'Gus'].map((n) => bot(n, 0.3))], chips: 1000, handsPerLevel: 5, rng });
    const h = { acts: 0, shoves: 0 };
    let n = 0, nth = 0;
    while (g.startHand() && n++ < 80) {
      const r = shoveHand(g, h, rng);
      if (r.shoved && ++nth >= 4) { shoves++; if (r.called) called++; }
      if (g.players[0].chips === 0) break;
    }
    const me = g.players[0].chips;
    chips += me;
    if (me === 0) out++;
    else if (g.players.filter((q) => q.chips > 0).length === 1) cleared++;
  }
  assert.ok(shoves > 400, `only ${shoves} shoves from the 4th on`);
  assert.ok(called / shoves >= 0.4, `from the 4th shove on, only ${called} of ${shoves} shoves were called`);
  assert.ok(out / RUNS >= 0.75, `knocked out in only ${out} of ${RUNS} runs`);
  assert.ok(chips / RUNS < 1000, `average finishing stack ${chips / RUNS}`);
  assert.ok(cleared / RUNS <= 0.3, `shove-every-hand cleared the table ${cleared} of ${RUNS} runs`); // doubling up is the gamble paying off, but not every other run
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
