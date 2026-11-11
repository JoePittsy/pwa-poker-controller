// A run as a trip: the deal you start it on, the money you bank from each table, what the shop
// between tables charges, the route you take, and what you take home when it ends.
// "Pocket" is the run's money. It only exists during the run: you fill it by cashing out tables,
// spend it in the shop, and a share of whatever is left goes to your bankroll when you bust.
/** @type {Record<string, { name: string, text: string, rank: number, stack?: number, cash?: number, pocket?: number, blinds?: number, price?: number, skill?: number, oppStack?: number, payout?: number }>} */
export const DEALS = {
  regular: { name: 'Regular', text: 'A straight run. Nothing changed.', rank: 0 },
  short: { name: 'Short Stack', text: 'Start every table with 60% of the chips. Cash-outs pay 50% more.', stack: 0.6, cash: 1.5, rank: 0 },
  backed: { name: 'Backed', text: 'Start with 2,000 in your pocket, but your backer takes half of every cash-out.', pocket: 2000, cash: 0.5, rank: 1 },
  speed: { name: 'Speed Freak', text: 'Blinds rise twice as fast. Everything in the shop is 30% off.', blinds: 0.5, price: 0.7, rank: 2 },
  shark: { name: 'Shark Tank', text: 'Opponents play sharper with 30% more chips. Perk payouts are doubled.', skill: 0.15, oppStack: 1.3, payout: 2, rank: 3 },
};
export const dealOf = (trip) => DEALS[trip?.deal] || DEALS.regular;
/** The deals in order, each marked locked if your career rank is too low for it. */
export const dealsFor = (rank) => Object.entries(DEALS).map(([key, d]) => ({ key, ...d, locked: rank < d.rank }));
/** A fresh trip on a deal. boost, bribe and risky hold the table number they apply to (0: none). */
export const newTrip = (deal = 'regular') => ({ deal: DEALS[deal] ? deal : 'regular', pocket: DEALS[deal]?.pocket || 0, banked: 0, spent: 0, boost: 0, bribe: 0, risky: 0, buyin: 0, walked: 0 });
/** Makes a saved trip safe to use, whatever state it was saved in. */
export function readTrip(t) {
  const n = (v) => (Number.isFinite(+v) && +v > 0 ? Math.floor(+v) : 0);
  return { ...newTrip(t?.deal), pocket: n(t?.pocket), banked: n(t?.banked), spent: n(t?.spent), boost: n(t?.boost), bribe: n(t?.bribe), risky: n(t?.risky), buyin: n(t?.buyin), walked: n(t?.walked) };
}

export const RISKY = { skill: 0.15, oppStack: 1.25, cash: 1.5 }; // the hard way to the next table
export const BOOST = 1.25;
const round = (v, to = 50) => Math.max(to, Math.round(v / to) * to);
/** What clearing a table puts in your pocket: everything you won beyond your own buy-in, shaped by the deal and the route. */
export function cashOut(trip, table, finalStack, bonus = 0) {
  const won = Math.max(0, finalStack - (trip.buyin || 0));
  return Math.round(won * (dealOf(trip).cash || 1) * (trip.risky === table ? RISKY.cash : 1) * (1 + bonus) / 10) * 10;
}
// Every table ends with you holding all the chips, so the cash-out alone says nothing about how you played.
// Two things do. Clearing it quickly pays extra: within FAST hands per opponent, half as much again; within
// QUICK, a quarter. And once half your opponents are out you may walk away with what you have won so far,
// for no bonus and without the table counting as cleared. Never against a boss.
export const FAST = 8, QUICK = 13;
export const fastPar = (opponents) => FAST * opponents;
export const quickPar = (opponents) => QUICK * opponents;
/** The bonus, as a share of the cash-out, for clearing a table of this many opponents in this many hands. */
export const speedBonus = (hands, opponents) => (hands <= fastPar(opponents) ? 0.5 : hands <= quickPar(opponents) ? 0.25 : 0);
/** May you walk away? players: the table as it stands, you in seat `me`. */
export function canWalk(players, me, boss) {
  if (boss) return false;
  const others = players.filter((p, seat) => seat !== me), out = others.filter((p) => p.chips <= 0).length;
  return players[me].chips > 0 && out >= Math.ceil(others.length / 2) && out < others.length;
}
/** How many tables of a run were truly cleared: the number reached, less those walked away from. */
export const clearedCount = (trip, tablesPassed) => Math.max(0, tablesPassed - (trip?.walked || 0));
/** Shop prices. Perks cost more the more you already hold; each reroll in one visit costs more than the last. */
export const PRICES = {
  perk: (trip, held) => round((1200 + 400 * held) * (dealOf(trip).price || 1)),
  reroll: (trip, used) => round((200 + 200 * used) * (dealOf(trip).price || 1)),
  boost: (trip) => round(600 * (dealOf(trip).price || 1)),
  bribe: (trip) => round(1500 * (dealOf(trip).price || 1)),
};
/** Pay for something. Returns false, changing nothing, if the pocket cannot cover it. */
export function spend(trip, cost) {
  if (cost > trip.pocket) return false;
  trip.pocket -= cost; trip.spent += cost;
  return true;
}
export const TAKE_HOME = 0.25;
/** What goes to your bankroll when the run ends: a quarter of what is left in your pocket. */
export const takeHome = (trip) => Math.floor((trip?.pocket || 0) * TAKE_HOME / 10) * 10;
/** How the deal and route change a table: multipliers for your stack, theirs, their skill, blind speed and perk payouts. */
export function tableMods(trip, table) {
  const d = dealOf(trip), risky = trip?.risky === table;
  return {
    stack: (d.stack || 1) * (trip?.boost === table ? BOOST : 1),
    oppStack: (d.oppStack || 1) * (risky ? RISKY.oppStack : 1),
    skill: (d.skill || 0) + (risky ? RISKY.skill : 0),
    blinds: d.blinds || 1,
    payout: d.payout || 1,
    fewer: trip?.bribe === table ? 1 : 0,
  };
}
