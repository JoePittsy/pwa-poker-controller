// AI opponents: Chen-formula preflop play, Monte Carlo equity vs pot odds postflop,
// shaded by a per-player style { loose: 0..1, aggr: 0..1, tell } and by how the human
// has been playing. Each decision also reports how hard it was (`think`, 0..1) and
// whether it is a `bluff` or a `strong` hand, which the UI turns into timing tells.
import { scoreHand } from './cards.js';

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

// human: { foldToBet, aggression } — observed tendencies of the human player, 0..1
const K = JSON.parse(process.env.K || '{}');
const RA = K.RA ?? 1, RB = K.RB ?? 0.2, SL = K.SL ?? 0.2, TB = K.TB ?? 0.3, TIGHT = K.C ?? 1.5, LOOSE_SPAN = K.LF ?? 10;
export function decide(g, seat, rng = Math.random, human = {}) {
  const p = g.players[seat];
  const L = g.legal(seat);
  const { loose = 0.5, aggr = 0.5, tell, skill = 1, cheat = 0, noBluff = false } = p.style || {};
  const sloppy = 1 - skill; // weaker players see their hands less clearly and call too much
  const { foldToBet = 0.4, aggression = 0.3, shove: shoveRate = 0 } = human; // shove: how often the human moves all in
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
  const nerve = Math.min(1, aggr ** 1.5 * (0.2 + loose)); // how readily a character bluffs: needs both the appetite to bet and the looseness to do it with nothing
  let think = 0.1 + rng() * 0.25;

  const out = (a, extra) => ({ ...a, think: Math.min(1, think), ...extra });
  const passive = () => out({ type: toCall > 0 ? 'call' : 'check' });
  const giveUp = () => out({ type: toCall > 0 ? 'fold' : 'check' });
  const raise = (frac, extra = {}) => {
    if (!L.canRaise) return passive();
    if (extra.bluff && tell === 'bigBluff') frac = 1.15; // overbets when he has nothing
    if (extra.strong && tell === 'smallValue') frac = 0.33; // bets small when she has it
    const to = Math.round((g.currentBet + frac * (pot + toCall)) / g.sb) * g.sb;
    return out({ type: 'raise', amount: Math.max(L.minTo, Math.min(to, L.maxTo)) }, extra);
  };

  if (g.street === 'preflop') {
    const behind = g.players.filter((q) => q !== p && !q.folded && !q.allIn && !q.acted).length;
    const position = behind <= 1 ? 1 : behind >= 4 ? -0.5 : 0; // looser late, tighter early
    const rs = strength(p.cards) - TIGHT + (opp <= 2 ? 2 : 0) + position + lighter * 10 + sloppy * SL + (truth === null ? 0 : (truth - 0.5) * 12 * cheat); // what the cards are worth for raising
    const s = rs + (loose - 0.5) * LOOSE_SPAN; // ...and how much the character wants to play them: loose adds to that, never to raising
    const cost = toCall / bb;
    const raised = g.currentBet > bb;
    const raw = strength(p.cards) + (opp <= 2 ? 2 : 0) + (truth === null ? 0 : (truth - 0.5) * 12 * cheat); // the cards themselves, without the character's wishful thinking
    const shove = toCall >= p.chips; // calling puts us all-in
    if (cost > 4) think += 0.35;
    // A big bet is a decision for the whole stack. How good a hand that takes depends on who we are (a careful
    // player wants more, a loose one less) and on who is betting: against a habitual shover, far less.
    if (cost > 12 || (shove && toCall > 5 * bb)) {
      think += 0.3;
      return raw >= 10 + (0.5 - loose) * 3 - vsShover * 6 ? passive() : giveUp();
    }
    const openRaise = Math.min(0.95, aggr * (RA + RB * Math.max(0, Math.min(1, (rs - 6) / 6)))); // how often a hand worth playing is raised: mostly the character, a little the cards
    if (rs >= 11) {
      const premium = rs >= 13;
      if (cost > 6 && !premium) return passive();
      if (raised && raw < 10) return passive(); // re-raising takes real cards, whoever you are
      return rng() < 0.35 + 0.6 * aggr ? raise(1, { strong: true }) : passive(); // aggression decides how often a good hand raises rather than calls
    }
    if (s >= 8) {
      if (!raised) return rng() < openRaise ? raise(0.8) : passive();
      if (cost > 9) return giveUp();
      return raw >= 7 && rng() < TB * aggr * aggr ? raise(0.9) : passive();
    }
    if (s >= 6) {
      if (!raised) return rng() < openRaise ? raise(0.8) : passive();
      return cost <= 3.5 ? passive() : giveUp();
    }
    if (s >= 4.5) return cost <= 1 && rng() < 0.2 + 0.75 * loose ? passive() : giveUp();
    if (!raised && toCall > 0 && rng() < 0.08 * nerve * bluffy * (1 + position)) return raise(0.8, { bluff: true }); // steal
    return giveUp();
  }

  let e = equity(p.cards, g.board, Math.min(opp, 3), variant === 'omaha' ? 90 : 200, rng, variant) + (loose - 0.5) * 0.06 + (rng() - 0.5) * sloppy * 0.2 * (0.4 + loose); // careful players misjudge least
  if (truth !== null) e = e * (1 - cheat) + truth * cheat;
  let strong = e > 0.75;
  if (toCall === 0) {
    if (e > 0.7) return rng() < 0.45 + 0.5 * aggr ? raise(0.6 + rng() * 0.3, { strong }) : out({ type: 'check' }, { strong });
    if (e > 0.5) return rng() < 0.1 + 0.6 * aggr ? raise(0.4 + rng() * 0.2) : passive();
    if (opp <= 2 && rng() < 0.12 * aggr * bluffy) { think += 0.2; return raise(0.6, { bluff: true }); }
    return passive();
  }
  const odds = toCall / (pot + toCall);
  const pressure = toCall / Math.max(pot - toCall, 1);
  // Our chance was worked out against random cards, but someone who bets has more than that, the more so the
  // bigger the bet and the later the street. Sticky players discount this least, careful ones most; nobody
  // discounts much against a human who shoves constantly.
  const respect = 0.2 * Math.min(1.2, pressure) * (g.street === 'river' ? 1.25 : 1) * (1.15 - 0.6 * loose) * (1 - vsShover);
  e -= e * respect;
  const need = odds + 0.05 + Math.min(0.15, 0.1 * pressure) - lighter - sloppy * 0.05 - vsShover * 0.12;
  // close decisions for a big share of the stack take longest
  const close = 1 - Math.min(1, Math.abs(e - need) / 0.22);
  const stake = Math.min(1, toCall / Math.max(1, 0.3 * (p.chips + p.bet)));
  think += close * (0.25 + 0.6 * stake);
  strong = e > 0.75;
  if (e > 0.82 || (e > 0.68 && rng() < aggr * 0.5)) return raise(0.7 + rng() * 0.3, { strong });
  if (e >= need) return out({ type: 'call' }, { strong });
  if (pressure < 0.6 && rng() < 0.04 * aggr * bluffy) return raise(0.8, { bluff: true });
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
