import { award } from './achievements.js';
import * as audio from './audio.js';
import { showOverlay } from './menus.js';
import { S } from './state.js';
import { glyph } from './util.js';

// ---------- perks: pick one after each table you clear; they last for the rest of the run ----------
export const PERKS = {
  bigstack: { name: 'Big Stack', text: 'Start every table with 30% more chips.', stack: true },
  lifeline: { name: 'Lifeline', text: 'The next time you bust, stay in with a short stack instead.', stack: true },
  peek: { name: 'Peek', text: 'Each hand, one opponent shows you one of their cards.' },
  hunter: { name: 'Head Hunter', text: 'Every knock-out you score pays 100 extra chips.', stack: true },
  rakeback: { name: 'Rakeback', text: 'Every pot you win pays 10% extra.', stack: true },
  slowblinds: { name: 'Slow Clock', text: 'Blinds take 2 more hands to rise.', stack: true },
};
/* perks: see state.js */ // key -> how many you hold
// What the regulars remember about you this run: memory[name] = { ko: times you knocked them out }.
// Someone you have knocked out comes back more aggressive, says so, and gloats when they get you back.
/* memory: see state.js */
export const grudge = (name) => S.memory[name]?.ko || 0;
/* peekSeat: see state.js */ // who is showing you a card this hand
export const perkSummary = () => Object.keys(S.perks).filter((k) => S.perks[k] > 0)
  .map((k) => `<b>${PERKS[k].name}</b>${S.perks[k] > 1 ? ` &times;${S.perks[k]}` : ''}`).join(' &middot; ');
export function pickPerk(done) {
  const pool = Object.keys(PERKS).filter((k) => PERKS[k].stack || !S.perks[k]);
  const offer = [];
  while (offer.length < 3 && pool.length) offer.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  showOverlay({
    title: 'Pick a <span>perk</span>', perky: true,
    body: `<p>Yours for the rest of this run.</p>${perkSummary() ? `<p class="who">You hold: ${perkSummary()}</p>` : ''}`,
    items: offer.map((k, i) => [`${i === 0 ? glyph('A') : ''}<span>${PERKS[k].name}<small>${PERKS[k].text}</small></span>`, () => {
      S.perks[k] = (S.perks[k] || 0) + 1;
      if (Object.values(S.perks).reduce((x, y) => x + y, 0) >= 3) award('loaded');
      audio.win(1);
      done();
    }]),
  });
}

// What is being played: 'run' (the climb) or 'daily' (today's fixed deal).
/* mode: see state.js */
/* aiRng: see state.js */
