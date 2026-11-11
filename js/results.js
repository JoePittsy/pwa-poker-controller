import { bossFor, tableConfig } from './config.js';
import { DAILY_CFG, DAILY_HANDS, dailyData, today } from './daily.js';
import { tables } from './menus.js';
import { shareCard } from './share.js';
import { toast } from './squeeze.js';
import { S } from './state.js';
import { STICKERS, count as stickerCount } from './stickers.js';

// ---------- shareable result cards ----------
export async function share(card, name) {
  toast('Making your card\u2026');
  const res = await shareCard(card, name).catch(() => 'failed');
  toast(res === 'saved' ? 'Card saved as an image' : res === 'failed' ? "Couldn't make the card" : 'Shared');
}
export function runCard() {
  const cleared = S.bossMode ? S.table : S.table - 1, r = S.runStats;
  return {
    kicker: 'My run', title: `${tables(cleared)} cleared`,
    sub: S.bossMode ? `Beaten by ${bossFor(S.table).name}, ${bossFor(S.table).tag}` : `Out at Table ${S.table}, ${tableConfig(S.table).venue}`,
    accent: tableConfig(S.table, S.bossMode).mat,
    tiles: [[r.knockouts, 'knock-outs'], [r.hands, 'hands played'], [r.hands ? `${Math.round((r.won / r.hands) * 100)}%` : '\u2013', 'hands won'],
      [r.biggest.toLocaleString(), 'biggest pot'], [r.bestHand ? r.bestHand.split(',')[0] : '\u2013', 'best hand'], [`${stickerCount()}/${STICKERS.length}`, 'stickers']],
  };
}
export function dailyCard() {
  const d = dailyData(), t = today(), all = Object.values(d.scores);
  return {
    kicker: `Daily deal \u00b7 ${t}`, title: `${(d.scores[t] ?? 0).toLocaleString()} chips`, sub: `from 1,000 over ${DAILY_HANDS} hands`, accent: DAILY_CFG.mat,
    tiles: [[all.length, 'days played'], [Math.max(...all, 0).toLocaleString(), 'best day'], [`${stickerCount()}/${STICKERS.length}`, 'stickers']],
  };
}
