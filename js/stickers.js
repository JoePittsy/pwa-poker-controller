// Achievements, collected as stickers. [id, name, how to earn it, glyph]
export const STICKERS = [
  ['first_win', 'First Blood', 'Win a pot.', '★'],
  ['seven_two', 'The Hammer', 'Win a hand holding seven-two.', '72'],
  ['rockets', 'Rockets', 'Win with pocket aces.', 'AA'],
  ['cracked', 'Cracked', 'Lose a showdown with pocket aces.', '☠'],
  ['stone_cold', 'Stone Cold', 'Win a pot on the river without a showdown.', '❄'],
  ['soul_read', 'Soul Read', 'Call a river bet and win with one pair or less.', '◉'],
  ['flushed', 'Flushed', 'Win with a flush.', '♥︎'],
  ['full_boat', 'Full Boat', 'Win with a full house.', '⚓︎'],
  ['quads', 'Quad Damage', 'Make four of a kind.', '4×'],
  ['unicorn', 'Unicorn', 'Make a straight flush.', '✦'],
  ['whale_hunter', 'Whale Hunter', 'Win a pot of 2,000 or more.', '£'],
  ['fearless', 'Fearless', 'Win an all-in.', '⚡︎'],
  ['river_rat', 'River Rat', 'Win an all-in you were under 30% to win before the river.', '≋'],
  ['chip_chair', 'Chip and a Chair', 'Win a hand you started with under 5 big blinds.', '❙'],
  ['two_birds', 'Two Birds', 'Knock out two players in one hand.', '×2'],
  ['heater', 'Heater', 'Win four hands in a row.', '♨︎'],
  ['patience', 'Patience', 'Fold eight hands in a row.', '⧖'],
  ['sweat', 'Sweat It', 'Squeeze your cards all the way open.', '↑'],
  ['regular', 'Regular', 'Clear Table 1.', '1'],
  ['made_it', 'Made It', 'Clear Table 3.', '3'],
  ['vault', 'Vault Cracker', 'Clear Table 5.', '5'],
  ['speedrun', 'Speedrun', 'Clear a table in 15 hands or fewer.', '»'],
  ['house_loses', 'House Loses', 'Beat Vera, the Dealer.', 'V'],
  ['harpooned', 'Harpooned', 'Beat Otto, the Whale.', 'O'],
  ['rock_breaker', 'Rock Breaker', 'Beat Stone, the Rock.', 'S'],
  ['loaded', 'Loaded', 'Hold three perks at once.', '✱'],
  ['second_wind', 'Second Wind', 'Survive a bust with Lifeline.', '♡'],
  ['daily_player', 'Daily Player', 'Finish a daily deal.', '☼'],
  ['in_the_black', 'In the Black', 'Finish a daily deal with more than 2,000.', '+'],
  ['regular_hours', 'Regular Hours', 'Finish three daily deals.', 'Ⅲ'],
];
const KEY = 'padpoker.stickers';
function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } }
let mine = load();
export const has = (id) => !!mine[id];
export const count = () => STICKERS.filter(([id]) => mine[id]).length;
// Returns the sticker if it is newly earned, otherwise null.
export function unlock(id) {
  if (mine[id]) return null;
  const st = STICKERS.find((x) => x[0] === id);
  if (!st) return null;
  mine[id] = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(mine)); } catch { /* private mode */ }
  return st;
}
