import * as audio from './audio.js';
import { line } from './banter.js';
import { netEffect } from './online.js';
import { prefs } from './prefs.js';
import { S } from './state.js';

// ---------- opponent character ----------
// Faces: idle | think | happy | sad | shock. A mood lasts `ms`, or until changed if ms is 0.
export function setMood(seat, mood, ms = 0) {
  const ava = S.seatEls[seat]?.querySelector('.ava');
  if (!ava || S.game.players[seat].isHuman) return;
  ava.dataset.mood = mood;
  clearTimeout(ava._t);
  if (ms) ava._t = setTimeout(() => { ava.dataset.mood = 'idle'; }, ms);
}
export const bluffers = new Set(); // seats that have bluff-raised this hand
// How the human has been playing; the AI adapts to it (see ai.js).
/* habits: see state.js */
export function noteHumanAction(a, L) {
  S.habits.acts++;
  if (a.type === 'raise') S.habits.raises++;
  if (a.type === 'raise' && a.amount >= L.maxTo && L.maxTo > 0) S.habits.shoves = (S.habits.shoves || 0) + 1; // moved all in
  if (L.toCall > 0) { S.habits.facing++; if (a.type === 'fold') S.habits.folds++; }
}
export const humanProfile = () => ({
  foldToBet: (S.habits.folds + 2) / (S.habits.facing + 5),
  aggression: (S.habits.raises + 1.5) / (S.habits.acts + 5),
  shove: (S.habits.shoves || 0) / Math.max(6, S.habits.acts), // someone who shoves most hands gets called much wider
});

// Each opponent's pause before acting: longer for hard decisions, bent by their personal tell.
export function thinkTime(p, a) {
  let t = 450 + a.think * 1900 + Math.random() * 300;
  const tell = p.style?.tell;
  if (tell === 'fastBluff' && a.bluff) t = 260;
  if (tell === 'slowBluff' && a.bluff) t += 1800;
  if (tell === 'slowStrong' && a.strong) t += 1400;
  if (tell === 'fastStrong' && a.strong) t = 300;
  return t;
}
export function showThinking(seat) {
  setMood(seat, 'think');
  const badge = S.seatEls[seat].querySelector('.badge');
  badge.textContent = '\u2022 \u2022 \u2022';
  badge.className = 'badge think';
}
export function say(p, moment) {
  if (!prefs.chatter) return;
  const text = line(p.name, moment);
  if (!text) return;
  const el = S.seatEls[p.seat].querySelector('.say');
  el.textContent = text;
  el.classList.remove('show');
  void el.offsetWidth; // restart the pop animation
  el.classList.add('show');
  audio.talk(S.cast[p.seat].voice);
  netEffect('say', { seat: p.seat, moment });
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2600);
}
