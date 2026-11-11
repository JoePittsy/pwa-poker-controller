import { kindOf, setTable } from './venue.js';
import { expected, handover } from './handover.js';
import { addGame, addLog, placeOf, placings, readLog, table, tally } from './standings.js';
import { saveStats, stats } from './stats.js';
import { rankName } from './career.js';
import { myRank } from './rank.js';
import { decide } from './ai.js';
import * as audio from './audio.js';
import { humanProfile, say, setMood } from './character.js';
import { CHARACTERS, TWISTS, VARIANTS, VENUES, setVariantLook } from './config.js';
import { actionFx, collectBets, handOverFx } from './effects.js';
import { Game } from './engine.js';
import { FACES, face } from './faces.js';
import * as fx from './fx.js';
import { run } from './loop.js';
import { closeOverlay, exitToMenu, moreGames, overlayFocus, showOverlay, startScreen } from './menus.js';
import { canEncrypt, connectAny, exportKey, importKey, newKeys, seal, sharedKey, unseal, newSecret } from './net.js';
import { PASS_COLORS } from './pass.js';
import { BACKS, applyPrefs, prefs, ui, unlockedBacks } from './prefs.js';
import { buildSeats, render } from './render.js';
import { finishSqueeze, renderActions, toast, waitForSqueeze } from './squeeze.js';
import { S } from './state.js';
import { EMOTES, cleanChat, showChat } from './talk.js';
import { finish, prompt } from './turn.js';
import { $, glyph, tick } from './util.js';

// ---------- online play ----------
// One player hosts: their device runs the real game and is the only one that knows every
// card. Everyone else is a guest: they are sent a picture of the table with only their own
// cards filled in, and send back what they want to do. Messages go through a public relay
// (see net.js) on topics named after the room code.
//   <room>/up        guests -> host   { t: 'join' | 'act' | 'leave' | 'hb', pid, ... }
//   <room>/dn/<pid>  host -> a guest  { t: 's' table | 'e' effect | 'lobby' | 'hold' | 'go' | 'hb' | 'end' | 'full' }
/* net: see state.js */ // { role: 'host' | 'guest', relay, code, base, ... }
export const netOn = (role) => S.net?.role === role;
// Everything is encrypted between the host and each guest (see net.js), so nobody listening on the
// relay can read cards or act for someone else. Sends are queued so they go out in the order made.
export function sealed(key, topic, msg, extra = {}) {
  const n = S.net;
  if (!n || !key) return;
  // (a message queued just before leaving still goes out, so goodbyes arrive)
  n.outq = n.outq.then(async () => { const body = await seal(key, msg); n.relay.publish(topic, JSON.stringify({ ...extra, ...body })); }).catch(() => {});
}
export const sendUp = (msg) => S.net && sealed(S.net.key, `${S.net.base}/up`, { ...msg, q: Date.now() }, { pid: S.net.pid });
export const sendTo = (pid, msg) => S.net && sealed(S.net.keys.get(pid)?.key, `${S.net.base}/dn/${pid}`, msg);
export const noCrypto = () => showOverlay({ title: 'Not <span>available</span>', body: '<p>Online play needs a secure (https) page so the game can be encrypted.</p>', items: [['OK', onlineMenu]] });
export const NET_TIMERS = [0, 15, 30, 45, 60, 90]; // seconds to act; 0 is no limit
export const NET_BOTS = ['Gus', 'Ivy', 'Dot', 'Mav', 'Rex'];
export const AWAY_AFTER = 12000; // ms of silence before someone counts as disconnected
export const setBackLook = (name) => { for (const k of Object.keys(BACKS)) document.body.classList.toggle(`back-${k.toLowerCase()}`, k === name); };

// The turn clock. `end` is on this device's own timer, so it is sent as time remaining.
/* clock: see state.js */ // { seat, end, total }
export function startClock(seat) {
  const secs = S.net?.cfg?.timer || 0;
  S.clock = secs ? { seat, end: performance.now() + secs * 1000, total: secs * 1000, lastTick: 0 } : null;
}
export function leaveOnline(tell = true) {
  if (!S.net) return;
  if (tell && netOn('host')) for (const pid of S.net.guests.keys()) sendTo(pid, { t: 'end', text: 'The host closed the game.' });
  if (tell && netOn('guest')) { sendUp({ t: 'leave' }); try { localStorage.removeItem('padpoker.seat'); } catch { /* private mode */ } }
  clearInterval(S.net.joiner); clearInterval(S.net.beat); clearInterval(S.net.again);
  const r = S.net.relay; S.net = null; S.clock = null;
  setTimeout(() => r.close(), 300); // let the goodbye go out first
  applyPrefs(); // back to your own card back
  if (S.mode === 'net') { S.mode = 'run'; S.runId++; S.game = null; S.ME = 0; $('seats').innerHTML = ''; $('board').innerHTML = ''; $('burn').innerHTML = ''; $('pot').hidden = true; $('hud').innerHTML = ''; $('msg').classList.remove('show'); ui.mode = 'wait'; ui.resolve = null; renderActions(); }
}
export function onlineMenu() {
  leaveOnline();
  showOverlay({
    title: 'Play <span>online</span>', closable: true, onClose: moreGames,
    body: `<p>Up to six people, each on their own device. One hosts, sets up the table and shares a five-digit room code or a link; the rest join.</p><p>The game is encrypted between the host and each player, so nobody else can read the cards or act for you. Only the host's device knows every card, so let someone you trust host.</p>${S.version ? `<p class="ver">Version ${ver()}</p>` : ''}`,
    items: [[`${glyph('A')}Host a game`, hostOnline], ['Join a game', () => joinEntry()], ['History', historyScreen], [`You: ${myName() || 'not set'}`, () => nameEntry()], [`${glyph('B')}Back`, moreGames]],
  });
}
// Names are typed by players and shown on every device, so only plain letters, digits and spaces get through.
export const cleanName = (n) => String(n || '').replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 10);
export const myName = () => cleanName(prefs.name);
export const myFace = () => (FACES.includes(prefs.face) ? prefs.face : '');
export function nameEntry(back = onlineMenu) {
  const tiles = ['', ...FACES];
  showOverlay({
    title: 'Your <span>player</span>', closable: true, onClose: back,
    body: `<p>Your name and face, shown to everyone at an online table.</p><input id="name-in" class="namein" maxlength="10" autocomplete="off" autocapitalize="words" spellcheck="false" enterkeyhint="done" placeholder="Your name" value="${myName()}"><div id="face-row" class="faces"></div>`,
    items: [[`${glyph('A')}Save`, () => { prefs.name = cleanName($('name-in')?.value ?? prefs.name); applyPrefs(); back(); }], [`${glyph('B')}Back`, back]],
  });
  S.overlay.naming = true;
  const row = $('face-row');
  const draw = () => { row.innerHTML = tiles.map((n, i) => `<button class="ava${n === myFace() ? ' sel' : ''}" data-mood="${n === myFace() ? 'happy' : 'idle'}" data-i="${i}">${n ? face(n) : '#'}</button>`).join(''); };
  const pick = (i) => { prefs.face = tiles[(i + tiles.length) % tiles.length]; audio.tick(); draw(); };
  row.onclick = (e) => { const b = /** @type {any} */ (e.target).closest('button'); if (b) pick(+b.dataset.i); };
  S.overlay.onKey = (b) => { // a controller steps through the faces
    if (b === 'left' || b === 'right') { pick(tiles.indexOf(myFace()) + (b === 'left' ? -1 : 1)); return true; }
    return false;
  };
  draw();
  const el = $('name-in');
  const keep = () => { prefs.name = cleanName(el.value); };
  el.oninput = keep;
  el.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') { keep(); applyPrefs(); closeOverlay(); back(); } }; // typing must not drive the menu
  if (!myName()) setTimeout(() => el.focus(), 50);
}
// Nobody shares a name at the table: a clash, or no name at all, falls back to the seat number.
export function seatNames() {
  const taken = new Set(), out = [];
  [myName(), ...lobbyGuests().map((gu) => gu.asked)].forEach((n, i) => {
    const name = n && !taken.has(n.toLowerCase()) && !NET_BOTS.includes(n) ? n : `P${i + 1}`;
    taken.add(name.toLowerCase()); out.push(name);
  });
  lobbyGuests().forEach((gu, i) => { gu.name = out[i + 1]; });
  return out;
}
// The short id of the build this device is running, shown online so a table can check everyone matches.
export const ver = () => (S.version ? S.version.slice(0, 7) : 'dev');
export const waiting = (title, text, cancel) => showOverlay({ title, body: `<p>${text}</p>`, items: [['Cancel', cancel]] });
export const twistName = (key) => TWISTS.find((t) => t.key === key)?.name || 'None';
// One line describing the host's settings, shown to everyone in the lobby.
export const cfgLine = (c) => [`${c.seats} seats`, c.timer ? `${c.timer}s to act` : 'no turn timer', VENUES[c.venue][0], VARIANTS[c.variant].name,
  c.twist ? twistName(c.twist) : null, c.rebuys ? `${c.rebuys > 9 ? 'unlimited' : c.rebuys} rebuy${c.rebuys === 1 ? '' : 's'}` : null, `${c.back} cards`].filter(Boolean).join(' · ');
