// Each opponent's read on you, this run. They remember how you have played against them in
// particular, change how they play you, and say so. You can then use it against them, and a read
// that costs them is dropped.
//   mem[name] = { gaveUp: times they folded to your bet, pushed: times you folded to theirs,
//                 wise: they have stopped believing your bets, bully: they think you fold too much }
export const READ_AT = 3;
const of = (mem, name) => mem[name] || (mem[name] = {});

/** They folded to your bet or raise. Returns 'wise' the moment they decide to stop doing that. */
export function noteGaveUp(mem, name) {
  const m = of(mem, name);
  m.gaveUp = (m.gaveUp || 0) + 1;
  if (m.gaveUp >= READ_AT && !m.wise) { m.wise = true; return 'wise'; }
  return '';
}
/** You folded to their bet or raise. Returns 'bully' the moment they decide to keep leaning on you. */
export function notePushed(mem, name) {
  const m = of(mem, name);
  m.pushed = (m.pushed || 0) + 1;
  if (m.pushed >= READ_AT && !m.bully) { m.bully = true; return 'bully'; }
  return '';
}
/**
 * A showdown between you and them that you won. A read that just cost them chips is dropped:
 * they called your bet and you had it ('fooled'), or they bet and you called and won ('stood').
 */
export function noteShowdownWon(mem, name, { youBet, youCalledThem }) {
  const m = mem[name];
  if (!m) return '';
  if (m.wise && youBet) { m.wise = false; m.gaveUp = 0; return 'fooled'; }
  if (m.bully && youCalledThem) { m.bully = false; m.pushed = 0; return 'stood'; }
  return '';
}
/** How they see you, as the AI uses it: start from how you play in general, then bend it by their read. */
export function adjust(profile, m) {
  if (!m) return profile;
  return {
    ...profile, // everything else known about you carries through unchanged
    foldToBet: Math.min(0.95, profile.foldToBet + (m.bully ? 0.25 : 0)), // bluff you more
    aggression: Math.min(0.95, profile.aggression + (m.wise ? 0.5 : 0)), // call you lighter
    ...(m.wise ? { wise: true } : {}), // and never fold a pair to a bet of up to the pot (see decide in ai.js)
  };
}
/** For the notebook: what they currently think of you, in words. */
export function readText(m) {
  if (!m) return '';
  const times = (n) => (n === 1 ? 'once' : `${n} times`);
  return [m.wise ? `Folded to your bets ${times(m.gaveUp ?? READ_AT)}: calls you lighter now` : '',
    m.bully ? `You folded to them ${times(m.pushed ?? READ_AT)}: bets at you more now` : ''].filter(Boolean).join(' \u00b7 ');
}
