// AI opponents: Chen-formula preflop play, Monte Carlo equity vs pot odds postflop,
// shaded by a per-player style { loose: 0..1, aggr: 0..1, tell } and by how the human
// has been playing. Each decision also reports how hard it was (`think`, 0..1) and
// whether it is a `bluff` or a `strong` hand, which the UI turns into timing tells.
import { evaluate, scoreHand } from './cards.js';

export function chen([a, b]) {
  let hi = a >> 2, lo = b >> 2;
  if (lo > hi) [hi, lo] = [lo, hi];
  const pts = (r) => (r === 12 ? 10 : r === 11 ? 8 : r === 10 ? 7 : r === 9 ? 6 : (r + 2) / 2);
  if (hi === lo) return Math.max(pts(hi) * 2, 5);
  let s = pts(hi);
  if ((a & 3) === (b & 3)) s += 2;
  const gap = hi - lo - 1;
  s -= [0, 1, 2, 4][gap] ?? 5;
  if (gap <= 1 && hi < 10) s += 1;
  return s;
}

// Preflop strength: Chen points for two cards; for Omaha's four, the best pair of them, marked down.
function strength(cards) {
  if (cards.length === 2) return chen(cards);
  let best = 0;
  for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) best = Math.max(best, chen([cards[i], cards[j]]));
  return best - 1;
}

// A pair or better that is ours, not one the board hands to everybody.
const catOf = (v) => Math.floor(v / 13 ** 5);
function madeHand(hole, board, short) {
  const ranks = [...hole, ...board].map((c) => c >> 2);
  if (hole.some((c) => ranks.filter((r) => r === c >> 2).length >= 2)) return true;
  return catOf(evaluate([...hole, ...board], short)) > catOf(evaluate(board, short));
}

// Unseen cards that would turn a hand into a straight or better that is ours (not the board's): a draw's outs.
function drawOuts(hole, board, short) {
  if (board.length >= 5) return 0;
  const known = new Set([...hole, ...board]);
  let n = 0;
  for (let c = short ? 16 : 0; c < 52; c++) {
    if (known.has(c)) continue;
    const b2 = [...board, c];
    const mine = catOf(evaluate([...hole, ...b2], short));
    if (mine >= 4 && mine > catOf(evaluate(b2, short))) n++;
  }
  return n;
}

// The Chen-point cut-off for calling an all-in with the whole stack. A hand is called with when it scores at least
// this. `loose` sets the starting point, and the more the bettor shoves (v, 0..0.7) the lower it goes, down to a floor
// that is about 40% of all hands for a sticky player and 20% for a careful one. Stacks under 15 big blinds
// call wider still, down to about half of all hands at 8.
export function shoveCut(loose, v, stackBB = Infinity) {
  const open = 10.6 - 5 * loose; // shoves are rare: about 5% (careful) to 12% (sticky) of hands
  const floor = Math.max(4.4, 8.5 - 7 * loose); // a known maniac: about 20% (careful) to 40% (sticky)
  const at = (r) => open + (floor - open) * Math.min(1, r / 0.5) ** 0.6;
  const cut = at(v);
  if (stackBB > 15) return cut;
  return Math.min(cut, stackBB <= 8 ? 3.8 : 3.8 + (at(0.3) - 3.8) * ((stackBB - 8) / 7));
}

