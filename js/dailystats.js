// What makes the daily deal worth coming back to: streaks, medals, and friends' scores.
// Everyone gets the same deal on the same date, so a score means the same thing on every device.
// There is no server: a friend's score arrives in a link they share, and is kept on this device.
/** @type {[number, string][]} */
export const MEDALS = [[2500, 'Gold'], [1500, 'Silver'], [1000, 'Bronze']]; // you start a deal with 1,000
export const medal = (score) => MEDALS.find(([at]) => score >= at)?.[1] || '';
const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayBefore = (date) => { const [y, m, d] = date.split('-').map(Number); return key(new Date(y, m - 1, d - 1)); };

/** Days in a row played, ending today or (if today's is not played yet) yesterday. */
export function streak(scores, today) {
  let day = scores[today] !== undefined ? today : dayBefore(today), n = 0;
  while (scores[day] !== undefined) { n++; day = dayBefore(day); }
  return n;
}
/** The longest run of consecutive days ever played. */
export function bestStreak(scores) {
  let best = 0;
  for (const day of Object.keys(scores)) {
    if (scores[dayBefore(day)] !== undefined) continue; // not the start of a run
    let n = 0, d = day;
    while (scores[d] !== undefined) { n++; const [y, m, dd] = d.split('-').map(Number); d = key(new Date(y, m - 1, dd + 1)); }
    best = Math.max(best, n);
  }
  return best;
}
const cleanName = (n) => String(n || '').replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 10);
/** The text put in a shared link: date, score and name. */
export const makeChallenge = (date, score, name) => `${date}.${Math.max(0, Math.floor(score))}.${encodeURIComponent(cleanName(name) || 'A friend')}`;
/** Reads a shared score. Returns { date, score, name } or null if it is not one. */
export function readChallenge(text) {
  const m = /^(\d{4}-\d{2}-\d{2})\.(\d{1,7})\.(.{1,60})$/.exec(String(text || ''));
  if (!m) return null;
  let name = '';
  try { name = cleanName(decodeURIComponent(m[3])); } catch { return null; }
  return name ? { date: m[1], score: +m[2], name } : null;
}
/** Adds a friend's score to the stored daily data: one entry per name per day, twelve names a day, two weeks kept. */
export function addFriend(data, entry, today) {
  const friends = data.friends || (data.friends = {});
  const list = (friends[entry.date] || []).filter((f) => f.name.toLowerCase() !== entry.name.toLowerCase());
  list.push({ name: entry.name, score: entry.score });
  friends[entry.date] = list.sort((a, b) => b.score - a.score).slice(0, 12);
  let oldest = today;
  for (let i = 0; i < 14; i++) oldest = dayBefore(oldest);
  for (const d of Object.keys(friends)) if (d < oldest) delete friends[d];
  return data;
}
/** Today's table: you and your friends, best first. Friends' scores are hidden until you have played. */
export function board(data, date, myName = 'You') {
  const mine = data.scores?.[date], rows = (data.friends?.[date] || []).map((f) => ({ name: f.name, score: f.score, me: false }));
  if (mine !== undefined) rows.push({ name: myName, score: mine, me: true });
  rows.sort((a, b) => b.score - a.score);
  return { played: mine !== undefined, rows };
}
