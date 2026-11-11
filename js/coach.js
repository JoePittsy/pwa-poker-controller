// The coach: how one decision is judged, and how a session's decisions add up into habits.
// A decision is { type, street, eq, need, toCall, to }: what you did, your rough chance of winning at
// the time (against random cards for everyone still in) and the share of the pot a call was asking for.
/** Judges one decision. Returns [kind, what you did, why], kind being good | meh | bad | bluff. */
export function judge(d) {
  const e = Math.round(d.eq * 100), n = Math.round(d.need * 100);
  if (d.type === 'fold') {
    return d.eq > d.need + 0.1 ? ['bad', 'Fold', `Folding gave up a good price: you were about ${e}% to win and only needed ${n}%.`]
      : ['good', 'Fold', `A sound fold: about ${e}% to win against the ${n}% the call needed.`];
  }
  if (d.type === 'call') {
    if (d.eq < d.need - 0.08) return ['bad', `Call ${d.toCall}`, `Too loose: about ${e}% to win, but the call needed ${n}%.`];
    if (d.eq > 0.7) return ['meh', `Call ${d.toCall}`, `Fine, but at about ${e}% to win a raise would have built a bigger pot.`];
    return ['good', `Call ${d.toCall}`, `A fair call: about ${e}% to win for a price that needed ${n}%.`];
  }
  if (d.type === 'check') {
    return d.eq > 0.7 ? ['meh', 'Check', `Missed value: you were about ${e}% to have the best hand and bet nothing.`]
      : ['good', 'Check', `Nothing to bet with at about ${e}%. ${d.street === 'river' ? 'Checking was fine.' : 'Taking a free card was fine.'}`];
  }
  const what = `${d.toCall ? 'Raise to' : 'Bet'} ${d.to}`;
  if (d.eq < 0.35) return ['bluff', what, `A bluff: only about ${e}% to win if called, so it needed them to fold.`];
  if (d.eq > 0.6) return ['good', what, `Betting for value at about ${e}% to win.`];
  return ['meh', what, `A thin bet at about ${e}%: fine against few players, risky against many.`];
}

// The habits a session is sorted into, with what to do about each.
const HABITS = {
  looseCall: ['bad', 'Calling too loose', 'You paid more than your hand was worth. Before calling, compare your chance with the price: fold when it falls short.'],
  tightFold: ['bad', 'Folding good prices', 'You gave up hands the pot was paying you to play. A small bet into a big pot needs very little to call.'],
  missedValue: ['meh', 'Missing value', 'You held the best hand and let them see cards for free, or only called. Bet when you are well ahead.'],
  thinBet: ['meh', 'Thin bets', 'Bets with a middling hand: fine against one player, expensive against several.'],
  bluff: ['bluff', 'Bluffs', 'Bets that needed a fold. A few are healthy; they work best against one opponent who has shown weakness.'],
  sound: ['good', 'Sound plays', 'Folds, calls and bets that the numbers supported.'],
};
/** Which habit a decision belongs to. */
export function habitOf(d) {
  const [kind] = judge(d);
  if (kind === 'good') return 'sound';
  if (kind === 'bluff') return 'bluff';
  if (d.type === 'call') return kind === 'bad' ? 'looseCall' : 'missedValue';
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
    if (kind === 'bad' && (!pick || Math.abs(d.eq - d.need) > pick.gap)) pick = { gap: Math.abs(d.eq - d.need), street: d.street, what, why };
  }
  return pick;
}
