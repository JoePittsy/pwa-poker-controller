// The player's career rank on screen (see career.js for how it is worked out).
import * as audio from './audio.js';
import { LADDER, XP_FOR, rankOf, xpOf } from './career.js';
import { dailyData } from './daily.js';
import * as fx from './fx.js';
import { showOverlay } from './menus.js';
import { stats } from './stats.js';
import { count as stickerCount } from './stickers.js';
import { glyph } from './util.js';

export const myRank = () => rankOf(xpOf(stats, { daily: Object.keys(dailyData().scores || {}).length, stickers: stickerCount() }));
export function rankHtml() {
  const r = myRank();
  return `<div class="rank"><b>${r.name}</b><span>${r.xp.toLocaleString()} XP</span><i><em style="width:${Math.round(r.progress * 100)}%"></em></i><small>${r.next ? `${r.toNext.toLocaleString()} to ${r.next}` : 'Top rank'}</small></div>`;
}
// Announce a new rank once. The first time this runs it only notes where you already are.
export function rankCheck() {
  const r = myRank();
  let seen = null;
  try { seen = localStorage.getItem('padpoker.rank'); } catch { return; }
  if (seen !== null && r.index <= +seen) return;
  try { localStorage.setItem('padpoker.rank', String(r.index)); } catch { /* private mode */ }
  if (seen === null) return;
  fx.banner(`Rank up – ${r.name}!`, 'info'); audio.fanfare();
}
export function ranksScreen(back) {
  const me = myRank();
  showOverlay({
    title: 'Ranks', wide: true, closable: true, onClose: back,
    body: `${rankHtml()}<div class="ladder">${LADDER.map(([at, name], i) => `<span class="${i === me.index ? 'here' : i < me.index ? 'done' : ''}"><b>${name}</b>${at.toLocaleString()}</span>`).join('')}</div>
      <p>Experience comes from every way of playing and never goes down: ${XP_FOR.map(([, each, what]) => `<b>${each}</b> for ${what}`).join(', ')}.</p><p>Your rank is shown next to your name at an online table.</p>`,
    items: [[`${glyph('B')}Back`, back]],
  });
}
