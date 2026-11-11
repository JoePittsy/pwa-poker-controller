import { chen, equity } from './ai.js';
import { scoreHand } from './cards.js';

// The coach: how one decision is judged, and how a session's decisions add up into habits.
// A decision is { type, street, eq, need, toCall, to, pot, opp?, allin? }: what you did, your rough chance of winning at
// the time (against random cards for everyone still in) and the share of the pot a call was asking for.
const EPS = 1e-9; // so that 0.30 counts as 0.25 + 0.05
/** Judges one decision. Returns [kind, what you did, why], kind being good | meh | bad | bluff. */
export function judge(d) {
  const e = Math.round(d.eq * 100), n = Math.round(d.need * 100);
  if (d.type === 'fold') {
    return d.eq > d.need + 0.15 && d.eq > 0.5 ? ['bad', 'Fold', `Folding gave up a good price: you were about ${e}% to win and only needed ${n}%.`]
      : ['good', 'Fold', `A sound fold: about ${e}% to win against the ${n}% the call needed.`];
  }
  if (d.type === 'call') {
    if (d.eq < d.need && d.eq < 0.15) return ['bad', `Call ${d.toCall}`, `Too loose: about ${e}% to win, but the call needed ${n}%.`]; // almost no chance is never a close call
    if (closeCall(d)) return ['meh', `Call ${d.toCall}`, `A close call: about ${e}% to win against the ${n}% it needed. Either choice was fine.`];
    if (d.eq < d.need - 0.08) return ['bad', `Call ${d.toCall}`, `Too loose: about ${e}% to win, but the call needed ${n}%.`];
    if (d.eq < d.need) return ['meh', `Call ${d.toCall}`, `A marginal call: about ${e}% to win against the ${n}% it needed. Close, but slightly behind the price.`];
    if (d.eq > 0.85) return ['meh', `Call ${d.toCall}`, `Fine, but at about ${e}% to win a raise would have built a bigger pot.`];
    return ['good', `Call ${d.toCall}`, `A good call: about ${e}% to win for a price that needed ${n}%.`];
  }
  if (d.type === 'check') {
    return d.eq > 0.7 ? ['meh', 'Check', `Missed value: you were about ${e}% to have the best hand and bet nothing.`]
      : ['good', 'Check', `Nothing to bet with at about ${e}%. ${d.street === 'river' ? 'Checking was fine.' : 'Taking a free card was fine.'}`];
  }
  const what = `${d.toCall ? 'Raise to' : 'Bet'} ${d.to}`;
  const opp = Math.max(1, d.opp || 1), fair = 1 / (opp + 1); // an average hand's share against that many opponents
  if (d.allin) {
    if (d.eq >= fair + 0.05 - EPS) return ['good', 'All in', `All in as the favourite: about ${e}% to win if called.`];
    if (d.eq < fair - 0.1) return ['bluff', 'All in', `An all-in bluff: about ${e}% if called, so it needed a fold.`];
    return ['meh', 'All in', `A coin-flip all-in: about ${e}% if called. Fine when the blinds are high, reckless when they are not.`];
  }
  if (d.street === 'preflop' && d.toCall <= d.pot / 2 && d.eq >= fair + 0.05 - EPS) return ['good', what, 'A standard raise with a hand that is ahead of the field.']; // nobody has raised yet
  if (d.eq >= fair + 0.08 - EPS) return ['good', what, `Betting for value at about ${e}% to win, against ${opp} opponent${opp === 1 ? '' : 's'}.`];
  if (d.eq < fair - 0.1) return ['bluff', what, `A bluff: only about ${e}% to win if called, so it needed them to fold.`];
  return ['meh', what, `A thin bet at about ${e}%: fine if they fold often, costly if called.`];
}
/** A call within five points of its price is a coin-flip either way, unless the chance is nearly nil. */
const closeCall = (d) => Math.abs(d.eq - d.need) <= 0.05 && d.eq >= 0.15;

// The habits a session is sorted into, with what to do about each.
const HABITS = {
  looseCall: ['bad', 'Calling too loose', 'You paid more than your hand was worth. Before calling, compare your chance with the price: fold when it falls short.'],
  tightFold: ['bad', 'Folding good prices', 'You gave up hands the pot was paying you to play. A small bet into a big pot needs very little to call.'],
  missedValue: ['meh', 'Missing value', 'You held the best hand and let them see cards for free, or only called. Bet when you are well ahead.'],
  thinBet: ['meh', 'Thin bets', 'Bets with a middling hand: fine against one player, expensive against several.'],
  bluff: ['bluff', 'Bluffs', 'Bets that needed a fold. A few are healthy; they work best against one opponent who has shown weakness.'],
  sound: ['good', 'Solid plays', 'Folds, calls and bets that the numbers supported.'],
};
/** Which habit a decision belongs to. */
export function habitOf(d) {
  const [kind] = judge(d);
  if (kind === 'good') return 'sound';
  if (kind === 'bluff') return 'bluff';
  if (d.type === 'call' && closeCall(d)) return 'sound'; // a close call either way is no leak
  if (d.type === 'call') return kind === 'bad' || d.eq < d.need ? 'looseCall' : 'missedValue';
  if (d.type === 'fold') return 'tightFold';
  if (d.type === 'check') return 'missedValue';
  return 'thinBet';
}
/**
 * Adds up every decision in a list of hands (each with `mine`, the decisions you made).
 * Returns { total, hands, sound: share of decisions that were sound, headline, list: habits seen, mistakes first }.
 */
