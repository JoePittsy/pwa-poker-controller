import * as audio from './audio.js';
import { ui } from './prefs.js';
import { presets, renderActions } from './squeeze.js';
import { S } from './state.js';

// ---------- human turn ----------
export function finish(action) {
  const r = ui.resolve;
  ui.resolve = null;
  ui.mode = 'wait';
  renderActions();
  r?.(action);
}
export function prompt(mode) {
  ui.mode = mode;
  ui.focus = 1;
  renderActions();
  return new Promise((r) => { ui.resolve = r; });
}
// Run the rest of the hand at full speed and quiet the table sounds (restored by the loop after the hand).
export function speedUp() {
  S.fast = true;
  audio.hush(true);
}
// You've folded: jump straight to the result instead of watching the rest play out.
export function skipHand() {
  if (ui.mode !== 'skip') return;
  audio.confirm();
  speedUp();
  ui.mode = 'wait';
  renderActions();
}
export function choose(type) {
  if (ui.mode === 'actions') finish({ type });
}
export function openRaise() {
  const L = S.game.legal(S.ME);
  if (ui.mode !== 'actions' || !L.canRaise) return;
  audio.confirm();
  ui.mode = 'raise';
  ui.raiseTo = presets(L)[1][1];
  renderActions();
}
export function closeRaise() { audio.back(); ui.mode = 'actions'; ui.focus = 2; renderActions(); }
export function confirmRaise() { if (ui.mode === 'raise') finish({ type: 'raise', amount: ui.raiseTo }); }
