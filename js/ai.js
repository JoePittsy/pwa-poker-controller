// AI opponents: Chen-formula preflop play, Monte Carlo equity vs pot odds postflop,
// shaded by a per-player style { loose: 0..1, aggr: 0..1 }.
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

export function decide(g, seat, rng = Math.random) {
  const p = g.players[seat];
  const L = g.legal(seat);
  const { loose = 0.5, aggr = 0.5 } = p.style || {};
  const pot = g.pot, toCall = L.toCall, bb = g.bb;
  const opp = g.players.filter((q) => !q.folded && q !== p).length;
  const passive = { type: toCall > 0 ? 'call' : 'check' };
  const giveUp = { type: toCall > 0 ? 'fold' : 'check' };
  const raise = (frac) => {
    if (!L.canRaise) return passive;
    const to = Math.round((g.currentBet + frac * (pot + toCall)) / g.sb) * g.sb;
    return { type: 'raise', amount: Math.max(L.minTo, Math.min(to, L.maxTo)) };
  };

  if (g.street === 'preflop') {
    const s = chen(p.cards) + (loose - 0.5) * 3 + (opp <= 2 ? 2 : 0);
    const cost = toCall / bb;
    const raised = g.currentBet > bb;
    const shove = toCall >= p.chips; // calling puts us all-in
    if (s >= 11) return cost > 15 || rng() > 0.85 ? passive : raise(1);
    if (shove && toCall > 5 * bb) return s >= 9.5 ? passive : giveUp;
    if (s >= 8) {
      if (!raised) return rng() < 0.4 + 0.5 * aggr ? raise(0.8) : passive;
      if (cost > 9) return giveUp;
      return rng() < 0.15 * aggr ? raise(0.9) : passive;
    }
    if (s >= 6) {
      if (!raised) return rng() < 0.25 * aggr ? raise(0.8) : passive;
      return cost <= 3.5 ? passive : giveUp;
    }
    if (s >= 4.5) return cost <= 1 && rng() < 0.5 + 0.4 * loose ? passive : giveUp;
    if (!raised && toCall > 0 && rng() < 0.06 * aggr) return raise(0.8); // steal
    return giveUp;
  }

  const e = equity(p.cards, g.board, Math.min(opp, 3), 200, rng) + (loose - 0.5) * 0.06;
  if (toCall === 0) {
    if (e > 0.7) return rng() < 0.6 + 0.35 * aggr ? raise(0.6 + rng() * 0.3) : passive;
    if (e > 0.5) return rng() < 0.25 + 0.5 * aggr ? raise(0.4 + rng() * 0.2) : passive;
    if (opp <= 2 && rng() < 0.12 * aggr) return raise(0.6); // bluff
    return passive;
  }
  const odds = toCall / (pot + toCall);
  const pressure = toCall / Math.max(pot - toCall, 1);
  const need = odds + 0.05 + Math.min(0.15, 0.1 * pressure);
  if (e > 0.82 || (e > 0.68 && rng() < aggr * 0.5)) return raise(0.7 + rng() * 0.3);
  if (e >= need) return passive;
  if (pressure < 0.6 && rng() < 0.04 * aggr) return raise(0.8); // bluff raise
  return giveUp;
}
