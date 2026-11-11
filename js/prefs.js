import * as fx from './fx.js';

// ---------- player preferences ----------
export const PACE = { Relaxed: 1.4, Normal: 1, Fast: 0.5 };
export const STACKS = { Short: 500, Standard: 1000, Deep: 2000 };
export const prefs = { speed: 'Normal', stack: 'Standard', lefty: false, rumble: true, chatter: true, coach: false, back: 'Spade', fourColour: false, squeeze: true, difficulty: 'Standard' };
// Difficulty shifts how well the opponents play, and in Shark gives them a bigger stack. The daily deal ignores it.
export const DIFFICULTY = { Casual: { skill: -0.25, stack: 1 }, Standard: { skill: 0, stack: 1 }, Shark: { skill: 0.25, stack: 1.25 } };
// Card backs, and how many tables your best run must have cleared to unlock each.
export const BACKS = { Spade: 0, Lattice: 1, Sunburst: 2, Ruby: 3, Gold: 5 };
export const bestRun = () => { try { return +localStorage.getItem('padpoker.best') || 0; } catch { return 0; } };
export const unlockedBacks = () => Object.keys(BACKS).filter((k) => BACKS[k] <= bestRun());
try { Object.assign(prefs, JSON.parse(localStorage.getItem('padpoker.prefs')) || {}); } catch { /* private mode */ }
if (!PACE[prefs.speed]) prefs.speed = 'Normal';
if (!STACKS[prefs.stack]) prefs.stack = 'Standard';
if (!DIFFICULTY[prefs.difficulty]) prefs.difficulty = 'Standard';
export function applyPrefs() {
  document.body.classList.toggle('four', prefs.fourColour);
  if (!unlockedBacks().includes(prefs.back)) prefs.back = 'Spade';
  for (const k of Object.keys(BACKS)) document.body.classList.toggle(`back-${k.toLowerCase()}`, k === prefs.back);
  document.body.classList.toggle('lefty', prefs.lefty);
  fx.setRumble(prefs.rumble);
  try { localStorage.setItem('padpoker.prefs', JSON.stringify(prefs)); } catch { /* private mode */ }
}
export const cycle = (obj, cur) => { const k = Object.keys(obj); return k[(k.indexOf(cur) + 1) % k.length]; };

/* game: see state.js */
/* runId: see state.js */
/* seatEls: see state.js */
// mode: 'wait' | 'actions' | 'raise' | 'continue'
export const ui = { mode: 'wait', focus: 1, raiseTo: 0, resolve: null, shown: '', reveals: 0, slowRiver: false, squeezed: true, hidden: false, noAnim: false, throwPower: 0, scatter: 0, revealGap: 0 };
/* settled: see state.js */ // false between the last action of a hand and the moment the result is shown
/* overlay: see state.js */
