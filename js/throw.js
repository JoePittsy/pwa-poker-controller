import { upAmount } from './input.js';
import { ui } from './prefs.js';
import { setRaise } from './squeeze.js';
import { S } from './state.js';
import { choose, confirmRaise } from './turn.js';

// ---------- throwing your chips in ----------
// A quick flick up on the stick (or a swipe up on the buttons) while betting or calling
// throws the chips: they fly harder, land as a messier heap and thump the table, in
// proportion to how fast the flick was. A slow push still just adjusts the bet as before.
export function throwBet(power) {
  power = Math.max(0.25, Math.min(1, power));
  if (ui.mode === 'raise') {
    if (flick.raiseBefore) setRaise(flick.raiseBefore, true, true); // undo the nudge the flick itself gave the amount
    ui.throwPower = power;
    confirmRaise();
  } else if (ui.mode === 'actions' && !S.game.legal(S.ME).canCheck) {
    ui.throwPower = power;
    choose('call');
  }
}
export const flick = { t0: 0, peak: 0, raiseBefore: 0 };
(function watchFlick() {
  const up = S.overlay ? 0 : upAmount();
  const now = performance.now();
  if (up > 0.2 && !flick.t0) { flick.t0 = now; flick.peak = 0; }
  if (flick.t0) {
    flick.peak = Math.max(flick.peak, up);
    if (up < 0.2) { // released: was it a flick?
      const dt = now - flick.t0;
      if (flick.peak > 0.8 && dt < 240 && (ui.mode === 'raise' || ui.mode === 'actions')) throwBet(1.15 - dt / 240);
      flick.t0 = 0; flick.raiseBefore = 0;
    }
  }
  requestAnimationFrame(watchFlick);
})();
{ // swipe up on the action buttons or the bet panel
  let start = null;
  addEventListener('pointerdown', (e) => { start = /** @type {any} */ (e.target).closest?.('#actions') ? { y: e.clientY, t: performance.now() } : null; });
  addEventListener('pointerup', (e) => {
    if (!start) return;
    const dy = start.y - e.clientY, dt = performance.now() - start.t;
    start = null;
    if (dy > 45 && dt < 350) { e.preventDefault(); throwBet((dy / dt) / 1.2); }
  });
}
