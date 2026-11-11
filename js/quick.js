import * as audio from './audio.js';
import { REGULARS, VARIANTS } from './config.js';
import { seatSingle } from './daily.js';
import * as fx from './fx.js';
import { moreGames, showOverlay, startScreen } from './menus.js';
import { S } from './state.js';
import { glyph } from './util.js';

// ---------- quick table: one sit-and-go, nothing saved, nothing at stake ----------
export const QUICK_CFG = { names: REGULARS, skill: 0.7, venue: 'Quick table', mat: '#2c7da0', handsPerLevel: 4, chips: 1000, music: 1 };
/* quickVariant: see state.js */
export function startQuick(v = S.quickVariant) {
  S.quickVariant = v;
  seatSingle('quick', { ...QUICK_CFG, variant: v }, `<b>Quick table</b><br>${VARIANTS[v].name}`);
}
export function quickMenu() {
  showOverlay({
    title: 'Quick <span>table</span>', closable: true, onClose: moreGames,
    body: `<p>One six-player table, winner takes all.</p><p><b>Short deck:</b> ${VARIANTS.short.rules}</p><p><b>Omaha:</b> ${VARIANTS.omaha.rules}</p>`,
    items: [[`${glyph('A')}Hold'em`, () => startQuick('holdem')], ['Short deck', () => startQuick('short')], ['Omaha', () => startQuick('omaha')], [`${glyph('B')}Back`, moreGames]],
  });
}
export function quickDone() {
  const me = S.game.players[S.ME];
  const place = S.game.players.filter((p) => p.chips > 0).length + (me.chips > 0 ? 0 : 1);
  const ord = ['', '1st', '2nd', '3rd', '4th', '5th', '6th'][place];
  audio.musicLevel(0);
  if (place === 1) { audio.fanfare(); fx.chipRain(40); } else audio.lose();
  showOverlay({
    title: place === 1 ? 'You <span>win!</span>' : `${ord} <span>place</span>`,
    body: `<p>${place === 1 ? `You took the whole table in ${S.game.handNo} hands.` : `Out in ${ord} of 6 after ${S.game.handNo} hands.`}</p>`,
    items: [[`${glyph('A')}Play again`, () => startQuick()], ['Done', startScreen]],
  });
}
