import * as audio from './audio.js';
import { closeOverlay, overlayFocus, pauseMenu } from './menus.js';
import { ui } from './prefs.js';
import { stopReplay } from './replay.js';
import { finishSqueeze, presets, renderActions, setRaise, toast } from './squeeze.js';
import { S } from './state.js';
import { EMOTES, chatEntry, sendEmote, toggleEmotes } from './talk.js';
import { flick } from './throw.js';
import { choose, closeRaise, confirmRaise, finish, openRaise, skipHand } from './turn.js';
import { $ } from './util.js';

// ---------- input ----------
let warned = false; // the "tap for sound" hint is shown once
export function onButton(b) {
  if (!audio.unlock() && !warned) {
    warned = true;
    toast('Tap the screen once to turn sound on');
  }
  if (S.overlay) {
    if (S.overlay.onKey?.(b)) return;
    if (b === 'up') overlayFocus(-S.overlay.cols);
    else if (b === 'down') overlayFocus(S.overlay.cols);
    else if (b === 'left') overlayFocus(-1);
    else if (b === 'right') overlayFocus(1);
    else if (b === 'a') /** @type {HTMLElement} */ ($('overlay').querySelectorAll('.items .btn')[S.overlay.focus]).click();
    else if ((b === 'b' || b === 'start') && S.overlay.closable) { const done = S.overlay.onClose; audio.back(); closeOverlay(); done?.(); }
    return;
  }
  if (S.replaying) { if (['a', 'b', 'x', 'start'].includes(b)) stopReplay(); return; }
  if (!$('emotes').hidden) { // table talk is open: a direction says it, anything else closes it
    const e = EMOTES.find((x) => x[0] === b);
    if (e) sendEmote(e[3]); else if (b === 'a' && S.mode === 'net') chatEntry(); else toggleEmotes(false);
    return;
  }
  if (b === 'rb' && ui.mode !== 'raise') return toggleEmotes(true);
  if (b === 'start') return pauseMenu();
  if (ui.mode === 'actions') {
    const L = S.game.legal(S.ME);
    const n = L.canRaise ? 3 : 2;
    const move = (d) => {
      const f = Math.max(0, Math.min(n - 1, ui.focus + d));
      if (f !== ui.focus) { ui.focus = f; audio.tick(); renderActions(); }
    };
    if (b === 'left') move(-1);
    else if (b === 'right') move(1);
    else if (b === 'a') [() => choose('fold'), () => choose('call'), openRaise][ui.focus]();
    else if (b === 'b') L.canCheck ? toast('Checking is free — press X to check') : choose('fold');
    else if (b === 'x') choose('call');
    else if (b === 'y') L.canRaise ? openRaise() : toast("Can't raise here");
  } else if (ui.mode === 'raise') {
    const L = S.game.legal(S.ME);
    const step = S.game.bb;
    const ps = [...new Set(presets(L).map((p) => p[1]))].sort((x, y) => x - y);
    if (b === 'left') setRaise(ui.raiseTo - step);
    else if (b === 'right') setRaise(ui.raiseTo + step);
    else if (b === 'down') setRaise(ui.raiseTo - step * 5);
    else if (b === 'up') { flick.raiseBefore = ui.raiseTo; setRaise(ui.raiseTo + step * 5); } // remembered in case this turns out to be a flick
    else if (b === 'lb') setRaise(ps.filter((v) => v < ui.raiseTo).pop() ?? L.minTo);
    else if (b === 'rb') setRaise(ps.find((v) => v > ui.raiseTo) ?? L.maxTo);
    else if (b === 'a' || b === 'y') confirmRaise();
    else if (b === 'b') closeRaise();
  } else if (ui.mode === 'squeeze') {
    if (b === 'a' || b === 'x') finishSqueeze();
  } else if (ui.mode === 'skip') {
    if (b === 'a' || b === 'x') skipHand();
  } else if (ui.mode === 'continue') {
    if (b === 'a' || b === 'x') { audio.confirm(); finish(); }
  }
}