export const startStack = (c) => Math.round(1000 * (c.twist === 'short' ? 0.5 : c.twist === 'deep' ? 2 : 1));

// ----- hosting -----
// The first time someone hosts or joins without a name, ask for one. Skipping is fine and is not asked again.
export function askNameFirst(then) {
  if (myName() || prefs.nameAsked) return false;
  prefs.nameAsked = true; applyPrefs();
  nameEntry(then);
  return true;
}
// The host's connection to the relay dropped. The game itself lives on this device, so reconnect and carry on;
// guests are brought up to date by the next table they are sent.
async function hostReconnect() {
  const n = S.net;
  if (!netOn('host')) return;
  toast('Connection lost. Reconnecting\u2026');
  for (let i = 0; i < 6 && S.net === n; i++) {
    try {
      const c = await connectAny(+n.code[0] - 1);
      if (S.net !== n) return c.relay.close();
      c.relay.onMessage = n.relay.onMessage; c.relay.onClose = hostReconnect; n.relay = c.relay;
      n.relay.subscribe(`${n.base}/up`);
      toast('Reconnected');
      if (n.started) netBroadcast(); else tellLobby();
      return;
    } catch { await tick(2500); }
  }
  if (S.net !== n) return;
  toast('Lost the relay. The game has ended.'); leaveOnline(false); startScreen();
}
export async function hostOnline(resume = null) {
  if (!canEncrypt()) return noCrypto();
  if (!resume && askNameFirst(hostOnline)) return;
  waiting('Opening <span>room</span>', 'Finding a relay…', onlineMenu);
  let conn;
  try { conn = await connectAny(); } catch { return showOverlay({ title: 'No <span>connection</span>', body: '<p>None of the public relays answered. Check your connection and try again.</p>', items: [['Try again', hostOnline], [`${glyph('B')}Back`, onlineMenu]] }); }
  const keys = await newKeys();
  if (!S.overlay || S.net) return conn.relay.close(); // cancelled while connecting
  const code = `${conn.index + 1}${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`; // first digit says which relay
  S.net = {
    role: 'host', relay: conn.relay, code, base: `padpoker2/${code}`, guests: new Map(), keys: new Map(), priv: keys.priv, pub: keys.pub, outq: Promise.resolve(), inq: Promise.resolve(), started: false, turn: 0, n: 0, waiter: null, hold: null,
    cfg: { timer: 45, seats: 4, venue: 0, back: prefs.back, twist: '', variant: 'holdem', rebuys: 0 },
    rs: newSecret(), // shared with everyone seated; lets a player who takes over prove they were in this room
  };
  if (resume) { S.net.resume = resume.state; Object.assign(S.net.cfg, resume.cfg, { seats: resume.state.players.length }); }
  S.net.relay.subscribe(`${S.net.base}/up`);
  S.net.relay.onMessage = (_, text) => { const n = S.net; n.inq = n.inq.then(() => (S.net === n ? hostRaw(JSON.parse(text)) : 0)).catch(() => { /* not ours, or not readable */ }); };
  S.net.relay.onClose = hostReconnect;
  S.net.beat = setInterval(hostBeat, 3000);
  S.net.again = setInterval(() => { // whoever we are waiting on gets the table every second, in case their copy was lost
    if (!netOn('host') || !S.net.waiter || S.net.hold) return;
    for (const [pid, gu] of S.net.guests) if (gu.seat === S.net.waiter.seat && !gu.kicked && !gu.away) sendTo(pid, tableFor(gu.seat));
  }, 1000);
  hostLobby();
}
export const lobbyGuests = () => [...S.net.guests.values()].filter((gu) => !gu.kicked && !gu.watch); // the people with a seat
export const watchers = () => [...S.net.guests.values()].filter((gu) => gu.watch);
export function tellLobby() {
  const names = S.net.resume ? S.net.resume.players.map((p) => p.name) : seatNames();
  for (const [pid, x] of S.net.guests) if (!x.kicked) sendTo(pid, { t: 'lobby', n: ++S.net.n, names, you: x.name, watch: !!x.watch, watching: watchers().length, info: cfgLine(S.net.cfg), stand: standing(), v: ver() });
}
// The lobby of a game that has been taken over: the seats are already decided, so there is nothing to set up.
function resumeLobby() {
  const want = expected(S.net.resume), here = (seat) => [...S.net.guests.values()].some((gu) => gu.seat === seat && !gu.watch);
  const missing = want.filter((p) => !here(p.seat));
  showOverlay({
    title: `Room <span>${S.net.code}</span>`,
    body: `<p>You are the host now. The hand that was interrupted is dealt again with everyone's bets returned.</p>
      <p class="who">${missing.length ? `Waiting for <b>${missing.map((p) => p.name).join('</b>, <b>')}</b> to follow.` : 'Everyone is here.'}</p><p>Anyone missing when you start is played by the computer.</p>`,
    items: [[`${glyph('A')}Carry on`, startOnline], ['Close room', onlineMenu]],
  });
  S.overlay.lobby = true;
  if (!missing.length && want.length) setTimeout(() => { if (netOn('host') && S.net.resume && S.overlay?.lobby) { closeOverlay(); startOnline(); } }, 1200);
}
export function hostLobby(focus = 0) {
  if (S.net.resume) return resumeLobby();
  const c = S.net.cfg, people = 1 + lobbyGuests().length;
  c.seats = Math.max(c.seats, people, 2);
  const names = seatNames().map((n, i) => (i ? n : `${n} (you)`));
  const link = `${location.origin}${location.pathname}?join=${S.net.code}`;
  const backs = unlockedBacks();
  const again = (i, change) => () => { change(); tellLobby(); hostLobby(i); }; // redraw with the same button focused
  const next = (list, cur) => list[(list.indexOf(cur) + 1) % list.length];
  showOverlay({
    title: `Room <span>${S.net.code}</span>`, compact: true,
    body: `<p>Others join with this code from Online on the main menu, or by opening your link. ${S.version ? `<span class="ver">Version ${ver()}</span>` : ''}</p><p class="who">At the table: <b>${names.join('</b>, <b>')}</b></p><p>${c.seats - people ? `${c.seats - people} computer player${c.seats - people > 1 ? 's' : ''} will fill the other seats.` : 'Every seat is a person.'} ${people > 1 ? '' : 'Waiting for someone to join…'}${watchers().length ? ` ${watchers().length} watching.` : ''}</p>${standHtml(standing())}`,
    items: [
      [`${glyph('A')}Start game`, () => (people > 1 ? startOnline() : (toast('Nobody has joined yet'), hostLobby()))],
      ['Share link', async () => {
        try { if (navigator.share) await navigator.share({ title: 'PokerPad', text: `Join my poker table: room ${S.net.code}`, url: link }); else { await navigator.clipboard.writeText(link); toast('Link copied'); } } catch { toast(`Room code ${S.net.code}`); }
      }, true],
      [`Turn timer: ${c.timer ? `${c.timer}s` : 'Off'}`, again(2, () => { c.timer = next(NET_TIMERS, c.timer); })],
      [`Seats: ${c.seats}`, again(3, () => { c.seats = c.seats >= 6 ? Math.max(2, people) : c.seats + 1; })],
      [`Table: ${VENUES[c.venue][0].replace('The ', '')}`, again(4, () => { c.venue = (c.venue + 1) % VENUES.length; })],
      [`Card back: ${c.back}`, again(5, () => { c.back = next(backs, c.back); if (backs.length === 1) toast('Clear tables in a run to unlock more card backs'); })],
      [`Twist: ${twistName(c.twist)}`, again(6, () => { c.twist = next(['', ...TWISTS.map((t) => t.key)], c.twist); })],
      [`Rebuys: ${c.rebuys ? (c.rebuys > 9 ? 'Any' : c.rebuys) : 'Off'}`, again(7, () => { c.rebuys = next([0, 1, 2, 99], c.rebuys || 0); })],
      [`Game: ${VARIANTS[c.variant].name}`, again(8, () => { c.variant = next(Object.keys(VARIANTS), c.variant); })],
      [`You: ${myName() || 'not set'}`, () => nameEntry(() => { tellLobby(); hostLobby(9); })],
      ['Close room', onlineMenu],
    ],
  });
  S.overlay.lobby = true;
  if (focus) { S.overlay.focus = focus; overlayFocus(0); }
}
// Every few seconds: let guests know we are here, and notice anyone who has gone quiet.
export function hostBeat() {
  if (!netOn('host')) return;
  const now = performance.now();
  for (const [pid, gu] of S.net.guests) {
    if (gu.kicked) continue;
    sendTo(pid, S.net.started && S.game && !gu.away ? tableFor(gu.seat) : { t: 'hb' }); // the relay can drop messages, so the table is sent again regularly
    if (!gu.away && now - gu.seen > AWAY_AFTER) setAway(gu, pid);
  }
}
export function setAway(gu, pid) {
  if (gu.away || gu.kicked) return;
  if (gu.watch) { S.net.guests.delete(pid); if (!S.net.started) { tellLobby(); if (S.overlay?.lobby) hostLobby(S.overlay.focus); } return; } // a spectator leaving changes nothing
  if (!S.net.started) { S.net.guests.delete(pid); tellLobby(); if (S.overlay?.lobby) hostLobby(); return; } // just frees the seat in the lobby
  gu.away = true;
  toast(`${gu.name} lost connection`);
  holdCheck();
}
// The game stops while anyone still playing is disconnected. It carries on when they are back,
// or when the host replaces them with a computer player.
export function holdCheck() {
  if (!netOn('host') || !S.net.started) return;
  const missing = [...S.net.guests.values()].filter((gu) => gu.away && !gu.kicked && !gu.watch && S.game && !S.game.players[gu.seat].out && S.game.players[gu.seat].chips + S.game.players[gu.seat].total > 0);
  if (!missing.length) {
    if (!S.net.hold) return;
    if (S.clock) S.clock.end += performance.now() - S.net.hold.since; // the clock did not run while we waited
    S.net.hold = null;
    if (S.overlay?.hold) closeOverlay();
    for (const [pid, gu] of S.net.guests) if (!gu.kicked) sendTo(pid, { t: 'go' });
    netBroadcast();
    return;
  }
  if (!S.net.hold) S.net.hold = { since: performance.now() };
  const names = missing.map((gu) => gu.name).join(' and ');
  for (const [pid, gu] of S.net.guests) if (!gu.kicked && !gu.away) sendTo(pid, { t: 'hold', names });
  showOverlay({
    title: 'Game <span>paused</span>',
    body: `<p><b>${names}</b> lost connection. The game carries on as soon as they are back. If they are not coming back, replace them with a computer player.</p>`,
    items: [['Keep waiting', () => toast(`Waiting for ${names}`), true], ...missing.map((gu) => [`Replace ${gu.name}`, () => kickGuest(gu)])], // waiting is the default, so a stray press can't remove anyone
  });
  S.overlay.hold = true;
}
export function kickGuest(gu) {
  gu.kicked = true; gu.away = false;
  for (const [pid, x] of S.net.guests) if (x === gu) sendTo(pid, { t: 'end', text: 'The host replaced you with a computer player.' });
  const p = S.game.players[gu.seat];
  p.isHuman = false; p.style = { ...CHARACTERS.Gus.style, skill: 0.7 }; // their chips play on, steadily
  S.cast[gu.seat] = { ...S.cast[gu.seat], isHuman: false, remote: false, tag: 'Computer', voice: 5 };
  ui.noAnim = true; buildSeats(true); render(); ui.noAnim = false;
  if (S.net.waiter?.seat === gu.seat) { const w = S.net.waiter; S.net.waiter = null; w.resolve(null); }
  holdCheck();
}
// A message off the relay. A guest's first message carries their public key and gets ours back; after
// that only messages that decrypt with that guest's key are listened to.
export async function hostRaw(raw) {
  if (!netOn('host') || typeof raw.pid !== 'string' || raw.pid.length > 24) return;
  let e = S.net.keys.get(raw.pid);
  if (raw.k) {
    if (!e) { if (S.net.keys.size >= 40) return; e = { pub: raw.k, key: await sharedKey(S.net.priv, raw.k), last: 0 }; S.net.keys.set(raw.pid, e); }
    else if (e.pub !== raw.k) return; // somebody else trying to take this player's place
    return void S.net.relay.publish(`${S.net.base}/dn/${raw.pid}`, JSON.stringify({ k: S.net.pub }));
  }
  if (!e || !raw.c) return;
  const m = await unseal(e.key, raw);
  if (!(m.q > e.last)) return; // an old message played back
  e.last = m.q;
  hostHears({ ...m, pid: raw.pid });
}
export function hostHears(m) {
  if (!netOn('host') || !m.pid) return;
  let gu = S.net.guests.get(m.pid);
  if (gu?.kicked) return void sendTo(m.pid, { t: 'end', text: 'The host replaced you with a computer player.' });
  if (gu) {
    gu.seen = performance.now();
    if (gu.away && m.t !== 'leave') { gu.away = false; toast(`${gu.name} is back`); sendTo(m.pid, tableFor(gu.seat)); holdCheck(); }
  }
  if (m.t === 'join') {
    if (m.v !== ver() && m.v !== 'dev' && ver() !== 'dev') return void sendTo(m.pid, { t: 'ver', v: ver() }); // a different build would not understand our messages
    if (gu) { if (S.net.started) sendTo(m.pid, tableFor(gu.seat)); }
    else if (S.net.guests.size >= 16) return void sendTo(m.pid, { t: 'full' });
    else if (S.net.resume && !S.net.started) { // a taken-over game: players return to the seat they had
      const p = expected(S.net.resume).find((x) => x.name === cleanName(m.as) && ![...S.net.guests.values()].some((o) => o.seat === x.seat));
      gu = p ? { name: p.name, asked: p.name, seat: p.seat, face: p.face, seen: performance.now(), away: false, kicked: false }
        : { name: 'Spectator', asked: cleanName(m.name), seat: -1, watch: true, seen: performance.now(), away: false, kicked: false };
      S.net.guests.set(m.pid, gu); gu.rank = m.rank;
      tellLobby(); if (S.overlay?.lobby) hostLobby();
      return;
    }
    else if (S.net.started || m.watch || lobbyGuests().length >= 5) { // no seat to give: they watch instead
      gu = { name: 'Spectator', asked: cleanName(m.name), seat: -1, watch: true, seen: performance.now(), away: false, kicked: false }; S.net.guests.set(m.pid, gu);
      if (S.net.started) { toast('Someone is watching'); return void sendTo(m.pid, tableFor(-1)); }
    }
    else { gu = { name: `P${S.net.guests.size + 2}`, seat: S.net.guests.size + 1, seen: performance.now(), away: false, kicked: false }; S.net.guests.set(m.pid, gu); }
    if (!S.net.resume) gu.asked = cleanName(m.name);
    gu.rank = m.rank; gu.face = FACES.includes(m.face) ? m.face : '';
    if (!S.net.started && !S.net.resume && !!m.watch !== !!gu.watch && (m.watch || lobbyGuests().length < 5)) { gu.watch = !!m.watch; gu.seat = gu.watch ? -1 : 0; if (gu.watch) gu.name = 'Spectator'; } // changed their mind in the lobby
    if (!S.net.started) { tellLobby(); if (S.overlay?.lobby) hostLobby(S.overlay.focus); }
  } else if (m.t === 'act' && gu && S.net.waiter && S.net.waiter.seat === gu.seat && m.stamp === stampOf(S.game)) {
    const w = S.net.waiter; S.net.waiter = null; w.resolve(m.a);
  } else if (m.t === 'chat' && gu && S.net.started && performance.now() - (gu.lastChat || 0) > 1500) { // show it here and pass it on to everyone else
    gu.lastChat = performance.now();
    const text = m.key ? EMOTES.find((e) => e[3] === m.key)?.[2] : cleanChat(m.text);
    if (!text) return;
    const who = gu.watch ? gu.asked || 'Spectator' : ''; // a spectator has no seat to speak from, so their name goes with it
    showChat(gu.seat, text, who);
    for (const [pid, x] of S.net.guests) if (x !== gu && !x.kicked && !x.away) sendTo(pid, { t: 'e', k: 'chat', seat: gu.seat, text, who });
  } else if (m.t === 'rebuy' && gu && !gu.watch && S.net.started) {
    S.net.rebuyAns[S.game.players[gu.seat].name] = !!m.yes;
  } else if (m.t === 'seat' && gu && gu.watch && S.net.started) {
    gu.wantSeat = true;
  } else if (m.t === 'leave' && gu) setAway(gu, m.pid);
}
export function startOnline() {
  const c = S.net.cfg;
  S.mode = 'net'; S.bossMode = false; S.perks = {}; S.table = 0; S.aiRng = Math.random; S.ME = 0; ui.hidden = false;
  S.twist = c.twist;
  if (S.net.resume) { // a taken-over game: the same seats and stacks, with the computer playing anyone who did not follow
    const r = S.net.resume, at = (seat) => [...S.net.guests.values()].find((gu) => gu.seat === seat && !gu.watch && !gu.kicked);
    for (const gu of S.net.guests.values()) { gu.away = false; gu.seen = performance.now(); }
    S.cast = r.players.map((p, seat) => {
      const gu = at(seat);
      if (seat === 0) return { name: p.name, face: myFace(), badge: '1', isHuman: true, tag: myRank().name, color: p.color || PASS_COLORS[0] };
      if (gu) return { name: p.name, face: gu.face || p.face, badge: String(seat + 1), isHuman: true, remote: true, tag: rankName(gu.rank), color: p.color || PASS_COLORS[seat % 4] };
      if (CHARACTERS[p.name] && !p.isHuman) return { name: p.name, ...CHARACTERS[p.name], style: { ...CHARACTERS[p.name].style, skill: 0.7 } };
      return { name: p.name, face: p.face, badge: String(seat + 1), tag: 'Computer', voice: 5, color: p.color, style: { ...CHARACTERS.Gus.style, skill: 0.7 } };
    });
    S.game = new Game({ players: S.cast, handsPerLevel: c.twist === 'turbo' ? 2 : 6, chips: 1000, variant: c.variant });
    S.game.players.forEach((p, seat) => { p.chips = r.players[seat].chips; p.out = p.chips <= 0; });
    S.game.dealer = r.dealer; S.game.handNo = r.handNo;
    S.net.resume = null;
  } else {
    // seats are renumbered in case someone left the lobby
    lobbyGuests().forEach((gu, i) => { gu.seat = i + 1; gu.away = false; gu.seen = performance.now(); });
    const names = seatNames();
    const people = [{ name: names[0], face: myFace(), badge: '1', isHuman: true, tag: myRank().name, color: PASS_COLORS[0] },
      ...lobbyGuests().map((gu, i) => ({ name: gu.name, face: gu.face, badge: String(i + 2), isHuman: true, remote: true, tag: rankName(gu.rank), color: PASS_COLORS[(i + 1) % 4] }))];
    const bots = NET_BOTS.slice(0, Math.max(0, c.seats - people.length)).map((name) => ({ name, ...CHARACTERS[name], style: { ...CHARACTERS[name].style, skill: 0.7 } }));
    S.cast = [...people, ...bots];
    S.game = new Game({ players: S.cast, handsPerLevel: c.twist === 'turbo' ? 2 : 6, chips: startStack(c), variant: c.variant });
  }
  setVariantLook(c.variant);
  setBackLook(c.back);
  S.net.busts = []; S.net.rebought = {}; S.net.declined = new Set(); S.net.rebuyAns = {}; S.net.started = true; S.net.turn = 0; S.net.hold = null; S.clock = null;
  setTable(VENUES[c.venue][1], kindOf(c.venue), VENUES[c.venue][0]);
  audio.setVenue(c.venue);
  buildSeats();
  $('msg').textContent = ''; $('msg').classList.remove('show');
  $('pot').hidden = true;
  ui.mode = 'wait'; ui.resolve = null;
  S.lastBB = 0; S.fast = false; audio.hush(false); S.squeeze = null; ui.squeezed = true;
  S.runId++;
  renderActions();
  run();
}
// What one seat is allowed to see: the whole table, with other players' cards blanked until they are shown.
// Names the exact decision a player is facing. An answer is only accepted for the decision it was given for,
// however many times the table or the answer gets sent.
export const stampOf = (g) => `${g.handNo}|${g.street}|${g.toAct}|${g.players.map((p) => p.total).join(',')}`;
// If the host is lost for good, one player may take over: the seated guest in the lowest seat.
const deputySeat = () => Math.min(...[...S.net.guests.values()].filter((gu) => !gu.watch && !gu.kicked && !gu.away && S.game && !S.game.players[gu.seat]?.out).map((gu) => gu.seat), 99);
export function tableFor(seat) {
  const g = S.game, c = S.net.cfg;
  return {
    t: 's', me: Math.max(0, seat), watch: seat < 0, rs: S.net.rs, cfg: c, deputy: seat >= 0 && seat === deputySeat(), watching: watchers().length, n: ++S.net.n, stamp: stampOf(g), settled: S.settled, held: !!S.net.hold,
    look: { mat: VENUES[c.venue][1], venue: c.venue, back: c.back },
    clock: S.clock ? { seat: S.clock.seat, left: Math.max(0, S.clock.end - performance.now()), total: S.clock.total } : null,
    handNo: g.handNo, dealer: g.dealer, sb: g.sb, bb: g.bb, street: g.street, stage: g.stage, toAct: g.toAct, board: g.board,
    currentBet: g.currentBet, variant: g.variant, showCards: g.showCards, runout: g.runout, result: g.result,
    legal: g.stage === 'betting' && g.toAct === seat ? g.legal(seat) : null,
    cast: S.cast.map((x) => ({ name: x.name, tag: x.tag, color: x.color, badge: x.badge, face: x.face, isHuman: !!x.isHuman, voice: x.voice })),
    players: g.players.map((p) => ({
      name: p.name, isHuman: p.isHuman, chips: p.chips, bet: p.bet, total: p.total, folded: p.folded, allIn: p.allIn, out: p.out,
      lastAction: p.lastAction, won: p.won, handName: p.handName, score: g.showCards && !p.folded ? p.score : 0,
      cards: p.seat === seat || (g.showCards && !p.folded) ? p.cards : p.cards.map(() => -1),
    })),
  };
}
export function netBroadcast() { for (const [pid, gu] of S.net.guests) if (!gu.kicked && !gu.away) sendTo(pid, tableFor(gu.seat)); }
export function netEffect(k, extra = {}) { if (netOn('host') && S.net.started && !S.replaying) for (const [pid, gu] of S.net.guests) if (!gu.kicked && !gu.away) sendTo(pid, { t: 'e', k, ...extra }); }
// Wait for a guest to act. The turn clock (see clockTick), a kick, or their own answer ends the wait;
// running out of time means a check if it is free, otherwise a fold.
export function remoteAction(p) {
  return new Promise((resolve) => { S.net.waiter = { seat: p.seat, resolve }; }).then((a) => {
    const ok = a && ['fold', 'check', 'call', 'raise'].includes(a.type);
    if (ok) return { type: a.type, amount: Number(a.amount) || 0 };
    if (!p.isHuman) return decide(S.game, p.seat, S.aiRng, humanProfile()); // just replaced by a computer player
    return { type: S.game.legal(p.seat).canCheck ? 'check' : 'fold' };
  });
}
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`); // text from the relay, made safe to show
// How a finished game and the room's running standings are shown. Names arrive over the relay, so they are cleaned again here.
const orderHtml = (order) => `<p class="who">${(order || []).map((n, i) => `${i + 1}. <b>${cleanName(n)}</b>`).join(' &middot; ')}</p>`;
const standHtml = (st) => (st?.games ? `<p class="stand">This room, ${st.games} game${st.games === 1 ? '' : 's'}: ${st.rows.map((r) => `<b>${cleanName(r.name)}</b> ${+r.points || 0}${r.wins ? ` (${+r.wins} win${r.wins === 1 ? '' : 's'})` : ''}`).join(' &middot; ')}</p>` : '');
const standing = () => (S.net?.session ? { games: S.net.session.games, rows: table(S.net.session).slice(0, 8) } : null);
const LOG_KEY = 'padpoker.online';
const gameLog = () => { try { return readLog(localStorage.getItem(LOG_KEY)); } catch { return []; } };
function logGame(order, me, hands) { try { localStorage.setItem(LOG_KEY, JSON.stringify(addLog(gameLog(), { at: Date.now(), order, me, hands }))); } catch { /* private mode */ } }
// Between hands on the host: people who are out may buy back in if the host allowed it, and spectators
// who asked for a seat are given one. Both happen here so they never change a hand in progress.
export async function netBetweenHands(g) {
  const c = S.net.cfg, n = S.net;
  if (c.rebuys) {
    const bust = g.players.filter((p) => p.isHuman && p.chips === 0 && (n.rebought[p.name] || 0) < c.rebuys && !n.declined.has(p.name));
    if (bust.length) {
      n.rebuyAns = {};
      for (const p of bust) {
        const left = c.rebuys > 9 ? 0 : c.rebuys - (n.rebought[p.name] || 0); // 0: no limit to mention
        if (p.seat === S.ME) offerRebuy(left, (yes) => { n.rebuyAns[p.name] = yes; });
        else for (const [pid, gu] of n.guests) if (gu.seat === p.seat && !gu.watch && !gu.kicked) sendTo(pid, { t: 'offer', left });
      }
      const t0 = performance.now();
      while (S.net === n && performance.now() - t0 < 12000 && bust.some((p) => n.rebuyAns[p.name] === undefined)) await tick(200);
      if (S.net !== n) return;
      if (S.overlay?.offer) closeOverlay();
      for (const p of bust) {
        if (!n.rebuyAns[p.name]) { n.declined.add(p.name); continue; }
        p.chips = startStack(c); n.rebought[p.name] = (n.rebought[p.name] || 0) + 1;
        const text = `${p.name} buys back in`; fx.banner(text, 'info'); audio.chips(5, 0, 4); netEffect('banner', { text });
      }
    }
  }
  noteBusts(g);
  let seated = false;
  for (const gu of n.guests.values()) {
    if (!gu.wantSeat || !gu.watch || gu.kicked) continue;
    gu.wantSeat = false;
    let seat = g.players.findIndex((p) => !p.isHuman && p.chips > 0); // take over a computer player, stack and all
    if (seat < 0 && g.players.length < 6) { // or pull up a chair with a fresh stack
      seat = g.players.length;
      g.players.push({ seat, name: '', isHuman: true, style: undefined, chips: startStack(c), cards: [], bet: 0, total: 0, folded: true, allIn: false, acted: false, out: false, lastAction: '', won: 0, handName: '' });
      S.cast.push({});
    }
    if (seat < 0) { for (const [pid, x] of n.guests) if (x === gu) sendTo(pid, { t: 'e', k: 'banner', text: 'No seat is free' }); continue; }
    const others = new Set(g.players.filter((p, i) => i !== seat).map((p) => p.name.toLowerCase()));
    const name = gu.asked && !others.has(gu.asked.toLowerCase()) && !NET_BOTS.includes(gu.asked) ? gu.asked : `P${seat + 1}`;
    const was = g.players[seat].name;
    Object.assign(g.players[seat], { name, isHuman: true });
    S.cast[seat] = { name, face: gu.face, badge: String(seat + 1), isHuman: true, remote: true, tag: rankName(gu.rank), color: PASS_COLORS[seat % 4] };
    Object.assign(gu, { watch: false, seat, name, away: false });
    const text = was ? `${name} takes ${was}'s seat` : `${name} sits down`; fx.banner(text, 'info'); netEffect('banner', { text });
    seated = true;
  }
  if (seated) { ui.noAnim = true; buildSeats(true); render(); ui.noAnim = false; }
}
// You are out and the host allows rebuys: buy back in, or watch the rest.
function offerRebuy(left, answer) {
  showOverlay({
    title: 'You are <span>out</span>', body: `<p>Buy back in with a fresh stack${left ? ` (${left} rebuy${left === 1 ? '' : 's'} left)` : ''}, or sit out and watch? The table waits a few seconds.</p>`,
    items: [[`${glyph('A')}Buy back in`, () => answer(true)], ['Sit out', () => answer(false)]],
  });
  S.overlay.offer = true;
}
// A spectator asks the host for a seat; it is given between hands.
export function askSeat() {
  if (!netOn('guest') || !S.net.watch) return;
  sendUp({ t: 'seat' });
  toast('Asked for a seat. You join at the next hand if there is room.');
}
// After each hand on the host: anyone who has just lost their last chip is written down, in order.
export function noteBusts(g) { for (const p of g.players) if (p.chips === 0 && !S.net.busts.includes(p.name)) S.net.busts.push(p.name); }
export function netDone() {
  const g = S.game, w = g.players.find((p) => p.chips > 0);
  noteBusts(g);
  const order = placings(w.name, S.net.busts);
  S.net.session = addGame(S.net.session, order);
  const text = `${w.name} wins the table after ${g.handNo} hands.`;
  for (const [pid, gu] of S.net.guests) if (!gu.kicked) sendTo(pid, { t: 'end', text, again: true, won: gu.seat === w.seat, order, stand: standing(), hands: g.handNo });
  stats.online++; if (w.seat === S.ME) stats.onlineWins++; saveStats(); // counts towards your rank
  logGame(order, g.players[S.ME].name, g.handNo);
  audio.musicLevel(0); audio.fanfare(); fx.chipRain(40);
  S.net.started = false; S.clock = null;
  showOverlay({ title: `${w.name} <span>wins!</span>`, body: `<p>${text}</p>${orderHtml(order)}${standHtml(standing())}`, items: [[`${glyph('A')}Back to the room`, () => { hostLobby(); tellLobby(); }], ['Close room', () => { leaveOnline(); startScreen(); }]] });
}
// The games this device has taken part in: who won, where you came, and wins by name.
function historyScreen() {
  const log = gameLog(), wins = tally(log);
  const day = (at) => new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const rows = log.slice(0, 8).map((x) => `<tr><td>${day(x.at)}</td><td><b>${x.order[0]}</b> won${x.hands ? ` in ${x.hands} hands` : ''}</td><td>${placeOf(x, x.me) ? `you came ${['', '1st', '2nd', '3rd', '4th', '5th', '6th'][placeOf(x, x.me)]} of ${x.order.length}` : 'you watched'}</td></tr>`).join('');
  showOverlay({
    title: 'Online <span>history</span>', wide: true, closable: true, onClose: onlineMenu,
    body: log.length ? `<p>Wins across your last ${log.length} game${log.length === 1 ? '' : 's'}: ${wins.map((r) => `<b>${r.name}</b> ${r.wins}`).join(' &middot; ')}</p><table class="log">${rows}</table>` : '<p>No online games finished on this device yet.</p>',
    items: [[`${glyph('B')}Back`, onlineMenu]],
  });
}

