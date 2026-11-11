// Who finished where online: within one game, across the games played in one room, and in the
// record each device keeps of the games it took part in.
export const POINTS = [5, 3, 2]; // first, second, third; everyone else who played gets 1

/** Finishing order, best first: the winner, then the others from last out to first out. */
export function placings(winner, busts) {
  const out = [...new Set(busts)].filter((n) => n !== winner);
  return [winner, ...out.reverse()];
}
/** Adds one finished game (names in finishing order) to a room's running session. */
export function addGame(session, order) {
  const s = session || { games: 0, rows: {} };
  s.games++;
  order.forEach((name, i) => {
    const r = s.rows[name] || (s.rows[name] = { wins: 0, points: 0, games: 0 });
    r.games++; r.points += POINTS[i] ?? 1; if (i === 0) r.wins++;
  });
  return s;
}
/** A session as a table, leader first: points, then wins, then name. */
export const table = (session) => Object.entries(session?.rows || {}).map(([name, r]) => ({ name, ...r }))
  .sort((a, b) => b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name));

const clean = (n) => String(n ?? '').replace(/[^\p{L}\p{N} ]/gu, '').trim().slice(0, 12);
/** Reads a device's stored record of online games, dropping anything malformed. */
export function readLog(text) {
  let list = [];
  try { list = JSON.parse(text) || []; } catch { /* nothing stored */ }
  if (!Array.isArray(list)) return [];
  return list.filter((g) => g && Array.isArray(g.order) && g.order.length > 1 && Number.isFinite(g.at))
    .map((g) => ({ at: g.at, order: g.order.map(clean).filter(Boolean).slice(0, 6), me: clean(g.me), hands: Math.max(0, Math.floor(+g.hands) || 0) })).filter((g) => g.order.length > 1);
}
/** Adds a finished game to the record, newest first, keeping the last forty. */
export const addLog = (log, entry) => [{ at: entry.at, order: entry.order.map(clean), me: clean(entry.me), hands: entry.hands || 0 }, ...log].slice(0, 40);
/** All-time wins by name across the record, most first. */
export function tally(log) {
  const wins = {};
  for (const g of log) wins[g.order[0]] = (wins[g.order[0]] || 0) + 1;
  return Object.entries(wins).map(([name, n]) => ({ name, wins: n })).sort((a, b) => b.wins - a.wins || a.name.localeCompare(b.name));
}
/** Where one player came in a game, 1 being the winner; 0 if they were not in it. */
export const placeOf = (game, name) => game.order.indexOf(name) + 1;
