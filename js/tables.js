// Tables you play for your bankroll: cash games, sit-and-gos and the heads-up ladder.
import * as audio from './audio.js';
import { LADDER_PRIZE, SNG, STAKES, cashOut, pay, prize, readBank, restake, sit } from './bank.js';
import { CHARACTERS, REGULARS, VARIANTS } from './config.js';
import { seatSingle } from './daily.js';
import * as fx from './fx.js';
import { moreGames, showOverlay, startScreen } from './menus.js';
import { toast } from './squeeze.js';
import { S } from './state.js';
import { glyph } from './util.js';

const KEY = 'padpoker.bank';
export const bank = () => { try { return readBank(localStorage.getItem(KEY)); } catch { return readBank(null); } };
const save = (b) => { try { localStorage.setItem(KEY, JSON.stringify(b)); } catch { /* private mode */ } return b; };
export const bankHtml = () => `<p class="bank">Bankroll <b>${bank().chips.toLocaleString()}</b></p>`;
// Called whenever the menus open: chips left on a cash table (the app was closed mid-session) come home,
// and a player who cannot afford anything is staked again.
export function settleBank() {
  const b = bank(), back = b.seat !== undefined ? cashOut(b) : 0, gift = restake(b);
  if (back || gift || b.seat !== undefined) save(b);
  if (back) toast(`${back.toLocaleString()} chips came back from the cash table`);
  else if (gift) toast(`Broke! The house stakes you ${gift.toLocaleString()} chips`);
}

export function tablesMenu() {
  settleBank();
  const b = bank(), rungs = Object.keys(CHARACTERS);
  showOverlay({
    title: 'Tables', closable: true, onClose: moreGames,
    body: `${bankHtml()}<p><b>Cash game:</b> sit down with a buy-in, leave when you like, keep what you have. Blinds never rise.</p>
      <p><b>Sit &amp; go:</b> six players, ${SNG.buyin} each; the top three are paid ${SNG.prizes.join(', ')}.</p>
      <p><b>Heads-up ladder:</b> one on one against each regular in turn. Rung ${Math.min(b.rung + 1, rungs.length)} of ${rungs.length}.</p>`,
    items: [[`${glyph('A')}Cash game`, cashMenu], ['Sit & go', sngMenu], ['Heads-up ladder', ladderMenu], [`${glyph('B')}Back`, moreGames]],
  });
}

// ---------- cash game ----------
function cashMenu() {
  const b = bank();
  showOverlay({
    title: 'Cash <span>game</span>', closable: true, onClose: tablesMenu,
    body: `${bankHtml()}<p>Pick your stakes. You buy in for 100 big blinds; opponents who go broke buy back in. Cash out from the menu at any time: a hand you walk away from counts as folded.</p>`,
    items: [...STAKES.map((s, i) => [`${i === 0 ? glyph('A') : ''}${s.name} · buy-in ${s.buyin.toLocaleString()}`, () => startCash(s), false, b.chips < s.buyin]), [`${glyph('B')}Back`, tablesMenu]],
  });
}
export function startCash(stake) {
  const b = bank();
  if (!sit(b, stake.buyin)) { toast(`You need ${stake.buyin.toLocaleString()} chips for that table`); return cashMenu(); }
  save(b);
  S.cash = { ...stake, hands: 0 };
  seatSingle('cash', { names: REGULARS, skill: 0.8, venue: 'Cash game', mat: '#1f6f54', handsPerLevel: Infinity, startLevel: stake.level, chips: stake.buyin, music: 3 }, `<b>Cash ${stake.name}</b>`);
}
// Before each cash hand: opponents who went broke buy back in, and your stack is written down so it survives the app closing.
export function cashHand(g) {
  for (const p of g.players) if (!p.isHuman && p.chips === 0) { p.chips = S.cash.buyin; p.out = false; }
  S.cash.hands++;
  const b = bank(); b.seat = g.players[S.ME].chips; save(b);
}
export const cashHud = (g) => { const up = g.players[S.ME].chips + g.players[S.ME].total - S.cash.buyin; return `<b>Cash ${S.cash.name}</b><br>Hand <b>${S.cash.hands}</b> &middot; <b class="${up < 0 ? 'down' : 'up'}">${up < 0 ? '−' : '+'}${Math.abs(up).toLocaleString()}</b>`; };
// Leaving a cash table by the menu: what is in front of you goes home.
export function cashLeave(g) {
  const b = bank(); b.seat = g.players[S.ME].chips;
  const back = cashOut(b); save(b);
  const up = back - S.cash.buyin;
  setTimeout(() => toast(`Cashed out ${back.toLocaleString()} (${up < 0 ? '−' : '+'}${Math.abs(up).toLocaleString()})`), 300);
  S.cash = null;
}
export function cashBust() {
  const b = bank(); b.seat = 0; cashOut(b); restake(b); save(b);
  const stake = S.cash; S.cash = null;
  audio.musicLevel(0); audio.lose();
  showOverlay({
    title: 'Felted', body: `<p>Your buy-in is gone after ${stake.hands} hands.</p>${bankHtml()}`,
    items: [[`${glyph('A')}Buy in again`, () => startCash(stake), false, b.chips < stake.buyin], ['Done', startScreen]],
  });
}