export function equity(hole, board, nOpp, sims = 200, rng = Math.random, variant = 'holdem') {
  const known = new Set([...hole, ...board]);
  const deck = [];
  for (let c = variant === 'short' ? 16 : 0; c < 52; c++) if (!known.has(c)) deck.push(c);
  const hc = hole.length;
  const need = 5 - board.length + hc * nOpp;
  let win = 0;
  for (let s = 0; s < sims; s++) {
    for (let i = 0; i < need; i++) {
      const j = i + Math.floor(rng() * (deck.length - i));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    const full = board.concat(deck.slice(0, 5 - board.length));
    const mine = scoreHand(hole, full, variant);
    let best = 0, k = 5 - board.length;
    for (let o = 0; o < nOpp; o++, k += hc) best = Math.max(best, scoreHand(deck.slice(k, k + hc), full, variant));
    win += mine > best ? 1 : mine === best ? 0.5 : 0;
  }
  return win / sims;
}

// human: { foldToBet, aggression, shove } — observed tendencies of the human player, 0..1; wise: this opponent has stopped believing the human's bets
export function decide(g, seat, rng = Math.random, human = {}) {
  const p = g.players[seat];
  const L = g.legal(seat);
  const { loose = 0.5, aggr = 0.5, tell, skill = 1, cheat = 0, noBluff = false } = p.style || {};
  const sloppy = 1 - skill; // weaker players see their hands less clearly and call too much
  const { foldToBet = 0.4, aggression = 0.3, shove: shoveRate = 0, wise = false } = human; // shove: how often the human moves all in
  const pot = g.pot, toCall = L.toCall, bb = g.bb;
  const variant = g.variant || 'holdem';
  const opp = g.players.filter((q) => !q.folded && q !== p).length;
  const hero = g.players.find((q) => q.isHuman && !q.folded && q !== p);
  // bluff more at a human who folds a lot, call lighter against one who bets a lot
  const bluffy = noBluff ? 0 : hero ? 0.5 + foldToBet * 1.6 : 1;
  // a cheating boss half-knows the human's cards: blend in the true odds against them
  const truth = cheat && hero && hero.cards.length ? runoutOdds([p.cards, hero.cards], g.board, variant === 'omaha' ? 60 : 120, rng, variant)[0] : null;
  const fromHero = hero && g.aggressor === hero.seat;
  const lighter = fromHero ? (aggression - 0.3) * 0.2 : 0;
  const vsShover = fromHero ? Math.min(0.7, shoveRate) : 0; // someone who shoves all the time has any two cards
  const careful = loose + 0.3 * (aggr - 0.5) < 0.42 && variant !== 'omaha'; // a nit: bets and calls big only with a hand
  const nerve = Math.min(1, 8 * aggr ** 1.5 * loose ** 3); // how readily a character bluffs: needs both the appetite to bet and the looseness to do it with nothing: a maniac 1, a steady player about 0.4, a careful one 0.15
  let think = 0.1 + rng() * 0.25;

  const out = (a, extra) => ({ ...a, think: Math.min(1, think), ...extra });
  const passive = () => out({ type: toCall > 0 ? 'call' : 'check' });
  const giveUp = () => out({ type: toCall > 0 ? 'fold' : 'check' });
  let drawn; // does a nit have the goods for a big bet: a pair of ours or better, or a draw with 8+ outs
  const goods = () => drawn ??= madeHand(p.cards, g.board, variant === 'short') || drawOuts(p.cards, g.board, variant === 'short') >= 8;
  const bigBet = toCall / Math.max(pot - toCall, 1) >= 0.5;
  const raise = (frac, extra = {}) => {
    if (!L.canRaise) return passive();
    if (careful && g.street !== 'preflop' && !goods()) { // nothing to bet or call big with: nothing, or a small stab
      if (toCall > 0) return bigBet ? giveUp() : passive();
      frac = Math.min(frac, 0.4);
      if (Math.max(L.minTo, Math.round((frac * pot) / g.sb) * g.sb) >= 0.5 * pot) return passive();
    }
    if (extra.bluff && tell === 'bigBluff') frac = 1.15; // overbets when he has nothing
    if (extra.strong && tell === 'smallValue') frac = 0.33; // bets small when she has it
    const to = Math.round((g.currentBet + frac * (pot + toCall)) / g.sb) * g.sb;
    return out({ type: 'raise', amount: Math.max(L.minTo, Math.min(to, L.maxTo)) }, extra);
  };

  if (g.street === 'preflop') {
    const behind = g.players.filter((q) => q !== p && !q.folded && !q.allIn && !q.acted).length;
    const position = behind <= 1 ? 1 : behind >= 4 ? -0.5 : 0; // looser late, tighter early
    const rs = strength(p.cards) - 1.25 + (rng() - 0.5) + (opp <= 2 ? 2 : 0) + position + lighter * 10 + (truth === null ? 0 : (truth - 0.5) * 12 * cheat); // what the cards are worth for raising (a hand is never judged exactly the same twice, so a style is a smooth rate, not a cliff)
    const s = rs + (loose - 0.5) * 10; // ...and how much the character wants to play them: loose adds to that, never to raising
    const cost = toCall / bb;
    const raised = g.currentBet > bb;
    const raw = strength(p.cards) + (opp <= 2 ? 2 : 0) + (truth === null ? 0 : (truth - 0.5) * 12 * cheat); // the cards themselves, without the character's wishful thinking
    const shove = toCall >= p.chips; // calling puts us all-in
    const stackBB = (p.chips + p.bet) / bb;
    if (cost > 4) think += 0.35;
    // A big bet is a decision for the whole stack. How good a hand that takes depends on who we are (a careful
    // player wants more, a loose one less), on who is betting (against a habitual shover, far less; once wise to
    // you, as if you shove half the time) and on our stack (short stacks are priced in and call wide).
    // The cards alone count here, not how many are left in the hand, so a bigger table is never softer.
    if (cost > 12 || (shove && (toCall > 5 * bb || (stackBB <= 8 && toCall > bb)))) {
      think += 0.3;
      const cards = strength(p.cards) + (truth === null ? 0 : (truth - 0.5) * 12 * cheat) + (rng() - 0.5) * 1.2; // a hand is never judged exactly the same twice
      return cards >= shoveCut(loose, wise && fromHero ? Math.max(vsShover, 0.5) : vsShover, stackBB) ? passive() : giveUp();
    }
    const openRaise = Math.min(0.95, aggr * (1.5 + 0.3 * Math.max(0, Math.min(1, (rs - 6) / 6)))); // how often a hand worth playing is raised: mostly the character, a little the cards
    if (rs >= 10.5) {
      const premium = rs >= 13;
      if (cost > 6 && !premium) return passive();
      if (raised && (raw < 10 || (careful && strength(p.cards) < 11))) return passive(); // re-raising takes real cards, whoever you are (and a nit wants a premium hand)
      return rng() < 0.35 + 0.6 * aggr ? raise(1, { strong: true }) : passive(); // aggression decides how often a good hand raises rather than calls
    }
    if (s >= 8) {
      if (!raised) return rng() < openRaise ? raise(0.8) : passive();
      if (cost > 9) return giveUp();
      return raw >= 7 && !careful && rng() < 0.8 * aggr * aggr ? raise(0.9) : passive();
    }
    if (s >= 6) {
      if (!raised) return rng() < openRaise ? raise(0.8) : passive();
      return cost <= 1 + 7.5 * loose ? passive() : giveUp(); // a loose player pays to see a raise with a so-so hand, a tight one folds it
    }
    if (s >= 4.5) return cost <= 1 && rng() < Math.max(0, 1.6 * loose - 0.5) ? passive() : giveUp();
    if (!raised && toCall > 0 && rng() < 0.08 * nerve * bluffy * (1 + position)) return raise(0.8, { bluff: true }); // steal
    return giveUp();
  }

  let e = equity(p.cards, g.board, Math.min(opp, 3), variant === 'omaha' ? 90 : 200, rng, variant) + (loose - 0.5) * 0.06 + (rng() - 0.5) * sloppy * 0.2 * (0.4 + loose); // careful players misjudge least
  if (truth !== null) e = e * (1 - cheat) + truth * cheat;
  let strong = e > 0.75;
  if (toCall === 0) {
    if (e > 0.7) return rng() < 0.45 + 0.5 * aggr ? raise(0.6 + rng() * 0.3, { strong }) : out({ type: 'check' }, { strong });
    if (e > 0.5) return rng() < 0.1 + 0.6 * aggr ? raise(0.4 + rng() * 0.2) : passive();
    if (opp <= 2 && rng() < 0.22 * nerve * bluffy * (g.street !== 'river' && e > 0.3 ? 1.6 : 0.6)) { think += 0.2; return raise(0.6, { bluff: true }); }
    return passive();
  }
  const odds = toCall / (pot + toCall);
  const pressure = toCall / Math.max(pot - toCall, 1);
  // Our chance was worked out against random cards, but someone who bets has more than that, the more so the
  // bigger the bet and the later the street. Sticky players discount this least, careful ones most; nobody
  // discounts much against a human who shoves constantly.
  const respect = 0.2 * Math.min(1.2, pressure) * (g.street === 'river' ? 1.25 : 1) * (1.15 - 0.6 * loose) * (1 - vsShover);
  e -= e * respect;
  const need = odds + 0.05 + Math.min(0.15, 0.1 * pressure) - lighter - sloppy * 0.05 - vsShover * 0.12 - (loose - 0.5) * 0.3; // a loose player pays more readily
  // close decisions for a big share of the stack take longest
  const close = 1 - Math.min(1, Math.abs(e - need) / 0.22);
  const stake = Math.min(1, toCall / Math.max(1, 0.3 * (p.chips + p.bet)));
  think += close * (0.25 + 0.6 * stake);
  strong = e > 0.75;
  if (e > 0.82 || (e > 0.68 && rng() < aggr * 0.5)) return raise(0.7 + rng() * 0.3, { strong });
  if (e >= need) return careful && bigBet && !goods() ? giveUp() : out({ type: 'call' }, { strong });
  // Once they are wise to you, a bet of up to the pot does not move anyone who holds a pair or better: they call.
  if (wise && fromHero && variant !== 'omaha' && pressure <= 1.1 && madeHand(p.cards, g.board, variant === 'short')) return out({ type: 'call' }, { strong });
  if (pressure < 0.6 && !careful && rng() < 0.06 * nerve * bluffy) return raise(0.8, { bluff: true });
  return giveUp();
}

// Chance each hand wins when all hole cards are known (all-in run-out). Ties count as shares.
export function runoutOdds(hands, board, sims = 700, rng = Math.random, variant = 'holdem') {
  const known = new Set([...hands.flat(), ...board]);
  const deck = [];
  for (let c = variant === 'short' ? 16 : 0; c < 52; c++) if (!known.has(c)) deck.push(c);
  const need = 5 - board.length;
  const wins = hands.map(() => 0);
  const n = need === 0 ? 1 : sims;
  for (let s = 0; s < n; s++) {
    for (let i = 0; i < need; i++) {
      const j = i + Math.floor(rng() * (deck.length - i));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    const full = board.concat(deck.slice(0, need));
    const scores = hands.map((h) => scoreHand(h, full, variant));
    const best = Math.max(...scores);
    const share = 1 / scores.filter((x) => x === best).length;
    scores.forEach((x, k) => { if (x === best) wins[k] += share; });
  }
  return wins.map((w) => w / n);
}
