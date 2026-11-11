import { PACE, prefs } from './prefs.js';
import { S } from './state.js';
import { tick } from './util.js';

/* twist: see state.js */ // the current table's rule change, if any
/* lastBB: see state.js */ // to announce when the blinds go up
/* cast: see state.js */ // cast[seat] = character info for the current table
/* ME: see state.js */ // the seat whose view is on screen: always 0, except in pass-and-play where it follows the player holding the device
export const mine = (p) => p.seat === S.ME;
export const DEAL_GAP = 90; // ms between dealt cards
export const SHUFFLE_MS = 800; // the shuffle before each deal
export const REVEAL_GAP = 320;
/* replaying: see state.js */ // true while a recorded hand is being shown on the table; the live game waits
/* replayStop: see state.js */ // asks the replay to finish early
/* fast: see state.js */
// Every pause in the game goes through here, so opening a menu really does pause play.
export const rawSleep = async (ms) => {
  await tick(S.fast ? 0 : ms);
  while ((S.overlay && S.mode !== 'net') || S.replaying || S.net?.hold) await tick(120); // an online game doesn't stop for one player's menu, only for a disconnection
};
export const sleep = (ms) => rawSleep(ms * PACE[prefs.speed]); // game pauses stretch with the speed setting