export function leaks(hands) {
  const seen = {};
  let total = 0, played = 0;
  for (const h of hands) {
    if (!h.mine?.length) continue;
    played++;
    for (const d of h.mine) {
      const k = habitOf(d), s = seen[k] || (seen[k] = { count: 0, cost: 0 });
      s.count++; total++;
      if (k === 'looseCall') s.cost += d.toCall || 0;
    }
  }
  const order = ['looseCall', 'tightFold', 'missedValue', 'thinBet', 'bluff', 'sound'];
  const list = order.filter((k) => seen[k]).map((k) => ({ key: k, kind: HABITS[k][0], name: HABITS[k][1], tip: HABITS[k][2], ...seen[k] }));
  const worst = list.filter((l) => l.kind === 'bad' || l.kind === 'meh').sort((a, b) => Number(b.kind === 'bad') - Number(a.kind === 'bad') || b.count - a.count)[0];
  const sound = total ? (seen.sound?.count || 0) / total : 0;
  const headline = !total ? '' : !worst ? 'Nothing to fix: every decision held up.' : `Your biggest leak: ${worst.name.toLowerCase()}.`;
  return { total, hands: played, sound, headline, list };
}
/** The one decision in a hand most worth a word from the coach, or null if none was a mistake. */
export function worstOf(hand) {
  let pick = null;
  for (const d of hand?.mine || []) {
    const [kind, what, why] = judge(d);
    if (kind === 'bad' && d.type === 'call' && d.street === 'preflop' && d.need - d.eq < 0.3 && !(d.toCall >= d.pot / 4)) continue; // a small price before the flop is not worth a scolding
    if (kind === 'bad' && (!pick || Math.abs(d.eq - d.need) > pick.gap)) pick = { gap: Math.abs(d.eq - d.need), street: d.street, what, why };
  }
  return pick;
}

/**
 * A chance worked out against random cards runs high when someone is betting: people bet with more than
 * random cards, and the bigger the bet and the later the street, the more they have. This marks the chance
 * down accordingly. toCall is what you must put in; pot is everything in the middle including that bet;
 * street is 'preflop' | 'flop' | 'turn' | 'river'. A pot-sized bet takes off about four tenths, more on the river.
 */
export function facingBet(eq, toCall, pot, street = 'flop') {
  if (!(toCall > 0)) return eq;
  const size = Math.min(1.2, toCall / Math.max(1, pot - toCall)); // the bet as a share of what was there before it
  const late = street === 'river' ? 1.25 : street === 'turn' ? 1.1 : 1;
  return eq * (1 - Math.min(0.6, 0.4 * size * late));
}

/**
 * Your chance of winning against opponents who hold what their betting suggests, not random cards.
 * opps: one { loose: 0..1, pressure: 0..1 } per opponent still in. Each is dealt only hands with Chen points
 * at or above 2 + (1 - loose) * 5 + pressure * 5, and after the flop a bettor often has to have connected.
 * Wins count 1, ties 0.5. Omaha and short deck fall back to random hands.
 */
export function rangeEquity(hole, board, opps, sims = 300, rng = Math.random, variant = 'holdem') {
  if (variant === 'omaha' || variant === 'short') return equity(hole, board, opps.length, sims, rng, variant);
  const n = opps.length;
  if (!n) return 1;
  const stamp = new Uint8Array(52);
  const taken = [...hole, ...board];
  for (const c of taken) stamp[c] = 1;
  const draw = () => { let c; do c = Math.floor(rng() * 52); while (stamp[c]); return c; };
  let win = 0;
  const used = [];
  for (let s = 0; s < sims; s++) {
    const hands = [];
    const take = (c) => { stamp[c] = 1; used.push(c); };
    const deal = (cutoff) => {
      /** @type {[number, number]} */
      let h = [0, 0];
      for (let i = 0; i < 20; i++) {
        const a = draw(); stamp[a] = 1;
        const b = draw(); stamp[a] = 0;
        h = [a, b];
        if (chen(h) >= cutoff) break;
      }
      return h;
    };
    for (const { loose, pressure, entered = true } of opps) {
      // A loose player bets with less than a careful one does, so the same bet says less about their cards.
      const told = pressure * Math.min(1, 1.3 - loose);
      const cutoff = entered ? 1 + (1 - loose) * 4 + told * 5 : -99; // someone who has put nothing in by choice could hold anything
      let h = deal(cutoff);
      if (board.length >= 3 && told >= 0.3 && rng() < told) {
        for (let t = 0; t < 10 && Math.floor(scoreHand(h, board, variant) / 13 ** 5) < 1; t++) h = deal(cutoff);
      }
      take(h[0]); take(h[1]);
      hands.push(h);
    }
    const full = board.slice();
    while (full.length < 5) { const c = draw(); take(c); full.push(c); }
    const mine = scoreHand(hole, full, variant);
    let best = 0;
    for (const h of hands) best = Math.max(best, scoreHand(h, full, variant));
    win += mine > best ? 1 : mine === best ? 0.5 : 0;
    for (const c of used) stamp[c] = 0;
    used.length = 0;
  }
  return win / sims;
}
