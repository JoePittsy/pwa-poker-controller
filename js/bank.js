// The bankroll: chips you keep between sessions. You buy into cash games and sit-and-gos with it,
// winnings come back to it, and it is never lost for good: when you are broke the house stakes you again.
export const START = 2000;
export const TOPUP = 1000; // what the house hands you when you cannot afford the smallest game
/** @type {{ key: string, name: string, level: number, buyin: number }[]} */
export const STAKES = [{ key: 'low', name: '5/10', level: 0, buyin: 1000 }, { key: 'mid', name: '25/50', level: 3, buyin: 5000 }, { key: 'high', name: '100/200', level: 6, buyin: 20000 }];
export const SNG = { buyin: 200, prizes: [600, 360, 240] }; // six players put in 200 each; the top three are paid 50/30/20
export const LADDER_PRIZE = (rung) => 100 + 50 * rung;

const num = (v, d = 0) => (Number.isFinite(+v) && +v >= 0 ? Math.floor(+v) : d);
/** Reads a stored bankroll, tolerating anything missing or odd. */
export function readBank(text) {
  let b = {};
  try { b = JSON.parse(text) || {}; } catch { /* nothing stored yet */ }
  const out = { chips: num(b.chips, START), rung: num(b.rung, 0) };
  if (b.seat !== undefined && b.seat !== null) out.seat = num(b.seat, 0); // chips sitting on a cash table
  return out;
}
/** Take a buy-in out. Returns false, changing nothing, if you cannot afford it. */
export function pay(bank, amount) {
  if (amount > bank.chips) return false;
  bank.chips -= amount;
  return true;
}
/** Sit down at a cash table: the buy-in moves from the bankroll onto the table. */
export function sit(bank, buyin) {
  if (bank.seat !== undefined || !pay(bank, buyin)) return false;
  bank.seat = buyin;
  return true;
}
/** Get up: whatever is on the table goes back to the bankroll. Returns what came back. */
export function cashOut(bank) {
  const back = bank.seat ?? 0;
  bank.chips += back;
  delete bank.seat;
  return back;
}
/** What a sit-and-go pays for a finishing place (1 = winner). */
export const prize = (place) => SNG.prizes[place - 1] || 0;
/** If you cannot afford the smallest game and have nothing on a table, the house tops you up. Returns what it gave. */
export function restake(bank) {
  if (bank.seat !== undefined || bank.chips >= SNG.buyin) return 0;
  const give = TOPUP - bank.chips;
  bank.chips = TOPUP;
  return give;
}
