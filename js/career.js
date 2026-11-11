// Career: a rank that only ever goes up, worked out from everything you have done in any mode.
// Nothing new is stored for it: experience is a sum over the lifetime stats, so it is already
// right for someone who has been playing for a while, and it travels with a backup.
/** @type {[number, string][]} */
export const LADDER = [[0, 'Rookie'], [150, 'Regular'], [500, 'Grinder'], [1200, 'Hustler'], [2500, 'Shark'], [5000, 'High Roller'], [9000, 'Card Sharp'], [15000, 'Legend']];
/** @type {[string, number, string][]} */
export const XP_FOR = [['hands', 1, 'each hand played'], ['won', 2, 'each hand won'], ['knockouts', 10, 'each knock-out'], ['tables', 40, 'each table cleared'], ['bosses', 80, 'each boss beaten'],
  ['daily', 30, 'each daily deal finished'], ['stickers', 25, 'each sticker earned'], ['online', 20, 'each online game finished'], ['onlineWins', 40, 'each online game won']];

/** Total experience. `stats` is the lifetime stats; `extra` carries counts kept elsewhere (daily deals, stickers). */
export function xpOf(stats, extra = {}) {
  const all = { ...stats, ...extra };
  return XP_FOR.reduce((sum, [key, each]) => sum + each * Math.max(0, Math.floor(Number(all[key]) || 0)), 0);
}
/** Where an amount of experience puts you: the rank, the next one, and how far along you are. */
export function rankOf(xp) {
  let index = 0;
  while (index + 1 < LADDER.length && xp >= LADDER[index + 1][0]) index++;
  const [at, name] = LADDER[index], next = LADDER[index + 1];
  return { index, name, xp, next: next ? next[1] : '', toNext: next ? next[0] - xp : 0, progress: next ? (xp - at) / (next[0] - at) : 1 };
}
export const rankName = (index) => LADDER[Math.max(0, Math.min(LADDER.length - 1, Math.floor(Number(index) || 0)))][1];
