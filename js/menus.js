import { stickersScreen } from './achievements.js';
import * as audio from './audio.js';
import { dailyData, dailyScreen, today } from './daily.js';
import * as fx from './fx.js';
import { loadSave, startTable, writeSave } from './loop.js';
import { notebookScreen } from './notebook.js';
import { leaveOnline, onlineMenu } from './online.js';
import { passMenu } from './pass.js';
import { ui } from './prefs.js';
import { quickMenu } from './quick.js';
import { helpMenu, howTo, replayHand, settingsMenu } from './replay.js';
import { rankCheck, rankHtml, ranksScreen } from './rank.js';
import { reviewScreen } from './review.js';
import { renderActions, toast } from './squeeze.js';
import { S } from './state.js';
import { cardsText, history, stats } from './stats.js';
import { STICKERS, count as stickerCount } from './stickers.js';
import { toggleEmotes } from './talk.js';
import { $, glyph, h } from './util.js';

// Every way to play is on the first screen; this name is kept for the many menus that go "back" to it.
export function moreGames() { startScreen(); }

// ---------- overlay (start / pause / game over) ----------
// The controls legend lives in Help. It lists controller buttons only while a controller is connected,
// keys only on a device likely to have a keyboard, and otherwise just says to tap.
export const CONTROL_ROWS = [['A', 'Enter', 'Confirm'], ['B', 'Esc', 'Fold &middot; Back'], ['X', 'C', 'Check &middot; Call'], ['Y', 'R', 'Bet &middot; Raise'],
  ['D-pad / Stick', 'Arrows', 'Move &middot; Adjust bet (&uarr;&darr; = big steps)'], ['LB RB', 'Q E', 'Bet presets'], ['Start', 'P', 'Menu']];
export function controlsHtml() {
  const pad = document.body.classList.contains('gp'), keys = matchMedia('(pointer: fine)').matches;
  const hint = pad ? '' : '<p>Have a controller? Connect it and press any button: hints then appear on the buttons.</p>';
  if (!pad && !keys) return `<p>Tap the buttons on screen. Drag your cards up to peek at them.</p>${hint}`;
  const cell = (p, k) => [pad ? (p.length <= 2 || p === 'Start' || p === 'LB RB' ? p.split(' ').map((x) => (x === 'Start' ? x : glyph(x))).join(' ') : p) : '', keys ? k : ''].filter(Boolean).join(' / ');
  return `<table>${CONTROL_ROWS.map(([p, k, what]) => `<tr><td>${cell(p, k)}</td><td>${what}${pad && p === 'LB RB' ? ' &middot; RB: table talk' : ''}</td></tr>`).join('')}</table>${hint}`;
}

// items: [label | () => label, fn, keepOpen]
/** @param {{ title: string, body?: string, items: any[], closable?: boolean, compact?: boolean, wide?: boolean, perky?: boolean, onClose?: Function }} o */
export function showOverlay({ title, body, items, closable = false, compact = false, wide = false, perky = false, onClose }) {
  S.overlay = { items, focus: 0, closable, onClose, cols: compact ? 2 : 1 };
  for (const e of document.querySelectorAll('.bannerfx')) e.remove(); // banners must not sit on top of a menu
  const el = $('overlay');
  el.innerHTML = '';
  const d = h('div', 'dialog' + (compact ? ' compact' : '') + (wide ? ' wide' : '') + (perky ? ' perky' : ''));
  d.append(h('div', '', `<h1>${title}</h1>${body}`));
  const list = h('div', 'items');
  const text = (l) => (typeof l === 'function' ? l() : l);
  items.forEach(([label, fn, keep, off], i) => { // off: shown greyed out; pressing it only explains why
    const b = h('button', 'btn' + (i === 0 ? ' focus call' : '') + (off ? ' off' : ''), text(label));
    b.onclick = () => {
      audio.confirm();
      if (!keep) closeOverlay();
      fn?.();
      if (keep) { b.innerHTML = text(label); fx.pop(b, 1.08, 200); }
    };
    list.append(b);
  });
  d.append(list);
  el.append(d);
  el.hidden = false;
}
export function closeOverlay() { S.overlay = null; $('overlay').hidden = true; }
export function overlayFocus(d) {
  const n = S.overlay.items.length;
  if (n > 1) audio.tick();
  S.overlay.focus = (S.overlay.focus + d + n) % n;
  [...$('overlay').querySelectorAll('.items .btn')].forEach((b, i) => {
    b.classList.toggle('focus', i === S.overlay.focus);
    b.classList.toggle('call', i === S.overlay.focus);
  });
}

