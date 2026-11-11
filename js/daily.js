import { award } from './achievements.js';
import { bestStreak, board, makeChallenge, medal, streak } from './dailystats.js';
import * as audio from './audio.js';
import { CHARACTERS, YOU, setVariantLook } from './config.js';
import { Game } from './engine.js';
import * as fx from './fx.js';
import { run } from './loop.js';
import { moreGames, showOverlay, startScreen } from './menus.js';
import { leaveOnline } from './online.js';
import { prefs, ui } from './prefs.js';
import { buildSeats } from './render.js';
import { dailyCard, share } from './results.js';
import { renderActions, toast } from './squeeze.js';
import { S } from './state.js';
import { $, glyph } from './util.js';

// ---------- the daily deal: the same 20 hands for everyone, one attempt a day ----------
export const DAILY_HANDS = 20;
export const DAILY_KEY = 'padpoker.daily';
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export function dailyData() { try { return JSON.parse(localStorage.getItem(DAILY_KEY)) || { scores: {} }; } catch { return { scores: {} }; } }
export function saveDaily(d) { try { localStorage.setItem(DAILY_KEY, JSON.stringify(d)); } catch { /* private mode */ } }
export function dailySeed(hand) { // one number per date and hand
  let hsh = 2166136261;
  for (const ch of `${today()}#${hand}`) hsh = Math.imul(hsh ^ ch.charCodeAt(0), 16777619);
  return hsh | 0;
}
export const DAILY_CFG = { names: ['Mav', 'Dot', 'Rex', 'Ivy', 'Gus'], skill: 0.75, venue: 'The Daily Deal', mat: '#b4551f', handsPerLevel: 4, chips: 1000 };
export function dailyCalendar() {
  const d = dailyData();
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const dt = new Date(); dt.setDate(dt.getDate() - i);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    const sc = d.scores[key];
    days.push(`<div class="${sc === undefined ? 'none' : medal(sc).toLowerCase()}${i === 0 ? ' now' : ''}"><i>${dt.getDate()}/${dt.getMonth() + 1}</i><b>${sc === undefined ? '\u2013' : sc.toLocaleString()}</b></div>`);
  }
  const all = Object.values(d.scores);
  const run = streak(d.scores, today());
  return `<div class="cal">${days.join('')}</div><p>Streak: <b>${run} day${run === 1 ? '' : 's'}</b> (best ${bestStreak(d.scores)}) &middot; Days played: <b>${all.length}</b> &middot; Best: <b>${all.length ? Math.max(...all).toLocaleString() : '\u2013'}</b></p>
    <p class="medals">Finish with <b class="bronze">1,000</b> for bronze, <b class="silver">1,500</b> for silver, <b class="gold">2,500</b> for gold.</p>`;
}
// You against the friends whose scores you have been sent. Theirs stay hidden until you have played.
export function dailyBoard() {
  const b = board(dailyData(), today(), prefs.name || 'You');
  const friends = b.rows.filter((r) => !r.me);
  if (!friends.length) return '';
  if (!b.played) return `<p class="who"><b>${friends.map((f) => f.name).join('</b>, <b>')}</b> ${friends.length === 1 ? 'has' : 'have'} played today. Play the deal to see how you compare.</p>`;
  return `<div class="dboard">${b.rows.map((r, i) => `<span class="${r.me ? 'me' : ''}"><i>${i + 1}</i>${r.name}<b>${r.score.toLocaleString()}</b></span>`).join('')}</div>`;
}
// Send today's score to a friend as a link. Opening it adds the score to their daily screen.
export async function challenge() {
  const d = dailyData(), t = today();
  const url = `${location.origin}${location.pathname}?daily=${makeChallenge(t, d.scores[t] ?? 0, prefs.name)}`;
  const text = `I made ${(d.scores[t] ?? 0).toLocaleString()} on today's PokerPad daily deal. Same cards for everyone: can you beat it?`;
  try { if (navigator.share) await navigator.share({ title: 'PokerPad daily deal', text, url }); else { await navigator.clipboard.writeText(`${text} ${url}`); toast('Challenge copied'); } } catch { /* the share sheet was closed */ }
}
export function dailyScreen() {
  const d = dailyData(), t = today();
  const done = d.scores[t] !== undefined;
  const mid = d.game && d.game.date === t;
  showOverlay({
    title: 'Daily <span>deal</span>', wide: true, closable: true, onClose: moreGames,
    body: `<p>${done ? `Today's score: <b>${d.scores[t].toLocaleString()}</b>. A new deal arrives tomorrow.` : `The same ${DAILY_HANDS} hands for everyone today, against all five regulars. Start with 1,000 and finish with as many chips as you can. One attempt.`}</p>${dailyBoard()}${dailyCalendar()}`,
    items: done ? [['Challenge a friend', challenge, true], ['Share picture', () => share(dailyCard(), 'pokerpad-daily.png'), true], [`${glyph('B')}Back`, moreGames]] : [[`${glyph('A')}${mid ? 'Carry on' : "Play today's deal"}`, () => startDaily(mid ? d.game : null)], [`${glyph('B')}Back`, moreGames]],
  });
}
// Seat a one-off table (daily deal, quick table) outside the run.
export function seatSingle(kind, cfg, hud, saved) {
  leaveOnline();
  S.ME = 0; ui.hidden = false;
  S.mode = kind; S.bossMode = false; S.twist = ''; S.perks = {}; S.table = 0; S.aiRng = Math.random;
  S.cast = [YOU, ...cfg.names.map((name) => ({ name, ...CHARACTERS[name], style: { ...CHARACTERS[name].style, skill: cfg.skill } }))];
  S.game = new Game({ players: S.cast, handsPerLevel: cfg.handsPerLevel, chips: cfg.chips, variant: cfg.variant || 'holdem', startLevel: cfg.startLevel || 0 });
  setVariantLook(S.game.variant);
  S.habits = { facing: 0, folds: 0, acts: 0, raises: 0 };
  if (saved) {
    S.game.players.forEach((p, i) => { p.chips = saved.chips[i]; p.out = p.chips <= 0; });
    S.game.dealer = saved.dealer; S.game.handNo = saved.handNo;
  }
  $('app').style.setProperty('--mat', cfg.mat);
  audio.setVenue(cfg.music ?? 2);
  buildSeats();
  $('msg').textContent = ''; $('msg').classList.remove('show');
  $('pot').hidden = true;
  $('hud').innerHTML = hud;
  ui.mode = 'wait'; ui.resolve = null;
  S.lastBB = 0; S.fast = false; audio.hush(false); S.squeeze = null; ui.squeezed = true;
  S.runId++;
  renderActions();
  run();
}
export function startDaily(saved) {
  if (!saved) { const d = dailyData(); d.game = { date: today(), chips: Array(6).fill(DAILY_CFG.chips), dealer: -1, handNo: 0 }; saveDaily(d); }
  seatSingle('daily', DAILY_CFG, `<b>Daily deal</b><br>${today()}`, saved);
}
export function dailyDone() {
  const me = S.game.players[S.ME], d = dailyData(), t = today();
  d.scores[t] = me.chips; delete d.game; saveDaily(d);
  award('daily_player');
  if (me.chips > 2000) award('in_the_black');
  if (Object.keys(d.scores).length >= 3) award('regular_hours');
  audio.musicLevel(0);
  if (me.chips > DAILY_CFG.chips) { audio.win(2); fx.burst($('center'), 40); } else audio.lose();
  showOverlay({
    title: 'Daily <span>deal</span>', wide: true,
    body: `<p class="venue">You finished with ${me.chips.toLocaleString()} chips${me.chips === 0 ? '' : ` after ${S.game.handNo} hands`}${medal(me.chips) ? ` &middot; <b class="${medal(me.chips).toLowerCase()}">${medal(me.chips)}</b>` : ''}.</p>${dailyBoard()}${dailyCalendar()}`,
    items: [[`${glyph('A')}Done`, startScreen], ['Challenge a friend', challenge, true], ['Share picture', () => share(dailyCard(), 'pokerpad-daily.png'), true]],
  });
}
