import * as audio from './audio.js';
import { bluffers, say, setMood } from './character.js';
import { closeOverlay, showOverlay } from './menus.js';
import { netEffect, netOn, sendUp } from './online.js';
import { grudge } from './perks.js';
import { prefs } from './prefs.js';
import { toast } from './squeeze.js';
import { S } from './state.js';
import { $, glyph, h } from './util.js';

// ---------- table talk: say something, and someone answers in character ----------
export const EMOTES = [['up', '\u2191', 'Nice hand', 'nice', 'happy'], ['right', '\u2192', 'Hurry up', 'hurry', 'think'], ['down', '\u2193', 'Ouch', 'ouch', 'idle'], ['left', '\u2190', 'Ha!', 'ha', 'happy']];
/* lastTalk, lastWinner: see state.js */
// Online, what a player says goes to everyone at the table: the quick lines, or anything they type.
export const cleanChat = (t) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, 40);
export function bubble(seat, text, ms = 2600) {
  const el = S.seatEls[seat]?.querySelector('.say');
  if (!el) return;
  el.textContent = text; el.style.marginLeft = ''; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  // keep a long line on the screen when the speaker sits at the edge
  const seat0 = S.seatEls[seat].getBoundingClientRect(), mid = seat0.left + seat0.width / 2, half = el.offsetWidth / 2, pad = 8;
  const shift = Math.min(0, innerWidth - pad - (mid + half)) + Math.max(0, pad - (mid - half));
  if (shift && !S.seatEls[seat].classList.contains('me')) el.style.marginLeft = `${shift}px`;
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), ms);
}
// Spectators speak from the rail: one bubble beside the table, with their name.
export function crowdSay(who, text) {
  const el = $('crowd');
  el.textContent = ''; el.append(h('b', '', `${who}: `), text); // names and messages are plain text
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 2600 + text.length * 50);
}
export function showChat(seat, text, who = '') {
  if (!prefs.chatter || !text) return; // table talk off: other players are muted too
  if (seat < 0) { crowdSay(who || 'Spectator', text); return audio.talk(3); }
  if (!S.game?.players[seat]) return;
  bubble(seat, text, 2200 + text.length * 50);
  audio.talk(S.cast[seat]?.voice ?? seat);
  setMood(seat, 'happy', 1400);
}
export function netSay(key, text) { // from this device to the rest of the table
  const now = performance.now();
  if (now - S.lastTalk < 1500 || !text) return;
  S.lastTalk = now;
  if (S.net?.watch) crowdSay('You', text); else bubble(S.ME, text, 2200 + text.length * 50);
  audio.talk(0);
  if (netOn('host')) netEffect('chat', { seat: S.ME, text });
  else sendUp(key ? { t: 'chat', key } : { t: 'chat', text });
}
export function chatEntry() {
  toggleEmotes(false);
  if (S.overlay || S.mode !== 'net') return;
  const send = () => { const text = cleanChat($('chat-in')?.value); closeOverlay(); netSay('', text); };
  showOverlay({
    title: 'Say <span>something</span>', closable: true,
    body: '<p>Everyone at the table sees it. Up to 40 letters.</p><input id="chat-in" class="namein chatin" maxlength="40" autocomplete="off" autocapitalize="sentences" enterkeyhint="send" placeholder="Type a message">',
    items: [[`${glyph('A')}Send`, send], [`${glyph('B')}Cancel`, null]],
  });
  const el = $('chat-in');
  el.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') send(); if (e.key === 'Escape') closeOverlay(); };
  setTimeout(() => el.focus(), 50);
}
export function toggleEmotes(open = $('emotes').hidden) {
  const bar = $('emotes');
  if (open && (!S.game || S.mode === 'pass' || !prefs.chatter)) return;
  bar.hidden = !open;
  if (!open) return;
  audio.tick();
  bar.innerHTML = '';
  for (const [, arrow, text, key] of EMOTES) {
    const b = h('button', 'btn sm', `<span class="glyph wide">${arrow}</span>${text}`);
    b.onclick = () => sendEmote(key);
    bar.append(b);
  }
  if (S.mode === 'net') { const b = h('button', 'btn sm type', `${glyph('A')}Type a message`); b.onclick = chatEntry; bar.append(b); }
}
export function sendEmote(key) {
  toggleEmotes(false);
  if (S.mode === 'net') return netSay(key, EMOTES.find((e) => e[3] === key)[2]);
  const now = performance.now();
  if (now - S.lastTalk < 2500) return;
  S.lastTalk = now;
  const [, , text, , mood] = EMOTES.find((e) => e[3] === key);
  const mineEl = S.seatEls[S.ME].querySelector('.say');
  mineEl.textContent = text; mineEl.classList.remove('show'); void mineEl.offsetWidth; mineEl.classList.add('show');
  clearTimeout(mineEl._t); mineEl._t = setTimeout(() => mineEl.classList.remove('show'), 2200);
  audio.talk(0);
  // who answers: the last winner for a compliment, whoever is thinking for "hurry up", otherwise anyone
  const g = S.game, ais = g.players.filter((p) => !p.isHuman && !p.out);
  if (!ais.length) return;
  let who = ais[Math.floor(Math.random() * ais.length)];
  if (key === 'nice' && ais.some((p) => p.seat === S.lastWinner)) who = g.players[S.lastWinner];
  if (key === 'hurry' && g.stage === 'betting' && !g.players[g.toAct].isHuman) who = g.players[g.toAct];
  setTimeout(() => { if (S.game === g) { say(who, key); setMood(who.seat, mood, 1600); } }, 750);
}

export function handOverBanter() {
  const g = S.game;
  if (!g || g.stage !== 'handOver') return; // the next hand has already started
  const me0 = g.players[S.ME];
  if (S.mode === 'run' && !S.bossMode) {
    const avenger = g.players.find((p) => !p.isHuman && p.won > 0 && grudge(p.name) && g.result.showdown && !me0.folded && me0.won === 0);
    if (avenger) { say(avenger, 'revenge'); setMood(avenger.seat, 'happy'); return; } // they enjoy getting you back
  }
  const ais = g.players.filter((p) => !p.isHuman && !p.out);
  let said = 0;
  const maybe = (p, moment, chance) => { if (said < 2 && Math.random() < chance) { say(p, moment); said++; } };
  for (const p of ais) {
    if (p.chips === 0 && p.total > 0) {
      say(p, 'bust'); said++;
      const left = ais.filter((q) => q.chips > 0).length;
      toast(left ? `${p.name} is out \u2014 ${left} to beat` : `${p.name} is out`);
    }
  }
  const big = g.players.reduce((s, p) => s + p.won, 0) > 20 * g.bb;
  for (const p of ais) {
    if (p.won > 0 && p.chips > 0) {
      if (g.result.showdown) maybe(p, 'win', big ? 0.75 : 0.35);
      else maybe(p, bluffers.has(p.seat) ? 'bluffed' : 'steal', bluffers.has(p.seat) ? 0.6 : 0.2);
    } else if (g.result.showdown && !p.folded && p.won === 0 && p.chips > 0 && p.total > 8 * g.bb) maybe(p, 'lose', 0.6);
  }
}