export const TITLE = '<span class="logo">Poker<span>Pad</span></span>';
export const best = () => { try { return +localStorage.getItem('padpoker.best') || 0; } catch { return 0; } };
export const tables = (n) => `${n} table${n === 1 ? '' : 's'}`;
export function startScreen() {
  const saved = loadSave();
  const record = best() ? ` Your best run: ${tables(best())} cleared.` : '';
  const d = dailyData(), daily = d.scores[today()] !== undefined ? 'Daily deal \u2713' : 'Daily deal';
  const run = saved
    ? [[`${glyph('A')}Continue \u2013 ${saved.boss ? 'Boss' : `Table ${saved.table}`}`, () => startTable(saved.table, saved)], ['New run', () => startTable(1)]]
    : [[`${glyph('A')}Play`, firstPlay]];
  showOverlay({
    title: TITLE, compact: true,
    body: `<p>No-limit Texas Hold'em. <b>Play</b> a run of tables against the computer, go <b>online</b> with friends on their own devices, or <b>pass</b> one device around.${record}</p>${rankHtml()}`,
    items: [...run, ['Online', onlineMenu], [daily, dailyScreen], ['Quick table', quickMenu], ['Pass & play', passMenu],
      ['Stats', () => statsScreen(startScreen)], ['Settings', () => settingsMenu(startScreen)], ['Help', () => helpMenu(startScreen)]],
  });
  rankCheck();
}
export function firstPlay() {
  let seen = true;
  try { seen = !!localStorage.getItem('padpoker.seen'); } catch { /* private mode */ }
  if (seen) startTable(1); else howTo(0, () => startTable(1), true);
}
// Leave the table for the title screen. A run or daily deal is kept exactly where it is,
// to carry on later; if you walk away in the middle of a hand, that hand counts as folded
// (your chips already in the pot are gone, everyone else gets theirs back).
export function exitToMenu() {
  const g = S.game, kind = S.mode;
  if (kind === 'net') leaveOnline();
  else if (g && (kind === 'run' || kind === 'daily') && ['betting', 'streetEnd'].includes(g.stage)) {
    const me = g.players[S.ME];
    const chips = g.players.map((p) => (p === me ? p.chips : p.chips + p.total));
    if (me.chips > 0) { // (all-in and walking away would bust you: that hand is simply dealt again instead)
      writeSave({ table: S.table, boss: S.bossMode, chips, dealer: g.dealer, handNo: g.handNo, habits: S.habits, run: S.runStats, perks: S.perks, heat: S.heat, mem: S.memory });
      if (!me.folded && me.total > 0) setTimeout(() => toast('Saved. The hand you left counts as folded.'), 300);
    }
  }
  S.runId++; // stops the game loop
  S.fast = false; audio.hush(false); audio.tension(false); audio.musicLevel(0);
  S.game = null; S.ME = 0; S.mode = 'run'; S.squeeze = null;
  Object.assign(ui, { mode: 'wait', resolve: null, squeezed: true, hidden: false, slowRiver: false, scatter: 0 });
  toggleEmotes(false);
  for (const id of ['seats', 'board', 'burn', 'hud']) $(id).innerHTML = '';
  $('pot').hidden = true; $('msg').textContent = ''; $('msg').classList.remove('show');
  $('app').classList.remove('zoom', 'omaha');
  renderActions();
  startScreen();
}
export function pauseMenu() {
  audio.tick();
  showOverlay({
    title: TITLE, body: '', closable: true,
    items: [
      ['Resume'],
      ...(S.mode === 'net' ? [] : [['Hands', () => handsScreen(pauseMenu)]]), // no replays while others are waiting on you
      ['Stats', () => statsScreen(pauseMenu)],
      ['Help', () => helpMenu(pauseMenu)],
      ['Settings', () => settingsMenu(pauseMenu)],
      S.mode === 'net' ? ['Leave game', exitToMenu] : [S.mode === 'run' || S.mode === 'daily' ? 'Save & main menu' : 'Quit to menu', exitToMenu],
    ],
  });
}
export function statsScreen(back) {
  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '\u2013');
  const tile = (v, label) => `<div><b>${v}</b>${label}</div>`;
  showOverlay({
    title: 'Stats', closable: true, onClose: back,
    body: `${rankHtml()}<div class="stats">
      ${tile(best(), 'best run (tables)')}${tile(stats.tables, 'tables cleared')}${tile(stats.knockouts, 'knock-outs')}
      ${tile(stats.hands.toLocaleString(), 'hands played')}${tile(pct(stats.won, stats.hands), 'hands won')}${tile(stats.biggest.toLocaleString(), 'biggest pot')}
      ${tile(pct(stats.showdownsWon, stats.showdowns), 'showdowns won')}${tile(pct(stats.allinsWon, stats.allins), 'all-ins won')}${tile(stats.bestHand || '\u2013', 'best hand')}
    </div>`,
    items: [['Ranks', () => ranksScreen(() => statsScreen(back))], [`Stickers ${stickerCount()}/${STICKERS.length}`, () => stickersScreen(() => statsScreen(back))], ['Notebook', () => notebookScreen(() => statsScreen(back))], [`${glyph('B')}Back`, back]],
  });
}
export function handsScreen(back, at = history.length - 1) {
  const hnd = history[at];
  let body = '<p>No finished hand yet.</p>';
  if (hnd) {
    const rows = hnd.streets.filter((st) => st.acts.length || st.board.length).map((st) =>
      `<tr><td>${st.name}${st.board.length ? `<br>${cardsText(st.board)}` : ''}</td><td>${st.acts.join(', ') || '\u2013'}</td></tr>`);
    if (hnd.shown.length) rows.push(`<tr><td>Showdown</td><td>${hnd.shown.map((x) => `${x.name} ${cardsText(x.cards)} <i>${x.hand}</i>`).join('<br>')}</td></tr>`);
    body = `<p>${hnd.where}, hand ${hnd.no} &middot; blinds ${hnd.blinds} &middot; you held ${cardsText(hnd.hole)} &middot; <b>${at + 1} of ${history.length}</b></p>
      <table class="log">${rows.join('')}</table><p class="res">${hnd.result}</p>`;
  }
  const items = [];
  if (hnd) items.push([`${glyph('A')}Replay`, () => replayHand(hnd, () => handsScreen(back, at))]);
  if (hnd) items.push(['Review', () => reviewScreen([hnd], 0, () => handsScreen(back, at))]);
  if (at > 0) items.push(['Older hand', () => handsScreen(back, at - 1)]);
  if (at < history.length - 1) items.push(['Newer hand', () => handsScreen(back, at + 1)]);
  items.push([`${glyph('B')}Back`, back]);
  showOverlay({ title: 'Hands', closable: true, onClose: back, wide: true, body, items });
}
