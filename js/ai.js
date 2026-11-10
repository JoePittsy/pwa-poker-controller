// AI opponents: Chen-formula preflop play, Monte Carlo equity vs pot odds postflop,
// shaded by a per-player style { loose: 0..1, aggr: 0..1, tell } and by how the human
// has been playing. Each decision also reports how hard it was (`think`, 0..1) and
// whether it is a `bluff` or a `strong` hand, which the UI turns into timing tells.
import { evaluate } from './cards.js';

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

export function equity(hole, board, nOpp, sims = 200, rng = Math.random) {
  const known = new Set([...hole, ...board]);
  const deck = [];
  for (let c = 0; c < 52; c++) if (!known.has(c)) deck.push(c);
  const need = 5 - board.length + 2 * nOpp;
  let win = 0;
  for (let s = 0; s < sims; s++) {
    for (let i = 0; i < need; i++) {
      const j = i + Math.floor(rng() * (deck.length - i));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    const full = board.concat(deck.slice(0, 5 - board.length));
    const mine = evaluate(hole.concat(full));
    let best = 0, k = 5 - board.length;
    for (let o = 0; o < nOpp; o++, k += 2) best = Math.max(best, evaluate([deck[k], deck[k + 1], ...full]));
    win += mine > best ? 1 : mine === best ? 0.5 : 0;
  }
  return win / sims;
}

// human: { foldToBet, aggression } — observed tendencies of the human player, 0..1
export function decide(g, seat, rng = Math.random, human = {}) {
  const p = g.players[seat];
  const L = g.legal(seat);
  const { loose = 0.5, aggr = 0.5, tell } = p.style || {};
  const { foldToBet = 0.4, aggression = 0.3 } = human;
  const pot = g.pot, toCall = L.toCall, bb = g.bb;
  const opp = g.players.filter((q) => !q.folded && q !== p).length;
  const hero = g.players.find((q) => q.isHuman && !q.folded && q !== p);
  // bluff more at a human who folds a lot, call lighter against one who bets a lot
  const bluffy = hero ? 0.5 + foldToBet * 1.6 : 1;
  const lighter = hero && g.aggressor === hero.seat ? (aggression - 0.3) * 0.2 : 0;
  let think = 0.1 + rng() * 0.25;

  const out = (a, extra) => ({ ...a, think: Math.min(1, think), ...extra });
  const passive = () => out({ type: toCall > 0 ? 'call' : 'check' });
  const giveUp = () => out({ type: toCall > 0 ? 'fold' : 'check' });
  const raise = (frac, extra = {}) => {
    if (!L.canRaise) return passive();
    if (extra.bluff && tell === 'bigBluff') frac = 1.15; // overbets when he has nothing
    const to = Math.round((g.currentBet + frac * (pot + toCall)) / g.sb) * g.sb;
    return out({ type: 'raise', amount: Math.max(L.minTo, Math.min(to, L.maxTo)) }, extra);
  };

  if (g.street === 'preflop') {
    const behind = g.players.filter((q) => q !== p && !q.folded && !q.allIn && !q.acted).length;
    const position = behind <= 1 ? 1 : behind >= 4 ? -0.7 : 0; // looser late, tighter early
    const s = chen(p.cards) + (loose - 0.5) * 3 + (opp <= 2 ? 2 : 0) + position + lighter * 10;
    const cost = toCall / bb;
    const raised = g.currentBet > bb;
    const shove = toCall >= p.chips; // calling puts us all-in
    if (cost > 4) think += 0.35;
    if (s >= 11) return cost > 15 || rng() > 0.85 ? passive() : raise(1, { strong: true });
    if (shove && toCall > 5 * bb) { think += 0.3; return s >= 9.5 ? passive() : giveUp(); }
    if (s >= 8) {
      if (!raised) return rng() < 0.4 + 0.5 * aggr ? raise(0.8) : passive();
      if (cost > 9) return giveUp();
      return rng() < 0.15 * aggr ? raise(0.9) : passive();
    }
    if (s >= 6) {
      if (!raised) return rng() < 0.25 * aggr ? raise(0.8) : passive();
      return cost <= 3.5 ? passive() : giveUp();
    }
    if (s >= 4.5) return cost <= 1 && rng() < 0.5 + 0.4 * loose ? passive() : giveUp();
    if (!raised && toCall > 0 && rng() < 0.06 * aggr * bluffy * (1 + position)) return raise(0.8, { bluff: true }); // steal
    return giveUp();
  }

  const e = equity(p.cards, g.board, Math.min(opp, 3), 200, rng) + (loose - 0.5) * 0.06;
  const strong = e > 0.75;
  if (toCall === 0) {
    if (e > 0.7) return rng() < 0.6 + 0.35 * aggr ? raise(0.6 + rng() * 0.3, { strong }) : out({ type: 'check' }, { strong });
    if (e > 0.5) return rng() < 0.25 + 0.5 * aggr ? raise(0.4 + rng() * 0.2) : passive();
    if (opp <= 2 && rng() < 0.12 * aggr * bluffy) { think += 0.2; return raise(0.6, { bluff: true }); }
    return passive();
  }
  const odds = toCall / (pot + toCall);
  const pressure = toCall / Math.max(pot - toCall, 1);
  const need = odds + 0.05 + Math.min(0.15, 0.1 * pressure) - lighter;
  // close decisions for a big share of the stack take longest
  const close = 1 - Math.min(1, Math.abs(e - need) / 0.22);
  const stake = Math.min(1, toCall / Math.max(1, 0.3 * (p.chips + p.bet)));
  think += close * (0.25 + 0.6 * stake);
  if (e > 0.82 || (e > 0.68 && rng() < aggr * 0.5)) return raise(0.7 + rng() * 0.3, { strong });
  if (e >= need) return out({ type: 'call' }, { strong });
  if (pressure < 0.6 && rng() < 0.04 * aggr * bluffy) return raise(0.8, { bluff: true });
  return giveUp();
}