// The turn clock, on every device: shrink the bar on whoever is acting, tick faster as time runs
// out, and on the host act for anyone who lets it reach zero.
setInterval(() => {
  const live = S.mode === 'net' && S.clock && S.game && S.game.stage === 'betting' && S.game.toAct === S.clock.seat;
  S.seatEls.forEach((el, i) => { const c = el?.querySelector('.clock'); if (!c) return; const on = !!live && i === S.clock.seat; c.classList.toggle('on', on); if (!on) c.classList.remove('hot'); });
  if (!live) { if (S.clock && S.game && (S.game.stage !== 'betting' || S.game.toAct !== S.clock.seat)) S.clock = null; return; }
  if (S.net?.hold || S.clock.frozen) return;
  const now = performance.now(), left = S.clock.end - now;
  const bar = S.seatEls[S.clock.seat]?.querySelector('.clock');
  if (bar) {
    bar.firstChild.style.width = `${Math.max(0, Math.min(1, left / S.clock.total)) * 100}%`;
    bar.classList.toggle('hot', left <= 10000);
    bar.lastChild.textContent = left <= 10000 ? Math.max(0, Math.ceil(left / 1000)) : '';
  }
  // ticking: once a second in the last ten, twice in the last five, four times in the last two
  const every = left > 10000 ? 0 : left > 5000 ? 1000 : left > 2000 ? 500 : 250;
  if (every && now - S.clock.lastTick >= every - 20) {
    S.clock.lastTick = now;
    const urgency = 1 - Math.max(0, left) / 10000;
    if (S.clock.seat === S.ME) { audio.clockTick(urgency, 1); fx.rumble(0.2 + urgency * 0.6, 0.3 + urgency * 0.7, 40 + urgency * 60); }
    else if (left <= 5000) audio.clockTick(urgency, 0.35);
  }
  if (netOn('host') && left <= 0) { // time is up
    if (S.clock.seat === S.ME) {
      if (ui.mode === 'squeeze') { finishSqueeze(); S.clock.end = now + 400; return; } // show the cards, then act
      if (ui.mode === 'actions' || ui.mode === 'raise') { S.clock = null; finish({ type: S.game.legal(S.ME).canCheck ? 'check' : 'fold' }); }
    } else if (S.net.waiter?.seat === S.clock.seat) { const w = S.net.waiter; S.net.waiter = null; S.clock = null; w.resolve(null); }
  }
}, 200);

