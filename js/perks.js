import { award } from './achievements.js';
import { FAMILIES, PERKS, familyCount, setBonus } from './build.js';
import * as audio from './audio.js';
import { showOverlay } from './menus.js';
import { S } from './state.js';
import { glyph } from './util.js';

// ---------- perks: pick one after each table you clear; they last for the rest of the run ----------
// What each perk does, the families and what they pay are in build.js; this is the choosing and the showing.
/* perks: see state.js */ // key -> how many you hold
// What the regulars remember about you this run: memory[name] = { ko: times you knocked them out }.
// Someone you have knocked out comes back more aggressive, says so, and gloats when they get you back.
/* memory: see state.js */
export const grudge = (name) => S.memory[name]?.ko || 0;
/* peekSeat: see state.js */ // who is showing you a card this hand
export const perkSummary = () => {
  const mine = (k) => `<b>${PERKS[k].name}</b>${S.perks[k] > 1 ? ` &times;${S.perks[k]}` : ''}`;
  const keys = Object.keys(PERKS).filter((k) => S.perks[k] > 0);
  const groups = Object.keys(FAMILIES).map((f) => {
    const got = keys.filter((k) => PERKS[k].family === f);
    return got.length ? `${got.map(mine).join(' &middot; ')}${setBonus(S.perks, f) > 1 ? ` <i class="set">${FAMILIES[f].name} set &times;${setBonus(S.perks, f)}</i>` : ''}` : '';
  });
  return [...groups, ...keys.filter((k) => !PERKS[k].family).map(mine)].filter(Boolean).join(' &middot; ');
};
export function pickPerk(done) {
  const pool = Object.keys(PERKS).filter((k) => PERKS[k].stack || !S.perks[k]);
  const offer = [];
  while (offer.length < 3 && pool.length) offer.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  // say what a pick would do to a set: perks of one family strengthen each other
  const tag = (k) => {
    const f = PERKS[k].family;
    if (!f) return '';
    const n = familyCount(S.perks, f) + (S.perks[k] ? 0 : 1);
    return `<em class="fam ${f}">${FAMILIES[f].name}${S.perks[k] ? '' : n === 2 ? ' \u2013 makes a set, &times;1.5' : n === 3 ? ' \u2013 completes the set, &times;2' : ''}</em>`;
  };
  showOverlay({
    title: 'Pick a <span>perk</span>', perky: true,
    body: `<p>Yours for the rest of this run. Two different perks from one family make a set and pay half as much again; all three pay double.</p>${perkSummary() ? `<p class="who">You hold: ${perkSummary()}</p>` : ''}`,
    items: offer.map((k, i) => [`${i === 0 ? glyph('A') : ''}<span>${PERKS[k].name}${tag(k)}<small>${PERKS[k].text}</small></span>`, () => {
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