// ---------- sit and go ----------
const SNG_CFG = { names: REGULARS, skill: 0.7, venue: 'Sit & go', mat: '#2c7da0', handsPerLevel: 4, chips: 1000, music: 1 };
function sngMenu() {
  showOverlay({
    title: 'Sit <span>&amp; go</span>', closable: true, onClose: tablesMenu,
    body: `${bankHtml()}<p>Six players, ${SNG.buyin} each. First takes ${SNG.prizes[0]}, second ${SNG.prizes[1]}, third ${SNG.prizes[2]}.</p><p><b>Short deck:</b> ${VARIANTS.short.rules}</p><p><b>Omaha:</b> ${VARIANTS.omaha.rules}</p>`,
    items: [[`${glyph('A')}Hold'em`, () => startSng('holdem')], ['Short deck', () => startSng('short')], ['Omaha', () => startSng('omaha')], [`${glyph('B')}Back`, tablesMenu]],
  });
}
export function startSng(v = S.quickVariant) {
  const b = bank();
  if (!pay(b, SNG.buyin)) { toast(`You need ${SNG.buyin} chips to enter`); return tablesMenu(); }
  save(b);
  S.quickVariant = v; S.quickKind = 'sng';
  seatSingle('quick', { ...SNG_CFG, variant: v }, `<b>Sit &amp; go</b><br>${VARIANTS[v].name}`);
}

// ---------- heads-up ladder ----------
const rungName = (i) => Object.keys(CHARACTERS)[i];
function ladderMenu() {
  const b = bank(), names = Object.keys(CHARACTERS), top = b.rung >= names.length;
  showOverlay({
    title: 'Heads-up <span>ladder</span>', closable: true, onClose: tablesMenu,
    body: `<p>One on one, 1,000 chips each, blinds rising. Beat an opponent to climb; each new rung pays into your bankroll. Losing costs nothing: try again.</p>
      <div class="ladder">${names.map((n, i) => `<span class="${i === b.rung ? 'here' : i < b.rung ? 'done' : ''}"><b>${n}</b>${CHARACTERS[n].tag}</span>`).join('')}</div>`,
    items: [top ? ['You beat everyone', null, true, true] : [`${glyph('A')}Play ${names[b.rung]} · wins ${LADDER_PRIZE(b.rung)}`, () => startLadder(b.rung)], [`${glyph('B')}Back`, tablesMenu]],
  });
}
function startLadder(rung) {
  S.quickKind = 'ladder'; S.ladderRung = rung;
  const name = rungName(rung);
  seatSingle('quick', { names: [name], skill: Math.min(1, 0.6 + rung * 0.045), venue: 'Heads-up ladder', mat: '#7a3fb0', handsPerLevel: 4, chips: 1000, music: 4 }, `<b>Heads-up</b><br>${name}`);
}

// A sit-and-go or ladder match has ended (the game loop calls this for both).
export function quickDone() {
  const g = S.game, me = g.players[S.ME], b = bank();
  audio.musicLevel(0);
  if (S.quickKind === 'ladder') {
    const won = me.chips > 0, name = rungName(S.ladderRung), fresh = won && S.ladderRung === b.rung;
    if (fresh) { b.chips += LADDER_PRIZE(S.ladderRung); b.rung++; save(b); }
    if (won) { audio.fanfare(); fx.chipRain(30); } else audio.lose();
    return showOverlay({
      title: won ? 'Rung <span>cleared!</span>' : `${name} <span>wins</span>`,
      body: `<p>${won ? `You beat ${name} in ${g.handNo} hands.${fresh ? ` ${LADDER_PRIZE(S.ladderRung)} chips go to your bankroll.` : ''}` : `${name} took it after ${g.handNo} hands. It costs nothing to try again.`}</p>${bankHtml()}`,
      items: [[`${glyph('A')}${won ? 'Next rung' : 'Try again'}`, ladderMenu], ['Done', startScreen]],
    });
  }
  const place = g.players.filter((p) => p.chips > 0).length + (me.chips > 0 ? 0 : 1);
  const ord = ['', '1st', '2nd', '3rd', '4th', '5th', '6th'][place], paid = prize(place);
  if (paid) { b.chips += paid; save(b); }
  restake(b) && save(b);
  if (place === 1) { audio.fanfare(); fx.chipRain(40); } else if (paid) audio.win(1); else audio.lose();
  showOverlay({
    title: place === 1 ? 'You <span>win!</span>' : `${ord} <span>place</span>`,
    body: `<p>${place === 1 ? `You took the whole table in ${g.handNo} hands.` : `Out in ${ord} of 6 after ${g.handNo} hands.`} ${paid ? `That pays <b>${paid}</b>.` : 'No prize this time.'}</p>${bankHtml()}`,
    items: [[`${glyph('A')}Play again`, () => startSng()], ['Done', startScreen]],
  });
}