// ----- joining -----
export function joinEntry(code = [1, 0, 0, 0, 0], pos = 0) {
  const draw = () => {
    const el = $('code-boxes');
    if (el) el.innerHTML = code.map((d, i) => `<button class="${i === pos ? 'sel' : ''}" data-i="${i}">${d}</button>`).join('');
  };
  const bump = (d) => { const lo = pos === 0 ? 1 : 0, hi = pos === 0 ? 3 : 9, n = hi - lo + 1; code[pos] = lo + ((code[pos] - lo + d + n) % n); audio.tick(); draw(); };
  showOverlay({
    title: 'Join a <span>game</span>', closable: true, onClose: onlineMenu,
    body: `<p>Enter the host's five-digit room code. Tap a digit to change it, or use the D-pad: left and right to move, up and down to change.</p><div id="code-boxes" class="code"></div>`,
    items: [[`${glyph('A')}Join`, () => joinOnline(code.join(''))], [`${glyph('B')}Back`, onlineMenu]],
  });
  S.overlay.onKey = (b) => {
    if (b === 'left' || b === 'right') { pos = (pos + (b === 'left' ? 4 : 1)) % 5; audio.tick(); draw(); return true; }
    if (b === 'up' || b === 'down') { bump(b === 'up' ? 1 : -1); return true; }
    return false;
  };
  draw();
  $('code-boxes').onclick = (e) => { const i = /** @type {any} */ (e.target).dataset?.i; if (i !== undefined) { pos = +i; bump(1); } };
}
export async function joinOnline(code, as = '') { // as: the name you had at a table that has moved to a new host
  if (!/^[1-9]\d{4}$/.test(code)) return joinEntry();
  if (!canEncrypt()) return noCrypto();
  if (!as && askNameFirst(() => joinOnline(code))) return;
  waiting('Joining <span>room</span>', `Looking for room ${code}…`, onlineMenu);
  let conn;
  try { conn = await connectAny(+code[0] - 1); } catch { return showOverlay({ title: 'No <span>connection</span>', body: '<p>Could not reach the relay for that room. Check the code and your connection.</p>', items: [['Try again', () => joinOnline(code)], [`${glyph('B')}Back`, onlineMenu]] }); }
  if (!S.overlay || S.net) return conn.relay.close();
  // Your seat is remembered on this device, so reopening the link or the app puts you back in it.
  let pid = Math.random().toString(36).slice(2, 12), key = null, mine = null;
  try { const kept = JSON.parse(localStorage.getItem('padpoker.seat')); if (kept?.code === code && kept.key) { key = await importKey(kept.key); pid = kept.pid; } } catch { key = null; }
  if (!key) mine = await newKeys(); // first time in this room: swap keys with the host
  if (!S.overlay || S.net) return conn.relay.close();
  S.net = { role: 'guest', relay: conn.relay, code, base: `padpoker2/${code}`, pid, key, mine, kept: !!key, hostPub: '', outq: Promise.resolve(), inq: Promise.resolve(), seen: false, lastN: 0, sent: null, tries: 0, hostSeen: performance.now(), lost: false, held: false, as };
  S.net.relay.subscribe(`${S.net.base}/dn/${pid}`);
  S.net.relay.subscribe(`${S.net.base}/sos`);
  S.net.relay.onMessage = (topic, text) => { const n = S.net; n.inq = n.inq.then(() => (S.net !== n ? 0 : topic.endsWith('/sos') ? guestSos(JSON.parse(text)) : guestRaw(JSON.parse(text)))).catch(() => { /* not ours, or not readable */ }); };
  S.net.relay.onClose = async () => { // one quiet attempt to get back in
    if (!netOn('guest')) return;
    toast('Connection lost. Reconnecting…');
    try { const c = await connectAny(+code[0] - 1); if (!netOn('guest')) return c.relay.close(); c.relay.onMessage = S.net.relay.onMessage; c.relay.onClose = S.net.relay.onClose; S.net.relay = c.relay; S.net.relay.subscribe(`${S.net.base}/dn/${pid}`); S.net.relay.subscribe(`${S.net.base}/sos`); sendUp({ t: 'join', name: myName(), face: myFace(), watch: !!S.net.wantWatch, rank: myRank().index, as: S.net.as, v: ver() }); }
    catch { leaveOnline(false); showOverlay({ title: 'Connection <span>lost</span>', body: '<p>Could not get back to the room. Open the link or enter the code again to return to your seat.</p>', items: [['OK', startScreen]] }); }
  };
  const knock = () => { // keep asking until the host answers; the relay does not store messages
    if (!netOn('guest') || S.net.seen) return clearInterval(S.net.joiner);
    if (S.net.kept && S.net.tries === 4) { // the room no longer knows our old seat: come in as a new player
      try { localStorage.removeItem('padpoker.seat'); } catch { /* private mode */ }
      clearInterval(S.net.joiner); leaveOnline(false); waiting('Joining <span>room</span>', `Looking for room ${code}\u2026`, onlineMenu); return joinOnline(code);
    }
    if (++S.net.tries > 8) { clearInterval(S.net.joiner); leaveOnline(false); return showOverlay({ title: 'No such <span>room</span>', body: `<p>Nobody answered in room ${code}. Check the code with the host.</p>`, items: [['Try again', () => joinEntry(code.split('').map(Number))], [`${glyph('B')}Back`, onlineMenu]] }); }
    if (S.net.key) sendUp({ t: 'join', name: myName(), face: myFace(), watch: !!S.net.wantWatch, rank: myRank().index, as: S.net.as, v: ver() });
    else S.net.relay.publish(`${S.net.base}/up`, JSON.stringify({ pid, k: S.net.mine.pub }));
  };
  S.net.again = setInterval(() => { // keep sending our answer until the host's table shows it arrived
    if (netOn('guest') && S.net.sent && performance.now() - S.net.sent.at > 1200) { S.net.sent.at = performance.now(); sendUp({ t: 'act', stamp: S.net.sent.stamp, a: S.net.sent.a }); }
  }, 400);
  S.net.joiner = setInterval(knock, 1500);
  setTimeout(knock, 250);
  S.net.beat = setInterval(() => { // say we are still here, and notice if the host has gone quiet
    if (!netOn('guest') || !S.net.seen) return;
    sendUp({ t: 'hb' });
    if (S.mode === 'net' && !S.net.lost && performance.now() - S.net.hostSeen > AWAY_AFTER + 3000) {
      S.net.lost = true;
      if (S.clock) S.clock.frozen = true;
      const can = S.net.deputy && !S.net.watch && S.net.rs && S.game?.stage; // one player is able to carry the game on
      showOverlay({
        title: 'Host <span>lost</span>',
        body: `<p>Lost contact with the host. Waiting for them to come back…</p><p>${can ? 'If they are gone for good you can take over: the hand in progress is dealt again with bets returned, and the others follow you automatically.' : 'If they are gone for good, another player can take over as host and you will follow automatically.'}</p>`,
        items: [...(can ? [['Take over as host', takeOver]] : []), ['Leave game', exitToMenu]],
      });
      S.overlay.hold = true;
    }
  }, 2500);
}
export async function guestRaw(raw) {
  if (!netOn('guest')) return;
  if (raw.k) { // the host's public key
    if (S.net.hostPub && raw.k !== S.net.hostPub) { // two different hosts answered: someone is interfering
      leaveOnline(false);
      return showOverlay({ title: 'Not <span>safe</span>', body: '<p>Someone else answered as the host of this room, so the game cannot be trusted. Ask the host to open a new room.</p>', items: [['OK', onlineMenu]] });
    }
    if (S.net.key || !S.net.mine) return;
    S.net.hostPub = raw.k;
    S.net.key = await sharedKey(S.net.mine.priv, raw.k);
    try { localStorage.setItem('padpoker.seat', JSON.stringify({ code: S.net.code, pid: S.net.pid, key: await exportKey(S.net.key) })); } catch { /* private mode */ }
    return sendUp({ t: 'join', name: myName(), face: myFace(), watch: !!S.net.wantWatch, rank: myRank().index, as: S.net.as, v: ver() });
  }
  if (!S.net.key || !raw.c) return;
  guestHears(await unseal(S.net.key, raw));
}
export function guestHears(m) {
  if (!netOn('guest')) return;
  S.net.seen = true; S.net.hostSeen = performance.now();
  if (S.net.lost) { S.net.lost = false; if (S.clock) S.clock.frozen = S.net.held; if (S.overlay?.hold && !S.net.held) closeOverlay(); }
  if (m.t === 'hb') return;
  if (m.t === 'ver') {
    const mineV = ver();
    try { localStorage.removeItem('padpoker.seat'); } catch { /* private mode */ }
    leaveOnline(false);
    return showOverlay({ title: 'Different <span>version</span>', body: `<p>The host is on version <b>${m.v}</b> and this device is on <b>${mineV}</b>. Everyone needs the same one: fully close the game and open it again, on both devices if needed, then rejoin.</p>`, items: [['Reload now', () => location.reload()], [`${glyph('B')}Back`, onlineMenu]] });
  }
  if (m.t === 'full') { leaveOnline(false); return showOverlay({ title: 'Room <span>full</span>', body: '<p>That game has already started or has no seats left.</p>', items: [['OK', onlineMenu]] }); }
  if (m.t === 'lobby') {
    if (!m.again) { // an old lobby message arriving late must not cover a game that has started
      if (m.n <= S.net.lastN) return;
      S.net.lastN = m.n;
    }
    S.net.lobbyMsg = m;
    if (S.overlay?.naming) return; // typing a name: the lobby is redrawn afterwards
    showOverlay({
      title: `Room <span>${S.net.code}</span>`,
      body: `<p>${m.watch ? 'You are <b>watching</b>: you will see the table, and cards only at showdown.' : `You are <b>${m.you}</b>.`} Waiting for the host to start.</p><p class="who">At the table: <b>${m.names.join('</b>, <b>')}</b></p><p>${m.info || ''}${m.watching ? ` &middot; ${m.watching} watching` : ''}</p>${standHtml(m.stand)}<p class="ver">Version ${m.v || ver()}</p>`,
      items: [['Name and face', () => nameEntry(() => { if (!netOn('guest')) return; sendUp({ t: 'join', name: myName(), face: myFace(), watch: !!S.net.wantWatch, rank: myRank().index, as: S.net.as, v: ver() }); if (S.mode !== 'net' && S.net.lobbyMsg) guestHears({ ...S.net.lobbyMsg, again: true }); })], [m.watch ? 'Take a seat' : 'Watch only', () => { S.net.wantWatch = !m.watch; sendUp({ t: 'join', name: myName(), face: myFace(), watch: !!S.net.wantWatch, rank: myRank().index, as: S.net.as, v: ver() }); }], ['Leave', onlineMenu]],
    });
    S.overlay.lobby = true;
    return;
  }
  if (m.t === 'offer') return offerRebuy(+m.left || 0, (yes) => sendUp({ t: 'rebuy', yes }));
  if (m.t === 'hold') return guestHold(true, m.names);
  if (m.t === 'go') return guestHold(false);
  if (m.t === 'end') {
    audio.musicLevel(0); S.clock = null;
    const stay = m.again; // the host may deal again: stay connected and wait
    if (stay && !S.net.watch) { stats.online++; if (m.won) stats.onlineWins++; saveStats(); } // a finished game counts towards your rank
    if (!stay) { try { localStorage.removeItem('padpoker.seat'); } catch { /* private mode */ } leaveOnline(false); }
    if (stay && Array.isArray(m.order)) logGame(m.order.map(cleanName), S.net.watch ? '' : S.game?.players[S.ME]?.name, m.hands);
    return showOverlay({ title: 'Game <span>over</span>', body: `<p>${esc(m.text)}</p>${Array.isArray(m.order) ? orderHtml(m.order) : ''}${standHtml(m.stand)}${stay ? '<p>Stay here if the host is dealing again.</p>' : ''}`, items: [[stay ? 'Leave' : 'OK', () => { leaveOnline(); startScreen(); }]] });
  }
  if (m.t === 'e' && S.game) {
    if (m.k === 'deal') { audio.tension(false); audio.newHand(); audio.musicLevel(1); ui.scatter = 0; fx.shuffle($('deck')); audio.shuffle(); S.game.players.forEach((p) => setMood(p.seat, 'idle')); }
    else if (m.k === 'act') actionFx(S.game.players[m.seat], m.pot);
    else if (m.k === 'collect') collectBets(tick);
    else if (m.k === 'over') handOverFx();
    else if (m.k === 'say') say(S.game.players[m.seat], m.moment);
    else if (m.k === 'chat') showChat(m.seat, cleanChat(m.text), cleanName(m.who));
    else if (m.k === 'banner') { fx.banner(m.text, 'info'); audio.chips(5, 0, 4); }
    return;
  }
  if (m.t === 's') showTable(m);
}
// Pausing and resuming on a guest. The host says so directly, and every table it sends repeats it,
// so a lost message cannot leave a guest paused while the game carries on (or the other way round).
function guestHold(on, names = 'Someone') {
  if (on === S.net.held && on === !!S.overlay?.hold) return;
  S.net.held = on;
  if (S.clock) S.clock.frozen = on;
  if (!on) { if (S.overlay?.hold) closeOverlay(); return; }
  showOverlay({ title: 'Game <span>paused</span>', body: `<p><b>${names}</b> lost connection. The game carries on when they are back, or when the host replaces them with a computer player.</p>`, items: [['Leave game', exitToMenu]] });
  S.overlay.hold = true;
}
// Become the host of a game whose host has gone. Everyone still at the old room is told the new room's
// code in a message only people from that room can make or read, and they follow by themselves.
async function takeOver() {
  const old = S.net, g = S.game;
  if (!netOn('guest') || !g || !old.rs) return;
  const state = handover({ stage: g.stage, dealer: g.dealer, handNo: g.handNo, players: g.players.map((p, seat) => ({ name: p.name, chips: p.chips, total: p.total, isHuman: !!p.isHuman, face: S.cast[seat]?.face, color: S.cast[seat]?.color })) }, S.ME);
  const cfg = { ...g.cfg }, rs = old.rs, oldCode = old.code;
  try { localStorage.removeItem('padpoker.seat'); } catch { /* private mode */ }
  leaveOnline(false);
  await hostOnline({ state, cfg });
  if (!netOn('host')) return; // could not open a room
  const newCode = S.net.code;
  try {
    const c = await connectAny(+oldCode[0] - 1), key = await importKey(rs);
    let sent = 0;
    const say = async () => { if (++sent > 25) { clearInterval(t); return c.relay.close(); } c.relay.publish(`padpoker2/${oldCode}/sos`, JSON.stringify(await seal(key, { t: 'moved', code: newCode }))); };
    const t = setInterval(say, 2000); say();
  } catch { toast(`Could not reach the others. Give them the new code: ${newCode}`); }
}
// A sealed notice on the old room's shared topic: the game has moved. Only honoured once the host is really gone.
async function guestSos(raw) {
  if (!netOn('guest') || !S.net.rs || !S.net.lost || !raw?.c) return;
  const m = await unseal(await importKey(S.net.rs), raw);
  if (m.t !== 'moved' || !/^[1-9]\d{4}$/.test(m.code) || m.code === S.net.code) return;
  const as = S.net.watch ? '' : S.game?.players[S.ME]?.name || '';
  try { localStorage.removeItem('padpoker.seat'); } catch { /* private mode */ }
  leaveOnline(false);
  toast('A player has taken over as host. Following…');
  waiting('Moving <span>table</span>', 'Joining the new host…', onlineMenu);
  joinOnline(m.code, as || ' ');
}
// A guest's stand-in for the game object: the same fields the renderer reads, filled from the host's picture.
export function showTable(m) {
  if (m.n <= S.net.lastN) return; // an older picture that arrived late
  S.net.lastN = m.n;
  if (S.net.sent && S.net.sent.stamp !== m.stamp) S.net.sent = null; // the host has our answer
  const fresh = S.mode !== 'net' || !S.game || S.game.players.length !== m.players.length || m.handNo < S.game.handNo || !!m.watch !== !!S.net.watch
    || m.cast.some((x, i) => x.isHuman !== S.cast[i]?.isHuman); // someone was replaced by a computer player
  S.mode = 'net'; S.ME = m.me; S.settled = m.settled; S.cast = m.cast; S.peekSeat = -1;
  ui.hidden = !!m.watch; // a spectator sits behind the host's chair and sees no cards until a showdown
  S.game = {
    ...m, deck: [], dealt: null,
    players: m.players.map((p, seat) => ({ ...p, seat, style: {} })),
    get pot() { return this.players.reduce((sum, p) => sum + p.total, 0); },
    legal: () => m.legal || { toCall: 0, canCheck: true, canRaise: false, minTo: 0, maxTo: 0 },
  };
  S.clock = m.clock ? { seat: m.clock.seat, end: performance.now() + m.clock.left, total: m.clock.total, lastTick: S.clock?.seat === m.clock.seat ? S.clock.lastTick : 0, frozen: m.held } : null;
  S.net.watch = !!m.watch; S.net.rs = m.rs; S.net.deputy = !!m.deputy;
  if (fresh) {
    const mid = S.game.handNo > 0 && !S.overlay?.lobby; // rejoining a table in progress: no dealing animation
    if (S.overlay && !S.overlay.hold) closeOverlay();
    setVariantLook(m.variant);
    setBackLook(m.look.back);
    setTable(m.look.mat, kindOf(+m.look.venue || 0), VENUES[((+m.look.venue || 0) % VENUES.length + VENUES.length) % VENUES.length][0]);
    audio.setVenue(m.look.venue);
    S.squeeze = null; ui.squeezed = true; ui.mode = 'wait'; ui.resolve = null;
    ui.noAnim = mid; buildSeats(); render(); ui.noAnim = false;
  }
  if (m.board.length >= 3) audio.musicLevel(2);
  if (m.stage === 'handOver' && !ui.squeezed) finishSqueeze();
  render();
  if (S.overlay?.offer && m.stage === 'betting') closeOverlay(); // the rebuy window has passed
  if (!!m.held !== !!S.net.held) guestHold(!!m.held);
  const myTurn = !!m.legal;
  if (!myTurn && ['actions', 'raise', 'squeeze'].includes(ui.mode)) { if (ui.mode === 'squeeze') { ui.mode = 'wait'; renderActions(); } else finish(); } // the host moved on without us
  if (myTurn && ui.mode === 'wait' && !S.net.sent) guestTurn();
}
export async function guestTurn() {
  if (ui.mode !== 'wait') return; // already being asked
  audio.turn(); fx.haptic('turn');
  await waitForSqueeze();
  if (!netOn('guest')) return;
  if (S.game.stage !== 'betting' || S.game.toAct !== S.ME || ui.mode !== 'wait') return;
  const a = await prompt('actions');
  if (!a || !netOn('guest') || S.game.toAct !== S.ME || S.game.stage !== 'betting') return;
  S.net.sent = { stamp: S.game.stamp, a, at: performance.now() };
  sendUp({ t: 'act', stamp: S.game.stamp, a });
}

/* table: see state.js */
