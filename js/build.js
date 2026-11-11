// A run's build: the perks you hold, the families they belong to, and what they pay.
// Perks in the same family strengthen each other, and a streak of pots won (heat) multiplies
// everything if you hold Heater, so the perks you pick add up to a way of playing.
export const FAMILIES = {
  aggro: { name: 'Pressure', hint: 'pays for pushing people around' },
  value: { name: 'Value', hint: 'pays for every pot you take down' },
  guard: { name: 'Staying power', hint: 'keeps you in the game' },
};
/** @type {Record<string, { name: string, text: string, family?: string, stack?: boolean }>} */
export const PERKS = {
  hunter: { name: 'Head Hunter', text: 'Every knock-out you score pays 100.', family: 'aggro', stack: true },
  bully: { name: 'Bully', text: 'Pots you win without a showdown pay 15% extra.', family: 'aggro', stack: true },
  heater: { name: 'Heater', text: 'Each pot in a row you win adds 10% to all perk payouts, up to five.', family: 'aggro', stack: true },
  rakeback: { name: 'Rakeback', text: 'Every pot you win pays 10% extra.', family: 'value', stack: true },
  showman: { name: 'Showman', text: 'Pots you win at a showdown pay 20% extra.', family: 'value', stack: true },
  madehand: { name: 'Made Hand', text: 'Winning a showdown with three of a kind or better pays 100.', family: 'value', stack: true },
  bigstack: { name: 'Big Stack', text: 'Start every table with 30% more chips.', family: 'guard', stack: true },
  lifeline: { name: 'Lifeline', text: 'The next time you bust, stay in with a short stack instead.', family: 'guard', stack: true },
  slowblinds: { name: 'Slow Clock', text: 'Blinds take 2 more hands to rise.', family: 'guard', stack: true },
  peek: { name: 'Peek', text: 'Each hand, one opponent shows you one of their cards.' },
};
export const MAX_HEAT = 5;
const held = (perks, key) => Math.max(0, Math.floor(Number(perks?.[key]) || 0));
/** How many different perks you hold in a family. Extra copies of one perk do not count: a set is variety. */
export const familyCount = (perks, family) => Object.keys(PERKS).filter((k) => PERKS[k].family === family && held(perks, k) > 0).length;
/** What holding several perks of one family is worth: x1.5 with two different ones, x2 with all three. */
export const setBonus = (perks, family) => { const n = familyCount(perks, family); return n >= 3 ? 2 : n === 2 ? 1.5 : 1; };
/** Starting stack as a multiple of the table's normal one. Staying-power sets add 10% then 20%. */
export const stackFactor = (perks) => 1 + 0.3 * held(perks, 'bigstack') + (setBonus(perks, 'guard') - 1) * 0.2;
/** Heat after a hand: a pot won adds one; losing a showdown puts it out; folding leaves it alone. */
export const nextHeat = (heat, { won, showdown, folded }) => (won > 0 ? Math.min(MAX_HEAT, heat + 1) : showdown && !folded ? 0 : heat);
/**
 * What the perks pay for one hand, on top of the pot.
 * hand: { won: chips you won, showdown: was there one, kos: knock-outs you scored, category: your hand's rank (3 = three of a kind) }
 * heat: pots won in a row before this hand. Returns { total, parts: [[name, chips]], mult }.
 */
export function payout(perks, hand, heat = 0) {
  const parts = [], won = Math.max(0, hand.won || 0);
  const add = (key, chips, family) => { if (chips > 0) parts.push([PERKS[key].name, chips * setBonus(perks, family)]); };
  add('hunter', 100 * held(perks, 'hunter') * (hand.kos || 0), 'aggro');
  if (won && !hand.showdown) add('bully', won * 0.15 * held(perks, 'bully'), 'aggro');
  if (won) add('rakeback', won * 0.1 * held(perks, 'rakeback'), 'value');
  if (won && hand.showdown) add('showman', won * 0.2 * held(perks, 'showman'), 'value');
  if (won && hand.showdown && hand.category >= 3) add('madehand', 100 * held(perks, 'madehand'), 'value');
  const mult = 1 + 0.1 * held(perks, 'heater') * Math.max(0, Math.min(MAX_HEAT, heat));
  const out = parts.map(([name, chips]) => [name, Math.round(chips * mult)]);
  return { total: out.reduce((sum, [, c]) => sum + c, 0), parts: out, mult };
}
