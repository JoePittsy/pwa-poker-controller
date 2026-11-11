// Handing an online game to a new host. Only the host knows the cards, so the hand in progress
// cannot be carried over: bets are returned and the hand is dealt again by the new host.
// What does carry over is everything the guests already know: who sits where and how many chips they have.
/**
 * state: { players: [{ name, chips, total, ... }], dealer, handNo, stage } as a guest last saw the table.
 * me: the seat of the player taking over. Returns the table as the new host should seat it, with the
 * new host in seat 0 and everyone else in the same order round the table.
 */
export function handover(state, me) {
  const n = state.players.length, at = (seat) => (seat - me + n) % n;
  const mid = state.stage !== 'handOver' && state.stage !== 'idle'; // a hand was being played: give the bets back
  const players = new Array(n);
  state.players.forEach((p, seat) => {
    const { total, ...rest } = p;
    players[at(seat)] = { ...rest, chips: Math.max(0, Math.floor(p.chips + (mid ? total || 0 : 0))), wasHost: seat === 0 }; // the host always sits in seat 0
  });
  return { players, dealer: state.dealer >= 0 ? at(state.dealer) : -1, handNo: Math.max(0, state.handNo - (mid ? 1 : 0)) };
}
/** The people the new host should expect back: everyone still in with chips, other than themselves and the host who went missing. */
export const expected = (resume) => resume.players.map((p, seat) => ({ ...p, seat })).filter((p) => p.seat > 0 && p.isHuman && !p.wasHost && p.chips > 0);
