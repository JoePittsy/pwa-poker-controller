import { DIFFICULTY, STACKS, prefs } from './prefs.js';
import { S } from './state.js';
import { $, mulberry } from './util.js';

export const YOU = { name: 'You', isHuman: true };
export const CHARACTERS = {
  Mav: { tag: 'Wild', color: 'var(--red)', voice: 1, style: { loose: 0.65, aggr: 0.8, tell: 'fastBluff' } },
  Dot: { tag: 'Careful', color: 'var(--mint)', voice: 2, style: { loose: 0.33, aggr: 0.4, tell: 'slowBluff' } },
  Rex: { tag: 'Shark', color: 'var(--yellow)', voice: 3, style: { loose: 0.35, aggr: 0.85, tell: 'bigBluff' } },
  Ivy: { tag: 'Sticky', color: 'var(--pink)', voice: 4, style: { loose: 0.7, aggr: 0.1, tell: 'slowStrong' } },
  Gus: { tag: 'Steady', color: 'var(--sky)', voice: 5, style: { loose: 0.44, aggr: 0.7 } },
  // newcomers: they start turning up from Table 4
  Zed: { tag: 'Maniac', color: '#ff8a3d', voice: 9, style: { loose: 0.95, aggr: 0.95 } },
  Flo: { tag: 'Nit', color: '#c7e36a', voice: 10, style: { loose: 0.25, aggr: 0.5, tell: 'slowStrong' } },
  Kit: { tag: 'Trickster', color: '#7ee0ff', voice: 11, style: { loose: 0.55, aggr: 0.6, tell: 'fastStrong' } },
  Bea: { tag: 'Banker', color: '#e6b8ff', voice: 12, style: { loose: 0.4, aggr: 0.4, tell: 'smallValue' } },
  Sol: { tag: 'Gambler', color: '#ffd98a', voice: 13, style: { loose: 0.7, aggr: 0.65, tell: 'fastBluff' } },
};
export const REGULARS = ['Mav', 'Dot', 'Rex', 'Ivy', 'Gus'];
// Bosses: after every third table you play one of these heads-up. Each bends a rule.
export const BOSSES = [
  { name: 'Vera', tag: 'The Dealer', color: '#b58cff', voice: 6, trick: 'She always seems to know roughly what you are holding.', style: { loose: 0.5, aggr: 0.7, cheat: 0.55 } },
  { name: 'Otto', tag: 'The Whale', color: '#5fd0c5', voice: 7, trick: 'He sits down with three times your chips and loves to gamble.', chips: 3, style: { loose: 0.9, aggr: 0.75, tell: 'fastBluff' } },
  { name: 'Stone', tag: 'The Rock', color: '#b9b2a3', voice: 8, trick: 'He never bluffs and only plays strong hands, but the blinds rise every 2 hands.', turbo: true, style: { loose: 0.05, aggr: 0.45, noBluff: true } },
];
export const bossFor = (n) => BOSSES[(Math.floor(n / 3) - 1 + BOSSES.length * 99) % BOSSES.length];
/* bossMode: see state.js */ // true while playing the boss that follows table `table`
// A run is a climb through tables: knock everyone out to move up. Each table has more
// or sharper opponents and faster blinds.
// Each table is a place, with its own cloth.
export const VENUES = [['The Kitchen Table', '#3050e0'], ['The Back Room', '#0e8a78'], ['The Club', '#6a3fd6'], ['High Rollers', '#c22f45'], ['The Vault', '#1f7a3d']];
// Which poker is played. Hold'em everywhere, except some later tables and the quick-table menu.
export const VARIANTS = {
  holdem: { name: "Hold'em", rules: '' },
  short: { name: 'Short deck', rules: 'No cards below six. A flush beats a full house, and A-6-7-8-9 is a straight.' },
  omaha: { name: 'Omaha', rules: 'Four hole cards each. Your hand must use exactly two of them with three from the board.' },
};
export const variantFor = (n) => (n >= 5 && n % 2 === 1 ? (n % 4 === 1 ? 'short' : 'omaha') : 'holdem'); // Table 5 short deck, 7 Omaha, 9 short deck...
export function setVariantLook(v) { $('app').classList.toggle('omaha', v === 'omaha'); }
// From the third table on, each table changes one rule.
export const BOUNTY = 200;
export const TWISTS = [
  { key: 'bounty', name: 'Bounty', text: `every knock-out you score pays you ${BOUNTY} extra chips.` },
  { key: 'turbo', name: 'Turbo', text: 'the blinds go up every 2 hands.' },
  { key: 'short', name: 'Short stacks', text: 'everyone starts with half the usual chips.' },
  { key: 'deep', name: 'Deep stacks', text: 'everyone starts with double the usual chips.' },
];
export function tableConfig(n, boss = false) {
  if (boss) {
    const b = bossFor(n);
    return {
      names: [b.name], boss: b, skill: 1, venue: `${b.name}, ${b.tag}`, mat: '#3a3355', twist: null,
      handsPerLevel: b.turbo ? 2 : 3, chips: STACKS[prefs.stack], // the whale's big stack needs the slower blinds
    };
  }
  let names = n === 1 ? ['Dot', 'Ivy', 'Gus'] : n === 2 ? ['Mav', 'Dot', 'Ivy', 'Gus'] : REGULARS;
  if (n >= 4) { // from here the line-up is five of the ten, shuffled per run and table
    const rnd = mulberry(((S.runStats.seed || 1) + n * 7919) | 0);
    const pool = Object.keys(CHARACTERS);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    names = pool.slice(0, 5);
    if (n === 4 && !names.some((x) => !REGULARS.includes(x))) names[4] = 'Zed'; // Table 4 always introduces someone new
  }
  if (S.trip?.bribe === n && names.length > 2) names = names.slice(0, -1); // someone was paid to stay away (see trip.js)
  const [venue, mat] = VENUES[(n - 1) % VENUES.length];
  const lap = Math.ceil(n / VENUES.length);
  const twist = n >= 3 ? TWISTS[(n - 3) % TWISTS.length] : null; // the first two tables are plain
  return {
    variant: variantFor(n),
    names, skill: Math.max(0.05, Math.min(1, 0.3 + (n - 1) * 0.175 + DIFFICULTY[prefs.difficulty].skill)), venue: lap > 1 ? `${venue}, round ${lap}` : venue, mat, twist,
    handsPerLevel: twist?.key === 'turbo' ? 2 : n === 1 ? 3 : 3, // about 20-30 hands a table (see test/length.test.js), with stacks still deep enough to play
    chips: Math.round(STACKS[prefs.stack] * (twist?.key === 'short' ? 0.5 : twist?.key === 'deep' ? 2 : 1)),
  };
}
