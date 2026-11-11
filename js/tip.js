// The coach's note: a card that stays on the table until you dismiss it, so there is time to read it.
import * as audio from './audio.js';
import { $, glyph } from './util.js';

export const tipShown = () => !$('coachtip').hidden;
export function dismissTip() {
  if (!tipShown()) return;
  $('coachtip').hidden = true;
  audio.back();
}
export function coachTip(where, text) {
  const el = $('coachtip');
  el.innerHTML = `<b>Coach <i>${where}</i></b><p></p><button class="btn sm">${glyph('A')}Got it</button>`;
  el.querySelector('p').textContent = text;
  el.hidden = false;
  el.onclick = dismissTip; // a tap anywhere on the card
}
