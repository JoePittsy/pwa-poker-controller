import * as audio from './audio.js';
import * as fx from './fx.js';
import { showOverlay } from './menus.js';
import { S } from './state.js';
import { STICKERS, count as stickerCount, has as hasSticker, unlock as unlockSticker } from './stickers.js';
import { glyph } from './util.js';

// ---------- stickers (achievements) ----------
/* stickerQueue: see state.js */
export function award(id) {
  const st = unlockSticker(id);
  if (!st) return;
  const delay = 1500 + S.stickerQueue++ * 1900; // let the hand's own fanfare finish, and don't stack them
  setTimeout(() => {
    S.stickerQueue = Math.max(0, S.stickerQueue - 1);
    audio.sticker();
    fx.sticker(st[3], st[1], st[2], STICKERS.indexOf(st) % 4);
  }, delay);
}
// Things only the game loop knows, noted during a hand for the checks below.
export const feats = { startChips: 0, turnOdds: 1, lastAct: null, winStreak: 0, foldStreak: 0 };
export function checkHandStickers(g, kos) {
  const me = g.players[S.ME];
  const won = me.won > 0, sd = g.result.showdown && !me.folded;
  const cat = sd ? Math.floor(me.score / 13 ** 5) : -1;
  const ranks = me.cards.map((c) => c >> 2).sort((a, b) => a - b);
  feats.winStreak = won ? feats.winStreak + 1 : 0;
  feats.foldStreak = me.folded ? feats.foldStreak + 1 : 0;
  if (won) award('first_win');
  const two = me.cards.length === 2, hn = sd ? me.handName : '';
  if (two && won && ranks[0] === 0 && ranks[1] === 5) award('seven_two');
  if (two && ranks[0] === 12 && ranks[1] === 12) { if (won) award('rockets'); else if (sd) award('cracked'); }
  if (won && !g.result.showdown && g.street === 'river') award('stone_cold');
  if (won && sd && cat <= 1 && feats.lastAct?.type === 'call' && feats.lastAct.street === 'river') award('soul_read');
  if (won && hn.startsWith('Flush')) award('flushed'); // by name: short deck ranks these two the other way round
  if (won && hn.startsWith('Full House')) award('full_boat');
  if (hn.startsWith('Four')) award('quads');
  if (hn.startsWith('Straight Flush') || hn.startsWith('Royal')) award('unicorn');
  if (me.won >= 2000) award('whale_hunter');
  if (won && me.allIn) award('fearless');
  if (won && me.allIn && sd && feats.turnOdds < 0.3) award('river_rat');
  if (won && feats.startChips < 5 * g.bb) award('chip_chair');
  if (kos >= 2) award('two_birds');
  if (feats.winStreak >= 4) award('heater');
  if (feats.foldStreak >= 8) award('patience');
}
export function stickersScreen(back) {
  const tiles = STICKERS.map(([id, name, , icon], i) => `<div class="${hasSticker(id) ? 'got' : ''}"><b class="${hasSticker(id) ? `k${i % 4}` : ''}">${hasSticker(id) ? icon : '?'}</b>${name}</div>`).join('');
  showOverlay({
    title: 'Stickers', wide: true, closable: true, onClose: back,
    body: `<p>${stickerCount()} of ${STICKERS.length} collected. Each one is earned by something you did at the table.</p><div class="stickers">${tiles}</div>`,
    items: [[`${glyph('B')}Back`, back]],
  });
}
