

 // opponents' dice; seeded in the daily deal so everyone faces the same game
export function mulberry(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
} // ms between players turning their cards over

/** @type {(id: string) => any} */
export const $ = (id) => document.getElementById(id);
export const h = (tag, cls = '', html = '') => {
  const e = document.createElement(tag);
  e.className = cls; e.innerHTML = html;
  return e;
};
export const glyph = (g) => `<span class="glyph ${g.length > 1 ? 'wide' : g.toLowerCase()}">${g}</span>`; // true while skipping the rest of a hand you've folded
export const tick = (ms) => new Promise((r) => setTimeout(r, ms));
