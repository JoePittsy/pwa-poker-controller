import { setTable } from './venue.js';
import * as audio from './audio.js';
import { CHARACTERS, setVariantLook } from './config.js';
import { Game } from './engine.js';
import * as fx from './fx.js';
import { run } from './loop.js';
import { moreGames, showOverlay, startScreen } from './menus.js';
import { leaveOnline } from './online.js';
import { ui } from './prefs.js';
import { buildSeats, render } from './render.js';
import { renderActions } from './squeeze.js';
import { S } from './state.js';
import { $, glyph } from './util.js';

// ---------- pass and play: two to four people share the device ----------
// The table turns to face whoever is acting. Between turns their cards are face down and a
// handover screen covers the table, so nobody sees a hand that isn't theirs.
export const PASS_COLORS = ['var(--blue)', 'var(--red)', 'var(--mint)', 'var(--yellow)'];
/* passHumans: see state.js */
export function startPass(humans) {
  leaveOnline();
  S.mode = 'pass'; S.bossMode = false; S.twist = ''; S.perks = {}; S.table = 0; S.aiRng = Math.random; S.ME = 0;
  const people = Array.from({ length: humans }, (_, i) => ({ name: `P${i + 1}`, badge: String(i + 1), isHuman: true, tag: 'Player', color: PASS_COLORS[i] }));
  const bots = ['Gus', 'Ivy'].slice(0, Math.max(0, 4 - humans)).map((name) => ({ name, ...CHARACTERS[name], style: { ...CHARACTERS[name].style, skill: 0.7 } }));
  S.cast = [...people, ...bots];
  S.game = new Game({ players: S.cast, handsPerLevel: 5, chips: 1000 });
  setVariantLook('holdem');
  S.passHumans = humans;
  setTable('#8a4fbf', 'pass', 'Pass & play');
  audio.setVenue(3);
  ui.hidden = true;
  buildSeats();
  $('msg').textContent = ''; $('msg').classList.remove('show');
  $('pot').hidden = true;
  $('hud').innerHTML = '<b>Pass &amp; play</b>';
  ui.mode = 'wait'; ui.resolve = null;
  S.lastBB = 0; S.fast = false; audio.hush(false); S.squeeze = null; ui.squeezed = true;
  S.runId++;
  renderActions();
  run();
}
export function passMenu() {
  showOverlay({
    title: 'Pass <span>&amp; play</span>', closable: true, onClose: moreGames,
    body: `<p>Share one device. On your turn the table turns to face you and shows your cards; after you act they go face down and you pass it on. Computer players fill the table up to four.</p>`,
    items: [['2 players', () => startPass(2)], ['3 players', () => startPass(3)], ['4 players', () => startPass(4)], [`${glyph('B')}Back`, moreGames]],
  });
}
// Hand the device to the player who is about to act, then turn the table to them.
export async function takeSeat(p) {
  const peopleLeft = S.game.players.filter((q) => q.isHuman && !q.out).length;
  if (peopleLeft > 1) {
    await new Promise((res) => showOverlay({
      title: `Pass to <span>${p.name}</span>`,
      body: `<p>Everyone else, look away. ${p.name}, press when only you can see the screen.</p>`,
      items: [[`${glyph('A')}I'm ${p.name}`, res]],
    }));
  }
  S.ME = p.seat; ui.hidden = false;
  ui.noAnim = true; buildSeats(true); render(); ui.noAnim = false;
}
export function passDone() {
  const w = S.game.players.find((p) => p.chips > 0);
  S.ME = 0; ui.hidden = false;
  audio.musicLevel(0); audio.fanfare(); fx.chipRain(40);
  showOverlay({
    title: `${w.name} <span>wins!</span>`,
    body: `<p>${w.isHuman ? `Player ${w.name.slice(1)}` : w.name} took every chip in ${S.game.handNo} hands.</p>`,
    items: [[`${glyph('A')}Play again`, () => startPass(S.passHumans)], ['Done', startScreen]],
  });
}
