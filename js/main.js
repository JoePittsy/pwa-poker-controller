import { Game } from './engine.js';
import { decide, runoutOdds, equity } from './ai.js';
import { startInput, upAmount } from './input.js';
import { RANKS, SUITS, describe, scoreHand, bestFiveOf } from './cards.js';
import * as audio from './audio.js';
import * as fx from './fx.js';
import { line } from './banter.js';
import { face, FACES } from './faces.js';
import { shareCard } from './share.js';
import { connectAny, canEncrypt, newKeys, sharedKey, exportKey, importKey, seal, unseal } from './net.js';
import { STICKERS, has as hasSticker, count as stickerCount, unlock as unlockSticker } from './stickers.js';

const YOU = { name: 'You', isHuman: true };
const CHARACTERS = {
  Mav: { tag: 'Wild', color: 'var(--red)', voice: 1, style: { loose: 0.8, aggr: 0.8, tell: 'fastBluff' } },
  Dot: { tag: 'Careful', color: 'var(--mint)', voice: 2, style: { loose: 0.25, aggr: 0.3, tell: 'slowBluff' } },
  Rex: { tag: 'Shark', color: 'var(--yellow)', voice: 3, style: { loose: 0.35, aggr: 0.85, tell: 'bigBluff' } },
  Ivy: { tag: 'Sticky', color: 'var(--pink)', voice: 4, style: { loose: 0.75, aggr: 0.3, tell: 'slowStrong' } },
  Gus: { tag: 'Steady', color: 'var(--sky)', voice: 5, style: { loose: 0.5, aggr: 0.55 } },
  // newcomers: they start turning up from Table 4
  Zed: { tag: 'Maniac', color: '#ff8a3d', voice: 9, style: { loose: 0.95, aggr: 0.95 } },
  Flo: { tag: 'Nit', color: '#c7e36a', voice: 10, style: { loose: 0.1, aggr: 0.5, tell: 'slowStrong' } },
  Kit: { tag: 'Trickster', color: '#7ee0ff', voice: 11, style: { loose: 0.55, aggr: 0.6, tell: 'fastStrong' } },
  Bea: { tag: 'Banker', color: '#e6b8ff', voice: 12, style: { loose: 0.4, aggr: 0.4, tell: 'smallValue' } },
  Sol: { tag: 'Gambler', color: '#ffd98a', voice: 13, style: { loose: 0.7, aggr: 0.65, tell: 'fastBluff' } },
};
const REGULARS = ['Mav', 'Dot', 'Rex', 'Ivy', 'Gus'];
// Bosses: after every third table you play one of these heads-up. Each bends a rule.
const BOSSES = [
  { name: 'Vera', tag: 'The Dealer', color: '#b58cff', voice: 6, trick: 'She always seems to know roughly what you are holding.', style: { loose: 0.5, aggr: 0.7, cheat: 0.55 } },
  { name: 'Otto', tag: 'The Whale', color: '#5fd0c5', voice: 7, trick: 'He sits down with three times your chips and loves to gamble.', chips: 3, style: { loose: 0.9, aggr: 0.75, tell: 'fastBluff' } },
  { name: 'Stone', tag: 'The Rock', color: '#b9b2a3', voice: 8, trick: 'He never bluffs and only plays strong hands, but the blinds rise every 2 hands.', turbo: true, style: { loose: 0.05, aggr: 0.45, noBluff: true } },
];
const bossFor = (n) => BOSSES[(Math.floor(n / 3) - 1 + BOSSES.length * 99) % BOSSES.length];
let bossMode = false; // true while playing the boss that follows table `table`
// A run is a climb through tables: knock everyone out to move up. Each table has more
// or sharper opponents and faster blinds.
// Each table is a place, with its own cloth.
const VENUES = [['The Kitchen Table', '#3050e0'], ['The Back Room', '#0e8a78'], ['The Club', '#6a3fd6'], ['High Rollers', '#c22f45'], ['The Vault', '#1f7a3d']];
// Which poker is played. Hold'em everywhere, except some later tables and the quick-table menu.
const VARIANTS = {
  holdem: { name: "Hold'em", rules: '' },
  short: { name: 'Short deck', rules: 'No cards below six. A flush beats a full house, and A-6-7-8-9 is a straight.' },
  omaha: { name: 'Omaha', rules: 'Four hole cards each. Your hand must use exactly two of them with three from the board.' },
};
const variantFor = (n) => (n >= 5 && n % 2 === 1 ? (n % 4 === 1 ? 'short' : 'omaha') : 'holdem'); // Table 5 short deck, 7 Omaha, 9 short deck...
function setVariantLook(v) { $('app').classList.toggle('omaha', v === 'omaha'); }
// From the third table on, each table changes one rule.
const BOUNTY = 200;
const TWISTS = [
  { key: 'bounty', name: 'Bounty', text: `every knock-out you score pays you ${BOUNTY} extra chips.` },
  { key: 'turbo', name: 'Turbo', text: 'the blinds go up every 2 hands.' },
  { key: 'short', name: 'Short stacks', text: 'everyone starts with half the usual chips.' },
  { key: 'deep', name: 'Deep stacks', text: 'everyone starts with double the usual chips.' },
];
function tableConfig(n, boss = false) {
  if (boss) {
    const b = bossFor(n);
    return {
      names: [b.name], boss: b, skill: 1, venue: `${b.name}, ${b.tag}`, mat: '#3a3355', twist: null,
      handsPerLevel: b.turbo ? 2 : 4, chips: STACKS[prefs.stack],
    };
  }
  let names = n === 1 ? ['Dot', 'Ivy', 'Gus'] : n === 2 ? ['Mav', 'Dot', 'Ivy', 'Gus'] : REGULARS;
  if (n >= 4) { // from here the line-up is five of the ten, shuffled per run and table
    const rnd = mulberry(((runStats.seed || 1) + n * 7919) | 0);
    const pool = Object.keys(CHARACTERS);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    names = pool.slice(0, 5);
    if (n === 4 && !names.some((x) => !REGULARS.includes(x))) names[4] = 'Zed'; // Table 4 always introduces someone new
  }
  const [venue, mat] = VENUES[(n - 1) % VENUES.length];
  const lap = Math.ceil(n / VENUES.length);
  const twist = n >= 3 ? TWISTS[(n - 3) % TWISTS.length] : null; // the first two tables are plain
  return {
    variant: variantFor(n),
    names, skill: Math.max(0.05, Math.min(1, 0.3 + (n - 1) * 0.175 + DIFFICULTY[prefs.difficulty].skill)), venue: lap > 1 ? `${venue}, round ${lap}` : venue, mat, twist,
    handsPerLevel: twist?.key === 'turbo' ? 2 : Math.max(3, 7 - n),
    chips: Math.round(STACKS[prefs.stack] * (twist?.key === 'short' ? 0.5 : twist?.key === 'deep' ? 2 : 1)),
  };
}
// ---------- perks: pick one after each table you clear; they last for the rest of the run ----------
const PERKS = {
  bigstack: { name: 'Big Stack', text: 'Start every table with 30% more chips.', stack: true },
  lifeline: { name: 'Lifeline', text: 'The next time you bust, stay in with a short stack instead.', stack: true },
  peek: { name: 'Peek', text: 'Each hand, one opponent shows you one of their cards.' },
  hunter: { name: 'Head Hunter', text: 'Every knock-out you score pays 100 extra chips.', stack: true },
  rakeback: { name: 'Rakeback', text: 'Every pot you win pays 10% extra.', stack: true },
  slowblinds: { name: 'Slow Clock', text: 'Blinds take 2 more hands to rise.', stack: true },
};
let perks = {}; // key -> how many you hold
// What the regulars remember about you this run: memory[name] = { ko: times you knocked them out }.
// Someone you have knocked out comes back more aggressive, says so, and gloats when they get you back.
let memory = {};
const grudge = (name) => memory[name]?.ko || 0;
let peekSeat = -1; // who is showing you a card this hand
const perkSummary = () => Object.keys(perks).filter((k) => perks[k] > 0)
  .map((k) => `<b>${PERKS[k].name}</b>${perks[k] > 1 ? ` &times;${perks[k]}` : ''}`).join(' &middot; ');
function pickPerk(done) {
  const pool = Object.keys(PERKS).filter((k) => PERKS[k].stack || !perks[k]);
  const offer = [];
  while (offer.length < 3 && pool.length) offer.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  showOverlay({
    title: 'Pick a <span>perk</span>', perky: true,
    body: `<p>Yours for the rest of this run.</p>${perkSummary() ? `<p class="who">You hold: ${perkSummary()}</p>` : ''}`,
    items: offer.map((k, i) => [`${i === 0 ? glyph('A') : ''}<span>${PERKS[k].name}<small>${PERKS[k].text}</small></span>`, () => {
      perks[k] = (perks[k] || 0) + 1;
      if (Object.values(perks).reduce((x, y) => x + y, 0) >= 3) award('loaded');
      audio.win(1);
      done();
    }]),
  });
}

// What is being played: 'run' (the climb) or 'daily' (today's fixed deal).
let mode = 'run';
let aiRng = Math.random; // opponents' dice; seeded in the daily deal so everyone faces the same game
function mulberry(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- the daily deal: the same 20 hands for everyone, one attempt a day ----------
const DAILY_HANDS = 20;
const DAILY_KEY = 'padpoker.daily';
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function dailyData() { try { return JSON.parse(localStorage.getItem(DAILY_KEY)) || { scores: {} }; } catch { return { scores: {} }; } }
function saveDaily(d) { try { localStorage.setItem(DAILY_KEY, JSON.stringify(d)); } catch { /* private mode */ } }
function dailySeed(hand) { // one number per date and hand
  let hsh = 2166136261;
  for (const ch of `${today()}#${hand}`) hsh = Math.imul(hsh ^ ch.charCodeAt(0), 16777619);
  return hsh | 0;
}
const DAILY_CFG = { names: ['Mav', 'Dot', 'Rex', 'Ivy', 'Gus'], skill: 0.75, venue: 'The Daily Deal', mat: '#b4551f', handsPerLevel: 4, chips: 1000 };
function dailyCalendar() {
  const d = dailyData();
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const dt = new Date(); dt.setDate(dt.getDate() - i);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    const sc = d.scores[key];
    days.push(`<div class="${sc === undefined ? 'none' : ''}${i === 0 ? ' now' : ''}"><i>${dt.getDate()}/${dt.getMonth() + 1}</i><b>${sc === undefined ? '\u2013' : sc.toLocaleString()}</b></div>`);
  }
  const all = Object.values(d.scores);
  return `<div class="cal">${days.join('')}</div><p>Days played: <b>${all.length}</b> &middot; Best: <b>${all.length ? Math.max(...all).toLocaleString() : '\u2013'}</b></p>`;
}
function dailyScreen() {
  const d = dailyData(), t = today();
  const done = d.scores[t] !== undefined;
  const mid = d.game && d.game.date === t;
  showOverlay({
    title: 'Daily <span>deal</span>', wide: true, closable: true, onClose: moreGames,
    body: `<p>${done ? `Today's score: <b>${d.scores[t].toLocaleString()}</b>. A new deal arrives tomorrow.` : `The same ${DAILY_HANDS} hands for everyone today, against all five regulars. Start with 1,000 and finish with as many chips as you can. One attempt.`}</p>${dailyCalendar()}`,
    items: done ? [['Share', () => share(dailyCard(), 'pokerpad-daily.png'), true], [`${glyph('B')}Back`, moreGames]] : [[`${glyph('A')}${mid ? 'Carry on' : "Play today's deal"}`, () => startDaily(mid ? d.game : null)], [`${glyph('B')}Back`, moreGames]],
  });
}
// Seat a one-off table (daily deal, quick table) outside the run.
function seatSingle(kind, cfg, hud, saved) {
  leaveOnline();
  ME = 0; ui.hidden = false;
  mode = kind; bossMode = false; twist = ''; perks = {}; table = 0; aiRng = Math.random;
  cast = [YOU, ...cfg.names.map((name) => ({ name, ...CHARACTERS[name], style: { ...CHARACTERS[name].style, skill: cfg.skill } }))];
  game = new Game({ players: cast, handsPerLevel: cfg.handsPerLevel, chips: cfg.chips, variant: cfg.variant || 'holdem' });
  setVariantLook(game.variant);
  habits = { facing: 0, folds: 0, acts: 0, raises: 0 };
  if (saved) {
    game.players.forEach((p, i) => { p.chips = saved.chips[i]; p.out = p.chips <= 0; });
    game.dealer = saved.dealer; game.handNo = saved.handNo;
  }
  $('app').style.setProperty('--mat', cfg.mat);
  audio.setVenue(cfg.music ?? 2);
  buildSeats();
  $('msg').textContent = ''; $('msg').classList.remove('show');
  $('pot').hidden = true;
  $('hud').innerHTML = hud;
  ui.mode = 'wait'; ui.resolve = null;
  lastBB = 0; fast = false; audio.hush(false); squeeze = null; ui.squeezed = true;
  runId++;
  renderActions();
  run();
}
function startDaily(saved) {
  if (!saved) { const d = dailyData(); d.game = { date: today(), chips: Array(6).fill(DAILY_CFG.chips), dealer: -1, handNo: 0 }; saveDaily(d); }
  seatSingle('daily', DAILY_CFG, `<b>Daily deal</b><br>${today()}`, saved);
}

// ---------- quick table: one sit-and-go, nothing saved, nothing at stake ----------
const QUICK_CFG = { names: REGULARS, skill: 0.7, venue: 'Quick table', mat: '#2c7da0', handsPerLevel: 4, chips: 1000, music: 1 };
let quickVariant = 'holdem';
function startQuick(v = quickVariant) {
  quickVariant = v;
  seatSingle('quick', { ...QUICK_CFG, variant: v }, `<b>Quick table</b><br>${VARIANTS[v].name}`);
}
function quickMenu() {
  showOverlay({
    title: 'Quick <span>table</span>', closable: true, onClose: moreGames,
    body: `<p>One six-player table, winner takes all.</p><p><b>Short deck:</b> ${VARIANTS.short.rules}</p><p><b>Omaha:</b> ${VARIANTS.omaha.rules}</p>`,
    items: [[`${glyph('A')}Hold'em`, () => startQuick('holdem')], ['Short deck', () => startQuick('short')], ['Omaha', () => startQuick('omaha')], [`${glyph('B')}Back`, moreGames]],
  });
}
function quickDone() {
  const me = game.players[ME];
  const place = game.players.filter((p) => p.chips > 0).length + (me.chips > 0 ? 0 : 1);
  const ord = ['', '1st', '2nd', '3rd', '4th', '5th', '6th'][place];
  audio.musicLevel(0);
  if (place === 1) { audio.fanfare(); fx.chipRain(40); } else audio.lose();
  showOverlay({
    title: place === 1 ? 'You <span>win!</span>' : `${ord} <span>place</span>`,
    body: `<p>${place === 1 ? `You took the whole table in ${game.handNo} hands.` : `Out in ${ord} of 6 after ${game.handNo} hands.`}</p>`,
    items: [[`${glyph('A')}Play again`, () => startQuick()], ['Done', startScreen]],
  });
}
// ---------- pass and play: two to four people share the device ----------
// The table turns to face whoever is acting. Between turns their cards are face down and a
// handover screen covers the table, so nobody sees a hand that isn't theirs.
const PASS_COLORS = ['var(--blue)', 'var(--red)', 'var(--mint)', 'var(--yellow)'];
let passHumans = 2;
function startPass(humans) {
  leaveOnline();
  mode = 'pass'; bossMode = false; twist = ''; perks = {}; table = 0; aiRng = Math.random; ME = 0;
  const people = Array.from({ length: humans }, (_, i) => ({ name: `P${i + 1}`, badge: String(i + 1), isHuman: true, tag: 'Player', color: PASS_COLORS[i] }));
  const bots = ['Gus', 'Ivy'].slice(0, Math.max(0, 4 - humans)).map((name) => ({ name, ...CHARACTERS[name], style: { ...CHARACTERS[name].style, skill: 0.7 } }));
  cast = [...people, ...bots];
  game = new Game({ players: cast, handsPerLevel: 5, chips: 1000 });
  setVariantLook('holdem');
  passHumans = humans;
  $('app').style.setProperty('--mat', '#8a4fbf');
  audio.setVenue(3);
  ui.hidden = true;
  buildSeats();
  $('msg').textContent = ''; $('msg').classList.remove('show');
  $('pot').hidden = true;
  $('hud').innerHTML = '<b>Pass &amp; play</b>';
  ui.mode = 'wait'; ui.resolve = null;
  lastBB = 0; fast = false; audio.hush(false); squeeze = null; ui.squeezed = true;
  runId++;
  renderActions();
  run();
}
function passMenu() {
  showOverlay({
    title: 'Pass <span>&amp; play</span>', closable: true, onClose: moreGames,
    body: `<p>Share one device. On your turn the table turns to face you and shows your cards; after you act they go face down and you pass it on. Computer players fill the table up to four.</p>`,
    items: [['2 players', () => startPass(2)], ['3 players', () => startPass(3)], ['4 players', () => startPass(4)], [`${glyph('B')}Back`, moreGames]],
  });
}
// Hand the device to the player who is about to act, then turn the table to them.
async function takeSeat(p) {
  const peopleLeft = game.players.filter((q) => q.isHuman && !q.out).length;
  if (peopleLeft > 1) {
    await new Promise((res) => showOverlay({
      title: `Pass to <span>${p.name}</span>`,
      body: `<p>Everyone else, look away. ${p.name}, press when only you can see the screen.</p>`,
      items: [[`${glyph('A')}I'm ${p.name}`, res]],
    }));
  }
  ME = p.seat; ui.hidden = false;
  ui.noAnim = true; buildSeats(true); render(); ui.noAnim = false;
}
function passDone() {
  const w = game.players.find((p) => p.chips > 0);
  ME = 0; ui.hidden = false;
  audio.musicLevel(0); audio.fanfare(); fx.chipRain(40);
  showOverlay({
    title: `${w.name} <span>wins!</span>`,
    body: `<p>${w.isHuman ? `Player ${w.name.slice(1)}` : w.name} took every chip in ${game.handNo} hands.</p>`,
    items: [[`${glyph('A')}Play again`, () => startPass(passHumans)], ['Done', startScreen]],
  });
}
// ---------- online play ----------
// One player hosts: their device runs the real game and is the only one that knows every
// card. Everyone else is a guest: they are sent a picture of the table with only their own
// cards filled in, and send back what they want to do. Messages go through a public relay
// (see net.js) on topics named after the room code.
//   <room>/up        guests -> host   { t: 'join' | 'act' | 'leave' | 'hb', pid, ... }
//   <room>/dn/<pid>  host -> a guest  { t: 's' table | 'e' effect | 'lobby' | 'hold' | 'go' | 'hb' | 'end' | 'full' }
let net = null; // { role: 'host' | 'guest', relay, code, base, ... }
const netOn = (role) => net?.role === role;
// Everything is encrypted between the host and each guest (see net.js), so nobody listening on the
// relay can read cards or act for someone else. Sends are queued so they go out in the order made.
function sealed(key, topic, msg, extra = {}) {
  const n = net;
  if (!n || !key) return;
  // (a message queued just before leaving still goes out, so goodbyes arrive)
  n.outq = n.outq.then(async () => { const body = await seal(key, msg); n.relay.publish(topic, JSON.stringify({ ...extra, ...body })); }).catch(() => {});
}
const sendUp = (msg) => net && sealed(net.key, `${net.base}/up`, { ...msg, q: Date.now() }, { pid: net.pid });
const sendTo = (pid, msg) => net && sealed(net.keys.get(pid)?.key, `${net.base}/dn/${pid}`, msg);
const noCrypto = () => showOverlay({ title: 'Not <span>available</span>', body: '<p>Online play needs a secure (https) page so the game can be encrypted.</p>', items: [['OK', onlineMenu]] });
const NET_TIMERS = [0, 15, 30, 45, 60, 90]; // seconds to act; 0 is no limit
const NET_BOTS = ['Gus', 'Ivy', 'Dot', 'Mav', 'Rex'];
const AWAY_AFTER = 12000; // ms of silence before someone counts as disconnected
const setBackLook = (name) => { for (const k of Object.keys(BACKS)) document.body.classList.toggle(`back-${k.toLowerCase()}`, k === name); };

// The turn clock. `end` is on this device's own timer, so it is sent as time remaining.
let clock = null; // { seat, end, total }
function startClock(seat) {
  const secs = net?.cfg?.timer || 0;
  clock = secs ? { seat, end: performance.now() + secs * 1000, total: secs * 1000, lastTick: 0 } : null;
}
function leaveOnline(tell = true) {
  if (!net) return;
  if (tell && netOn('host')) for (const pid of net.guests.keys()) sendTo(pid, { t: 'end', text: 'The host closed the game.' });
  if (tell && netOn('guest')) { sendUp({ t: 'leave' }); try { localStorage.removeItem('padpoker.seat'); } catch { /* private mode */ } }
  clearInterval(net.joiner); clearInterval(net.beat); clearInterval(net.again);
  const r = net.relay; net = null; clock = null;
  setTimeout(() => r.close(), 300); // let the goodbye go out first
  applyPrefs(); // back to your own card back
  if (mode === 'net') { mode = 'run'; runId++; game = null; ME = 0; $('seats').innerHTML = ''; $('board').innerHTML = ''; $('burn').innerHTML = ''; $('pot').hidden = true; $('hud').innerHTML = ''; $('msg').classList.remove('show'); ui.mode = 'wait'; ui.resolve = null; renderActions(); }
}
function onlineMenu() {
  leaveOnline();
  showOverlay({
    title: 'Play <span>online</span>', closable: true, onClose: moreGames,
    body: `<p>Up to six people, each on their own device. One hosts, sets up the table and shares a five-digit room code or a link; the rest join.</p><p>The game is encrypted between the host and each player, so nobody else can read the cards or act for you. Only the host's device knows every card, so let someone you trust host.</p><p class="ver">Version ${ver()}</p>`,
    items: [[`${glyph('A')}Host a game`, hostOnline], ['Join a game', () => joinEntry()], [`You: ${myName() || 'not set'}`, () => nameEntry()], [`${glyph('B')}Back`, moreGames]],
  });
}
// Names are typed by players and shown on every device, so only plain letters, digits and spaces get through.
const cleanName = (n) => String(n || '').replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 10);
const myName = () => cleanName(prefs.name);
const myFace = () => (FACES.includes(prefs.face) ? prefs.face : '');
function nameEntry(back = onlineMenu) {
  const tiles = ['', ...FACES];
  showOverlay({
    title: 'Your <span>player</span>', closable: true, onClose: back,
    body: `<p>Your name and face, shown to everyone at an online table.</p><input id="name-in" class="namein" maxlength="10" autocomplete="off" autocapitalize="words" spellcheck="false" enterkeyhint="done" placeholder="Your name" value="${myName()}"><div id="face-row" class="faces"></div>`,
    items: [[`${glyph('A')}Save`, () => { prefs.name = cleanName($('name-in')?.value ?? prefs.name); applyPrefs(); back(); }], [`${glyph('B')}Back`, back]],
  });
  overlay.naming = true;
  const row = $('face-row');
  const draw = () => { row.innerHTML = tiles.map((n, i) => `<button class="ava${n === myFace() ? ' sel' : ''}" data-mood="${n === myFace() ? 'happy' : 'idle'}" data-i="${i}">${n ? face(n) : '#'}</button>`).join(''); };
  const pick = (i) => { prefs.face = tiles[(i + tiles.length) % tiles.length]; audio.tick(); draw(); };
  row.onclick = (e) => { const b = e.target.closest('button'); if (b) pick(+b.dataset.i); };
  overlay.onKey = (b) => { // a controller steps through the faces
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
function seatNames() {
  const taken = new Set(), out = [];
  [myName(), ...lobbyGuests().map((gu) => gu.asked)].forEach((n, i) => {
    const name = n && !taken.has(n.toLowerCase()) && !NET_BOTS.includes(n) ? n : `P${i + 1}`;
    taken.add(name.toLowerCase()); out.push(name);
  });
  lobbyGuests().forEach((gu, i) => { gu.name = out[i + 1]; });
  return out;
}
// The short id of the build this device is running, shown online so a table can check everyone matches.
const ver = () => (version ? version.slice(0, 7) : 'dev');
const waiting = (title, text, cancel) => showOverlay({ title, body: `<p>${text}</p>`, items: [['Cancel', cancel]] });
const twistName = (key) => TWISTS.find((t) => t.key === key)?.name || 'None';
// One line describing the host's settings, shown to everyone in the lobby.
const cfgLine = (c) => [`${c.seats} seats`, c.timer ? `${c.timer}s to act` : 'no turn timer', VENUES[c.venue][0], VARIANTS[c.variant].name,
  c.twist ? twistName(c.twist) : null, `${c.back} cards`].filter(Boolean).join(' · ');

// ----- hosting -----
// The first time someone hosts or joins without a name, ask for one. Skipping is fine and is not asked again.
function askNameFirst(then) {
  if (myName() || prefs.nameAsked) return false;
  prefs.nameAsked = true; applyPrefs();
  nameEntry(then);
  return true;
}
async function hostOnline() {
  if (!canEncrypt()) return noCrypto();
  if (askNameFirst(hostOnline)) return;
  waiting('Opening <span>room</span>', 'Finding a relay…', onlineMenu);
  let conn;
  try { conn = await connectAny(); } catch { return showOverlay({ title: 'No <span>connection</span>', body: '<p>None of the public relays answered. Check your connection and try again.</p>', items: [['Try again', hostOnline], [`${glyph('B')}Back`, onlineMenu]] }); }
  const keys = await newKeys();
  if (!overlay || net) return conn.relay.close(); // cancelled while connecting
  const code = `${conn.index + 1}${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`; // first digit says which relay
  net = {
    role: 'host', relay: conn.relay, code, base: `padpoker2/${code}`, guests: new Map(), keys: new Map(), priv: keys.priv, pub: keys.pub, outq: Promise.resolve(), inq: Promise.resolve(), started: false, turn: 0, n: 0, waiter: null, hold: null,
    cfg: { timer: 45, seats: 4, venue: 0, back: prefs.back, twist: '', variant: 'holdem' },
  };
  net.relay.subscribe(`${net.base}/up`);
  net.relay.onMessage = (_, text) => { const n = net; n.inq = n.inq.then(() => (net === n ? hostRaw(JSON.parse(text)) : 0)).catch(() => { /* not ours, or not readable */ }); };
  net.relay.onClose = () => { toast('Lost the relay. The game has ended.'); leaveOnline(false); startScreen(); };
  net.beat = setInterval(hostBeat, 3000);
  net.again = setInterval(() => { // whoever we are waiting on gets the table every second, in case their copy was lost
    if (!netOn('host') || !net.waiter || net.hold) return;
    for (const [pid, gu] of net.guests) if (gu.seat === net.waiter.seat && !gu.kicked && !gu.away) sendTo(pid, tableFor(gu.seat));
  }, 1000);
  hostLobby();
}
const lobbyGuests = () => [...net.guests.values()].filter((gu) => !gu.kicked && !gu.watch); // the people with a seat
const watchers = () => [...net.guests.values()].filter((gu) => gu.watch);
function tellLobby() {
  const names = seatNames();
  for (const [pid, x] of net.guests) if (!x.kicked) sendTo(pid, { t: 'lobby', names, you: x.name, watch: !!x.watch, watching: watchers().length, info: cfgLine(net.cfg), v: ver() });
}
function hostLobby(focus = 0) {
  const c = net.cfg, people = 1 + lobbyGuests().length;
  c.seats = Math.max(c.seats, people, 2);
  const names = seatNames().map((n, i) => (i ? n : `${n} (you)`));
  const link = `${location.origin}${location.pathname}?join=${net.code}`;
  const backs = unlockedBacks();
  const again = (i, change) => () => { change(); tellLobby(); hostLobby(i); }; // redraw with the same button focused
  const next = (list, cur) => list[(list.indexOf(cur) + 1) % list.length];
  showOverlay({
    title: `Room <span>${net.code}</span>`, compact: true,
    body: `<p>Others join with this code from More games, Online, or by opening your link. <span class="ver">Version ${ver()}</span></p><p class="who">At the table: <b>${names.join('</b>, <b>')}</b></p><p>${c.seats - people ? `${c.seats - people} computer player${c.seats - people > 1 ? 's' : ''} will fill the other seats.` : 'Every seat is a person.'} ${people > 1 ? '' : 'Waiting for someone to join…'}${watchers().length ? ` ${watchers().length} watching.` : ''}</p>`,
    items: [
      [`${glyph('A')}Start game`, () => (people > 1 ? startOnline() : (toast('Nobody has joined yet'), hostLobby()))],
      ['Share link', async () => {
        try { if (navigator.share) await navigator.share({ title: 'PokerPad', text: `Join my poker table: room ${net.code}`, url: link }); else { await navigator.clipboard.writeText(link); toast('Link copied'); } } catch { toast(`Room code ${net.code}`); }
      }, true],
      [`Turn timer: ${c.timer ? `${c.timer}s` : 'Off'}`, again(2, () => { c.timer = next(NET_TIMERS, c.timer); })],
      [`Seats: ${c.seats}`, again(3, () => { c.seats = c.seats >= 6 ? Math.max(2, people) : c.seats + 1; })],
      [`Table: ${VENUES[c.venue][0].replace('The ', '')}`, again(4, () => { c.venue = (c.venue + 1) % VENUES.length; })],
      [`Card back: ${c.back}`, again(5, () => { c.back = next(backs, c.back); if (backs.length === 1) toast('Clear tables in a run to unlock more card backs'); })],
      [`Twist: ${twistName(c.twist)}`, again(6, () => { c.twist = next(['', ...TWISTS.map((t) => t.key)], c.twist); })],
      [`Game: ${VARIANTS[c.variant].name}`, again(7, () => { c.variant = next(Object.keys(VARIANTS), c.variant); })],
      [`You: ${myName() || 'not set'}`, () => nameEntry(() => { tellLobby(); hostLobby(8); })],
      ['Close room', onlineMenu],
    ],
  });
  overlay.lobby = true;
  if (focus) { overlay.focus = focus; overlayFocus(0); }
}
// Every few seconds: let guests know we are here, and notice anyone who has gone quiet.
function hostBeat() {
  if (!netOn('host')) return;
  const now = performance.now();
  for (const [pid, gu] of net.guests) {
    if (gu.kicked) continue;
    sendTo(pid, net.started && game && !gu.away ? tableFor(gu.seat) : { t: 'hb' }); // the relay can drop messages, so the table is sent again regularly
    if (!gu.away && now - gu.seen > AWAY_AFTER) setAway(gu, pid);
  }
}
function setAway(gu, pid) {
  if (gu.away || gu.kicked) return;
  if (gu.watch) { net.guests.delete(pid); if (!net.started) { tellLobby(); if (overlay?.lobby) hostLobby(overlay.focus); } return; } // a spectator leaving changes nothing
  if (!net.started) { net.guests.delete(pid); tellLobby(); if (overlay?.lobby) hostLobby(); return; } // just frees the seat in the lobby
  gu.away = true;
  toast(`${gu.name} lost connection`);
  holdCheck();
}
// The game stops while anyone still playing is disconnected. It carries on when they are back,
// or when the host replaces them with a computer player.
function holdCheck() {
  if (!netOn('host') || !net.started) return;
  const missing = [...net.guests.values()].filter((gu) => gu.away && !gu.kicked && !gu.watch && game && !game.players[gu.seat].out && game.players[gu.seat].chips + game.players[gu.seat].total > 0);
  if (!missing.length) {
    if (!net.hold) return;
    if (clock) clock.end += performance.now() - net.hold.since; // the clock did not run while we waited
    net.hold = null;
    if (overlay?.hold) closeOverlay();
    for (const [pid, gu] of net.guests) if (!gu.kicked) sendTo(pid, { t: 'go' });
    netBroadcast();
    return;
  }
  if (!net.hold) net.hold = { since: performance.now() };
  const names = missing.map((gu) => gu.name).join(' and ');
  for (const [pid, gu] of net.guests) if (!gu.kicked && !gu.away) sendTo(pid, { t: 'hold', names });
  showOverlay({
    title: 'Game <span>paused</span>',
    body: `<p><b>${names}</b> lost connection. The game carries on as soon as they are back. If they are not coming back, replace them with a computer player.</p>`,
    items: [['Keep waiting', () => toast(`Waiting for ${names}`), true], ...missing.map((gu) => [`Replace ${gu.name}`, () => kickGuest(gu)])], // waiting is the default, so a stray press can't remove anyone
  });
  overlay.hold = true;
}
function kickGuest(gu) {
  gu.kicked = true; gu.away = false;
  for (const [pid, x] of net.guests) if (x === gu) sendTo(pid, { t: 'end', text: 'The host replaced you with a computer player.' });
  const p = game.players[gu.seat];
  p.isHuman = false; p.style = { ...CHARACTERS.Gus.style, skill: 0.7 }; // their chips play on, steadily
  cast[gu.seat] = { ...cast[gu.seat], isHuman: false, remote: false, tag: 'Computer', voice: 5 };
  ui.noAnim = true; buildSeats(true); render(); ui.noAnim = false;
  if (net.waiter?.seat === gu.seat) { const w = net.waiter; net.waiter = null; w.resolve(null); }
  holdCheck();
}
// A message off the relay. A guest's first message carries their public key and gets ours back; after
// that only messages that decrypt with that guest's key are listened to.
async function hostRaw(raw) {
  if (!netOn('host') || typeof raw.pid !== 'string' || raw.pid.length > 24) return;
  let e = net.keys.get(raw.pid);
  if (raw.k) {
    if (!e) { if (net.keys.size >= 40) return; e = { pub: raw.k, key: await sharedKey(net.priv, raw.k), last: 0 }; net.keys.set(raw.pid, e); }
    else if (e.pub !== raw.k) return; // somebody else trying to take this player's place
    return void net.relay.publish(`${net.base}/dn/${raw.pid}`, JSON.stringify({ k: net.pub }));
  }
  if (!e || !raw.c) return;
  const m = await unseal(e.key, raw);
  if (!(m.q > e.last)) return; // an old message played back
  e.last = m.q;
  hostHears({ ...m, pid: raw.pid });
}
function hostHears(m) {
  if (!netOn('host') || !m.pid) return;
  let gu = net.guests.get(m.pid);
  if (gu?.kicked) return void sendTo(m.pid, { t: 'end', text: 'The host replaced you with a computer player.' });
  if (gu) {
    gu.seen = performance.now();
    if (gu.away && m.t !== 'leave') { gu.away = false; toast(`${gu.name} is back`); sendTo(m.pid, tableFor(gu.seat)); holdCheck(); }
  }
  if (m.t === 'join') {
    if (m.v !== ver() && m.v !== 'dev' && ver() !== 'dev') return void sendTo(m.pid, { t: 'ver', v: ver() }); // a different build would not understand our messages
    if (gu) { if (net.started) sendTo(m.pid, tableFor(gu.seat)); }
    else if (net.guests.size >= 16) return void sendTo(m.pid, { t: 'full' });
    else if (net.started || m.watch || lobbyGuests().length >= 5) { // no seat to give: they watch instead
      gu = { name: 'Spectator', asked: cleanName(m.name), seat: -1, watch: true, seen: performance.now(), away: false, kicked: false }; net.guests.set(m.pid, gu);
      if (net.started) { toast('Someone is watching'); return void sendTo(m.pid, tableFor(-1)); }
    }
    else { gu = { name: `P${net.guests.size + 2}`, seat: net.guests.size + 1, seen: performance.now(), away: false, kicked: false }; net.guests.set(m.pid, gu); }
    gu.asked = cleanName(m.name); gu.face = FACES.includes(m.face) ? m.face : '';
    if (!net.started && !!m.watch !== !!gu.watch && (m.watch || lobbyGuests().length < 5)) { gu.watch = !!m.watch; gu.seat = gu.watch ? -1 : 0; if (gu.watch) gu.name = 'Spectator'; } // changed their mind in the lobby
    if (!net.started) { tellLobby(); if (overlay?.lobby) hostLobby(overlay.focus); }
  } else if (m.t === 'act' && gu && net.waiter && net.waiter.seat === gu.seat && m.stamp === stampOf(game)) {
    const w = net.waiter; net.waiter = null; w.resolve(m.a);
  } else if (m.t === 'chat' && gu && net.started && performance.now() - (gu.lastChat || 0) > 1500) { // show it here and pass it on to everyone else
    gu.lastChat = performance.now();
    const text = m.key ? EMOTES.find((e) => e[3] === m.key)?.[2] : cleanChat(m.text);
    if (!text) return;
    const who = gu.watch ? gu.asked || 'Spectator' : ''; // a spectator has no seat to speak from, so their name goes with it
    showChat(gu.seat, text, who);
    for (const [pid, x] of net.guests) if (x !== gu && !x.kicked && !x.away) sendTo(pid, { t: 'e', k: 'chat', seat: gu.seat, text, who });
  } else if (m.t === 'leave' && gu) setAway(gu, m.pid);
}
function startOnline() {
  const c = net.cfg;
  mode = 'net'; bossMode = false; perks = {}; table = 0; aiRng = Math.random; ME = 0; ui.hidden = false;
  twist = c.twist;
  // seats are renumbered in case someone left the lobby
  lobbyGuests().forEach((gu, i) => { gu.seat = i + 1; gu.away = false; gu.seen = performance.now(); });
  const names = seatNames();
  const people = [{ name: names[0], face: myFace(), badge: '1', isHuman: true, tag: 'Host', color: PASS_COLORS[0] },
    ...lobbyGuests().map((gu, i) => ({ name: gu.name, face: gu.face, badge: String(i + 2), isHuman: true, remote: true, tag: 'Player', color: PASS_COLORS[(i + 1) % 4] }))];
  const bots = NET_BOTS.slice(0, Math.max(0, c.seats - people.length)).map((name) => ({ name, ...CHARACTERS[name], style: { ...CHARACTERS[name].style, skill: 0.7 } }));
  cast = [...people, ...bots];
  game = new Game({ players: cast, handsPerLevel: c.twist === 'turbo' ? 2 : 6, chips: Math.round(1000 * (c.twist === 'short' ? 0.5 : c.twist === 'deep' ? 2 : 1)), variant: c.variant });
  setVariantLook(c.variant);
  setBackLook(c.back);
  net.started = true; net.turn = 0; net.hold = null; clock = null;
  $('app').style.setProperty('--mat', VENUES[c.venue][1]);
  audio.setVenue(c.venue);
  buildSeats();
  $('msg').textContent = ''; $('msg').classList.remove('show');
  $('pot').hidden = true;
  ui.mode = 'wait'; ui.resolve = null;
  lastBB = 0; fast = false; audio.hush(false); squeeze = null; ui.squeezed = true;
  runId++;
  renderActions();
  run();
}
// What one seat is allowed to see: the whole table, with other players' cards blanked until they are shown.
// Names the exact decision a player is facing. An answer is only accepted for the decision it was given for,
// however many times the table or the answer gets sent.
const stampOf = (g) => `${g.handNo}|${g.street}|${g.toAct}|${g.players.map((p) => p.total).join(',')}`;
function tableFor(seat) {
  const g = game, c = net.cfg;
  return {
    t: 's', me: Math.max(0, seat), watch: seat < 0, watching: watchers().length, n: ++net.n, stamp: stampOf(g), settled, held: !!net.hold,
    look: { mat: VENUES[c.venue][1], venue: c.venue, back: c.back },
    clock: clock ? { seat: clock.seat, left: Math.max(0, clock.end - performance.now()), total: clock.total } : null,
    handNo: g.handNo, dealer: g.dealer, sb: g.sb, bb: g.bb, street: g.street, stage: g.stage, toAct: g.toAct, board: g.board,
    currentBet: g.currentBet, variant: g.variant, showCards: g.showCards, runout: g.runout, result: g.result,
    legal: g.stage === 'betting' && g.toAct === seat ? g.legal(seat) : null,
    cast: cast.map((x) => ({ name: x.name, tag: x.tag, color: x.color, badge: x.badge, face: x.face, isHuman: !!x.isHuman, voice: x.voice })),
    players: g.players.map((p) => ({
      name: p.name, isHuman: p.isHuman, chips: p.chips, bet: p.bet, total: p.total, folded: p.folded, allIn: p.allIn, out: p.out,
      lastAction: p.lastAction, won: p.won, handName: p.handName, score: g.showCards && !p.folded ? p.score : 0,
      cards: p.seat === seat || (g.showCards && !p.folded) ? p.cards : p.cards.map(() => -1),
    })),
  };
}
function netBroadcast() { for (const [pid, gu] of net.guests) if (!gu.kicked && !gu.away) sendTo(pid, tableFor(gu.seat)); }
function netEffect(k, extra = {}) { if (netOn('host') && net.started && !replaying) for (const [pid, gu] of net.guests) if (!gu.kicked && !gu.away) sendTo(pid, { t: 'e', k, ...extra }); }
// Wait for a guest to act. The turn clock (see clockTick), a kick, or their own answer ends the wait;
// running out of time means a check if it is free, otherwise a fold.
function remoteAction(p) {
  return new Promise((resolve) => { net.waiter = { seat: p.seat, resolve }; }).then((a) => {
    const ok = a && ['fold', 'check', 'call', 'raise'].includes(a.type);
    if (ok) return { type: a.type, amount: Number(a.amount) || 0 };
    if (!p.isHuman) return decide(game, p.seat, aiRng, humanProfile()); // just replaced by a computer player
    return { type: game.legal(p.seat).canCheck ? 'check' : 'fold' };
  });
}
function netDone() {
  const w = game.players.find((p) => p.chips > 0);
  const text = `${w.name} wins the table after ${game.handNo} hands.`;
  for (const [pid, gu] of net.guests) if (!gu.kicked) sendTo(pid, { t: 'end', text, again: true });
  audio.musicLevel(0); audio.fanfare(); fx.chipRain(40);
  net.started = false; clock = null;
  showOverlay({ title: `${w.name} <span>wins!</span>`, body: `<p>${text}</p>`, items: [[`${glyph('A')}Back to the room`, () => hostLobby()], ['Close room', () => { leaveOnline(); startScreen(); }]] });
}

// The turn clock, on every device: shrink the bar on whoever is acting, tick faster as time runs
// out, and on the host act for anyone who lets it reach zero.
setInterval(() => {
  const live = mode === 'net' && clock && game && game.stage === 'betting' && game.toAct === clock.seat;
  seatEls.forEach((el, i) => { const c = el?.querySelector('.clock'); if (!c) return; const on = !!live && i === clock.seat; c.classList.toggle('on', on); if (!on) c.classList.remove('hot'); });
  if (!live) { if (clock && game && (game.stage !== 'betting' || game.toAct !== clock.seat)) clock = null; return; }
  if (net?.hold || clock.frozen) return;
  const now = performance.now(), left = clock.end - now;
  const bar = seatEls[clock.seat]?.querySelector('.clock');
  if (bar) {
    bar.firstChild.style.width = `${Math.max(0, Math.min(1, left / clock.total)) * 100}%`;
    bar.classList.toggle('hot', left <= 10000);
    bar.lastChild.textContent = left <= 10000 ? Math.max(0, Math.ceil(left / 1000)) : '';
  }
  // ticking: once a second in the last ten, twice in the last five, four times in the last two
  const every = left > 10000 ? 0 : left > 5000 ? 1000 : left > 2000 ? 500 : 250;
  if (every && now - clock.lastTick >= every - 20) {
    clock.lastTick = now;
    const urgency = 1 - Math.max(0, left) / 10000;
    if (clock.seat === ME) { audio.clockTick(urgency, 1); fx.rumble(0.2 + urgency * 0.6, 0.3 + urgency * 0.7, 40 + urgency * 60); }
    else if (left <= 5000) audio.clockTick(urgency, 0.35);
  }
  if (netOn('host') && left <= 0) { // time is up
    if (clock.seat === ME) {
      if (ui.mode === 'squeeze') { finishSqueeze(); clock.end = now + 400; return; } // show the cards, then act
      if (ui.mode === 'actions' || ui.mode === 'raise') { clock = null; finish({ type: game.legal(ME).canCheck ? 'check' : 'fold' }); }
    } else if (net.waiter?.seat === clock.seat) { const w = net.waiter; net.waiter = null; clock = null; w.resolve(null); }
  }
}, 200);

// ----- joining -----
function joinEntry(code = [1, 0, 0, 0, 0], pos = 0) {
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
  overlay.onKey = (b) => {
    if (b === 'left' || b === 'right') { pos = (pos + (b === 'left' ? 4 : 1)) % 5; audio.tick(); draw(); return true; }
    if (b === 'up' || b === 'down') { bump(b === 'up' ? 1 : -1); return true; }
    return false;
  };
  draw();
  $('code-boxes').onclick = (e) => { const i = e.target.dataset?.i; if (i !== undefined) { pos = +i; bump(1); } };
}
async function joinOnline(code) {
  if (!/^[1-9]\d{4}$/.test(code)) return joinEntry();
  if (!canEncrypt()) return noCrypto();
  if (askNameFirst(() => joinOnline(code))) return;
  waiting('Joining <span>room</span>', `Looking for room ${code}…`, onlineMenu);
  let conn;
  try { conn = await connectAny(+code[0] - 1); } catch { return showOverlay({ title: 'No <span>connection</span>', body: '<p>Could not reach the relay for that room. Check the code and your connection.</p>', items: [['Try again', () => joinOnline(code)], [`${glyph('B')}Back`, onlineMenu]] }); }
  if (!overlay || net) return conn.relay.close();
  // Your seat is remembered on this device, so reopening the link or the app puts you back in it.
  let pid = Math.random().toString(36).slice(2, 12), key = null, mine = null;
  try { const kept = JSON.parse(localStorage.getItem('padpoker.seat')); if (kept?.code === code && kept.key) { key = await importKey(kept.key); pid = kept.pid; } } catch { key = null; }
  if (!key) mine = await newKeys(); // first time in this room: swap keys with the host
  if (!overlay || net) return conn.relay.close();
  net = { role: 'guest', relay: conn.relay, code, base: `padpoker2/${code}`, pid, key, mine, kept: !!key, hostPub: '', outq: Promise.resolve(), inq: Promise.resolve(), seen: false, lastN: 0, sent: null, tries: 0, hostSeen: performance.now(), lost: false, held: false };
  net.relay.subscribe(`${net.base}/dn/${pid}`);
  net.relay.onMessage = (_, text) => { const n = net; n.inq = n.inq.then(() => (net === n ? guestRaw(JSON.parse(text)) : 0)).catch(() => { /* not ours, or not readable */ }); };
  net.relay.onClose = async () => { // one quiet attempt to get back in
    if (!netOn('guest')) return;
    toast('Connection lost. Reconnecting…');
    try { const c = await connectAny(+code[0] - 1); if (!netOn('guest')) return c.relay.close(); c.relay.onMessage = net.relay.onMessage; c.relay.onClose = net.relay.onClose; net.relay = c.relay; net.relay.subscribe(`${net.base}/dn/${pid}`); sendUp({ t: 'join', name: myName(), face: myFace(), watch: !!net.wantWatch, v: ver() }); }
    catch { leaveOnline(false); showOverlay({ title: 'Connection <span>lost</span>', body: '<p>Could not get back to the room. Open the link or enter the code again to return to your seat.</p>', items: [['OK', startScreen]] }); }
  };
  const knock = () => { // keep asking until the host answers; the relay does not store messages
    if (!netOn('guest') || net.seen) return clearInterval(net.joiner);
    if (net.kept && net.tries === 4) { // the room no longer knows our old seat: come in as a new player
      try { localStorage.removeItem('padpoker.seat'); } catch { /* private mode */ }
      clearInterval(net.joiner); leaveOnline(false); waiting('Joining <span>room</span>', `Looking for room ${code}\u2026`, onlineMenu); return joinOnline(code);
    }
    if (++net.tries > 8) { clearInterval(net.joiner); leaveOnline(false); return showOverlay({ title: 'No such <span>room</span>', body: `<p>Nobody answered in room ${code}. Check the code with the host.</p>`, items: [['Try again', () => joinEntry(code.split('').map(Number))], [`${glyph('B')}Back`, onlineMenu]] }); }
    if (net.key) sendUp({ t: 'join', name: myName(), face: myFace(), watch: !!net.wantWatch, v: ver() });
    else net.relay.publish(`${net.base}/up`, JSON.stringify({ pid, k: net.mine.pub }));
  };
  net.again = setInterval(() => { // keep sending our answer until the host's table shows it arrived
    if (netOn('guest') && net.sent && performance.now() - net.sent.at > 1200) { net.sent.at = performance.now(); sendUp({ t: 'act', stamp: net.sent.stamp, a: net.sent.a }); }
  }, 400);
  net.joiner = setInterval(knock, 1500);
  setTimeout(knock, 250);
  net.beat = setInterval(() => { // say we are still here, and notice if the host has gone quiet
    if (!netOn('guest') || !net.seen) return;
    sendUp({ t: 'hb' });
    if (mode === 'net' && !net.lost && performance.now() - net.hostSeen > AWAY_AFTER + 3000) {
      net.lost = true;
      if (clock) clock.frozen = true;
      showOverlay({ title: 'Host <span>lost</span>', body: '<p>Lost contact with the host. Waiting for them to come back…</p>', items: [['Leave game', exitToMenu]] });
      overlay.hold = true;
    }
  }, 4000);
}
async function guestRaw(raw) {
  if (!netOn('guest')) return;
  if (raw.k) { // the host's public key
    if (net.hostPub && raw.k !== net.hostPub) { // two different hosts answered: someone is interfering
      leaveOnline(false);
      return showOverlay({ title: 'Not <span>safe</span>', body: '<p>Someone else answered as the host of this room, so the game cannot be trusted. Ask the host to open a new room.</p>', items: [['OK', onlineMenu]] });
    }
    if (net.key || !net.mine) return;
    net.hostPub = raw.k;
    net.key = await sharedKey(net.mine.priv, raw.k);
    try { localStorage.setItem('padpoker.seat', JSON.stringify({ code: net.code, pid: net.pid, key: await exportKey(net.key) })); } catch { /* private mode */ }
    return sendUp({ t: 'join', name: myName(), face: myFace(), watch: !!net.wantWatch, v: ver() });
  }
  if (!net.key || !raw.c) return;
  guestHears(await unseal(net.key, raw));
}
function guestHears(m) {
  if (!netOn('guest')) return;
  net.seen = true; net.hostSeen = performance.now();
  if (net.lost) { net.lost = false; if (clock) clock.frozen = net.held; if (overlay?.hold && !net.held) closeOverlay(); }
  if (m.t === 'hb') return;
  if (m.t === 'ver') {
    const mineV = ver();
    try { localStorage.removeItem('padpoker.seat'); } catch { /* private mode */ }
    leaveOnline(false);
    return showOverlay({ title: 'Different <span>version</span>', body: `<p>The host is on version <b>${m.v}</b> and this device is on <b>${mineV}</b>. Everyone needs the same one: fully close the game and open it again, on both devices if needed, then rejoin.</p>`, items: [['Reload now', () => location.reload()], [`${glyph('B')}Back`, onlineMenu]] });
  }
  if (m.t === 'full') { leaveOnline(false); return showOverlay({ title: 'Room <span>full</span>', body: '<p>That game has already started or has no seats left.</p>', items: [['OK', onlineMenu]] }); }
  if (m.t === 'lobby') {
    net.lobbyMsg = m;
    if (overlay?.naming) return; // typing a name: the lobby is redrawn afterwards
    showOverlay({
      title: `Room <span>${net.code}</span>`,
      body: `<p>${m.watch ? 'You are <b>watching</b>: you will see the table, and cards only at showdown.' : `You are <b>${m.you}</b>.`} Waiting for the host to start.</p><p class="who">At the table: <b>${m.names.join('</b>, <b>')}</b></p><p>${m.info || ''}${m.watching ? ` &middot; ${m.watching} watching` : ''}</p><p class="ver">Version ${m.v || ver()}</p>`,
      items: [['Name and face', () => nameEntry(() => { if (!netOn('guest')) return; sendUp({ t: 'join', name: myName(), face: myFace(), watch: !!net.wantWatch, v: ver() }); if (mode !== 'net' && net.lobbyMsg) guestHears(net.lobbyMsg); })], [m.watch ? 'Take a seat' : 'Watch only', () => { net.wantWatch = !m.watch; sendUp({ t: 'join', name: myName(), face: myFace(), watch: !!net.wantWatch, v: ver() }); }], ['Leave', onlineMenu]],
    });
    overlay.lobby = true;
    return;
  }
  if (m.t === 'hold') {
    net.held = true;
    if (clock) clock.frozen = true;
    showOverlay({ title: 'Game <span>paused</span>', body: `<p><b>${m.names}</b> lost connection. The game carries on when they are back, or when the host replaces them with a computer player.</p>`, items: [['Leave game', exitToMenu]] });
    overlay.hold = true;
    return;
  }
  if (m.t === 'go') { net.held = false; if (overlay?.hold) closeOverlay(); return; }
  if (m.t === 'end') {
    audio.musicLevel(0); clock = null;
    const stay = m.again; // the host may deal again: stay connected and wait
    if (!stay) { try { localStorage.removeItem('padpoker.seat'); } catch { /* private mode */ } leaveOnline(false); }
    return showOverlay({ title: 'Game <span>over</span>', body: `<p>${m.text}</p>${stay ? '<p>Stay here if the host is dealing again.</p>' : ''}`, items: [[stay ? 'Leave' : 'OK', () => { leaveOnline(); startScreen(); }]] });
  }
  if (m.t === 'e' && game) {
    if (m.k === 'deal') { audio.tension(false); audio.newHand(); audio.musicLevel(1); ui.scatter = 0; fx.shuffle($('deck')); audio.shuffle(); game.players.forEach((p) => setMood(p.seat, 'idle')); }
    else if (m.k === 'act') actionFx(game.players[m.seat], m.pot);
    else if (m.k === 'collect') collectBets(tick);
    else if (m.k === 'over') handOverFx();
    else if (m.k === 'say') say(game.players[m.seat], m.moment);
    else if (m.k === 'chat') showChat(m.seat, cleanChat(m.text), cleanName(m.who));
    else if (m.k === 'banner') { fx.banner(m.text, 'info'); audio.chips(5, 0, 4); }
    return;
  }
  if (m.t === 's') showTable(m);
}
// A guest's stand-in for the game object: the same fields the renderer reads, filled from the host's picture.
function showTable(m) {
  if (m.n <= net.lastN) return; // an older picture that arrived late
  net.lastN = m.n;
  if (net.sent && net.sent.stamp !== m.stamp) net.sent = null; // the host has our answer
  const fresh = mode !== 'net' || !game || game.players.length !== m.players.length || m.handNo < game.handNo || !!m.watch !== !!net.watch
    || m.cast.some((x, i) => x.isHuman !== cast[i]?.isHuman); // someone was replaced by a computer player
  mode = 'net'; ME = m.me; settled = m.settled; cast = m.cast; peekSeat = -1;
  ui.hidden = !!m.watch; // a spectator sits behind the host's chair and sees no cards until a showdown
  game = {
    ...m, deck: [], dealt: null,
    players: m.players.map((p, seat) => ({ ...p, seat, style: {} })),
    get pot() { return this.players.reduce((sum, p) => sum + p.total, 0); },
    legal: () => m.legal || { toCall: 0, canCheck: true, canRaise: false, minTo: 0, maxTo: 0 },
  };
  clock = m.clock ? { seat: m.clock.seat, end: performance.now() + m.clock.left, total: m.clock.total, lastTick: clock?.seat === m.clock.seat ? clock.lastTick : 0, frozen: m.held } : null;
  net.watch = !!m.watch;
  if (fresh) {
    const mid = game.handNo > 0 && !overlay?.lobby; // rejoining a table in progress: no dealing animation
    if (overlay && !overlay.hold) closeOverlay();
    setVariantLook(m.variant);
    setBackLook(m.look.back);
    $('app').style.setProperty('--mat', m.look.mat);
    audio.setVenue(m.look.venue);
    squeeze = null; ui.squeezed = true; ui.mode = 'wait'; ui.resolve = null;
    ui.noAnim = mid; buildSeats(); render(); ui.noAnim = false;
  }
  if (m.board.length >= 3) audio.musicLevel(2);
  if (m.stage === 'handOver' && !ui.squeezed) finishSqueeze();
  render();
  const myTurn = !!m.legal;
  if (!myTurn && ['actions', 'raise', 'squeeze'].includes(ui.mode)) { if (ui.mode === 'squeeze') { ui.mode = 'wait'; renderActions(); } else finish(); } // the host moved on without us
  if (myTurn && ui.mode === 'wait' && !net.sent) guestTurn();
}
async function guestTurn() {
  if (ui.mode !== 'wait') return; // already being asked
  audio.turn(); fx.haptic('turn');
  await waitForSqueeze();
  if (!netOn('guest')) return;
  if (game.stage !== 'betting' || game.toAct !== ME || ui.mode !== 'wait') return;
  const a = await prompt('actions');
  if (!a || !netOn('guest') || game.toAct !== ME || game.stage !== 'betting') return;
  net.sent = { stamp: game.stamp, a, at: performance.now() };
  sendUp({ t: 'act', stamp: game.stamp, a });
}

function moreGames() {
  const d = dailyData(), done = d.scores[today()] !== undefined;
  showOverlay({
    title: 'More <span>games</span>', closable: true, onClose: startScreen,
    body: `<p><b>Daily deal:</b> the same ${DAILY_HANDS} hands for everyone, one attempt a day${done ? ' (played today)' : ''}.</p><p><b>Quick table:</b> one six-player table, winner takes all. Nothing is saved and your run is untouched.</p><p><b>Pass &amp; play:</b> two to four people on one device. <b>Online:</b> each on their own.</p>`,
    items: [['Daily deal', dailyScreen], ['Quick table', quickMenu], ['Pass & play', passMenu], ['Online', onlineMenu], [`${glyph('B')}Back`, startScreen]],
  });
}
function dailyDone() {
  const me = game.players[ME], d = dailyData(), t = today();
  d.scores[t] = me.chips; delete d.game; saveDaily(d);
  award('daily_player');
  if (me.chips > 2000) award('in_the_black');
  if (Object.keys(d.scores).length >= 3) award('regular_hours');
  audio.musicLevel(0);
  if (me.chips > DAILY_CFG.chips) { audio.win(2); fx.burst($('center'), 40); } else audio.lose();
  showOverlay({
    title: 'Daily <span>deal</span>', wide: true,
    body: `<p class="venue">You finished with ${me.chips.toLocaleString()} chips${me.chips === 0 ? '' : ` after ${game.handNo} hands`}.</p>${dailyCalendar()}`,
    items: [[`${glyph('A')}Done`, startScreen], ['Share', () => share(dailyCard(), 'pokerpad-daily.png'), true]],
  });
}

let table = 1;
let twist = ''; // the current table's rule change, if any
let lastBB = 0; // to announce when the blinds go up
let cast = []; // cast[seat] = character info for the current table
let ME = 0; // the seat whose view is on screen: always 0, except in pass-and-play where it follows the player holding the device
const mine = (p) => p.seat === ME;
const DEAL_GAP = 90; // ms between dealt cards
const SHUFFLE_MS = 800; // the shuffle before each deal
const REVEAL_GAP = 320; // ms between players turning their cards over

const $ = (id) => document.getElementById(id);
const h = (tag, cls = '', html = '') => {
  const e = document.createElement(tag);
  e.className = cls; e.innerHTML = html;
  return e;
};
const glyph = (g) => `<span class="glyph ${g.length > 1 ? 'wide' : g.toLowerCase()}">${g}</span>`;
let replaying = false; // true while a recorded hand is being shown on the table; the live game waits
let replayStop = false; // asks the replay to finish early
let fast = false; // true while skipping the rest of a hand you've folded
const tick = (ms) => new Promise((r) => setTimeout(r, ms));
// Every pause in the game goes through here, so opening a menu really does pause play.
const rawSleep = async (ms) => {
  await tick(fast ? 0 : ms);
  while ((overlay && mode !== 'net') || replaying || net?.hold) await tick(120); // an online game doesn't stop for one player's menu, only for a disconnection
};
const sleep = (ms) => rawSleep(ms * PACE[prefs.speed]); // game pauses stretch with the speed setting

// ---------- player preferences ----------
const PACE = { Relaxed: 1.4, Normal: 1, Fast: 0.5 };
const STACKS = { Short: 500, Standard: 1000, Deep: 2000 };
const prefs = { speed: 'Normal', stack: 'Standard', lefty: false, rumble: true, chatter: true, coach: false, back: 'Spade', fourColour: false, squeeze: true, difficulty: 'Standard' };
// Difficulty shifts how well the opponents play, and in Shark gives them a bigger stack. The daily deal ignores it.
const DIFFICULTY = { Casual: { skill: -0.25, stack: 1 }, Standard: { skill: 0, stack: 1 }, Shark: { skill: 0.25, stack: 1.25 } };
// Card backs, and how many tables your best run must have cleared to unlock each.
const BACKS = { Spade: 0, Lattice: 1, Sunburst: 2, Ruby: 3, Gold: 5 };
const bestRun = () => { try { return +localStorage.getItem('padpoker.best') || 0; } catch { return 0; } };
const unlockedBacks = () => Object.keys(BACKS).filter((k) => BACKS[k] <= bestRun());
try { Object.assign(prefs, JSON.parse(localStorage.getItem('padpoker.prefs')) || {}); } catch { /* private mode */ }
if (!PACE[prefs.speed]) prefs.speed = 'Normal';
if (!STACKS[prefs.stack]) prefs.stack = 'Standard';
if (!DIFFICULTY[prefs.difficulty]) prefs.difficulty = 'Standard';
function applyPrefs() {
  document.body.classList.toggle('four', prefs.fourColour);
  if (!unlockedBacks().includes(prefs.back)) prefs.back = 'Spade';
  for (const k of Object.keys(BACKS)) document.body.classList.toggle(`back-${k.toLowerCase()}`, k === prefs.back);
  document.body.classList.toggle('lefty', prefs.lefty);
  fx.setRumble(prefs.rumble);
  try { localStorage.setItem('padpoker.prefs', JSON.stringify(prefs)); } catch { /* private mode */ }
}
const cycle = (obj, cur) => { const k = Object.keys(obj); return k[(k.indexOf(cur) + 1) % k.length]; };

let game = null;
let runId = 0;
let seatEls = [];
// mode: 'wait' | 'actions' | 'raise' | 'continue'
const ui = { mode: 'wait', focus: 1, raiseTo: 0, resolve: null, shown: '', reveals: 0, slowRiver: false, squeezed: true, hidden: false, noAnim: false, throwPower: 0, scatter: 0, revealGap: 0 };
let settled = false; // false between the last action of a hand and the moment the result is shown
let overlay = null; // { items, focus, closable }

// ---------- rendering ----------
// cover: the card arrives face down and turns over at the end of its entry animation
function cardEl(c, face, cls = '', cover = false) {
  const el = h('div', `card ${cls}`);
  if (cover) el.append(h('div', 'in back cover'));
  if (!face) { el.append(h('div', 'in back')); return el; }
  const r = RANKS[c >> 2], s = c & 3;
  el.dataset.c = c;
  el.append(h('div', `in face s${s} ${s === 1 || s === 2 ? 'red' : 'black'}`,
    `<span class="r">${r === 'T' ? '10' : r}</span><span class="s">${SUITS[s]}</span><i class="ix">${r === 'T' ? '10' : r}<br>${SUITS[s]}</i>`));
  return el;
}

// Chips are drawn from above as a heap: discs spiral out from the middle in x and y,
// overlapping, with the middle of the heap on top. The layout is fixed for a given
// count, so a pile grows outwards as chips are added rather than reshuffling.
const chipCount = (amount, per, max) => Math.max(1, Math.min(max, Math.round(Math.log2(amount / game.bb + 1) * per)));
function setPile(el, n, scatter = 0) { // scatter 0..1: a thrown bet lands as a looser, messier heap
  const key = `${n}:${scatter}`;
  if (el.dataset.n === key) return;
  el.dataset.n = key;
  const gap = 0.6 + scatter * 0.55, disc = 1.55; // em
  const R = gap * Math.sqrt(Math.max(0, n - 1));
  el.style.width = el.style.height = `${(2 * R + disc + 0.3).toFixed(2)}em`;
  let html = '';
  for (let i = n - 1; i >= 0; i--) { // outer chips first, so they sit underneath
    const a = i * 2.39996 + 0.7 + scatter * Math.sin(i * 12.9898) * 1.4, r = gap * Math.sqrt(i) * (1 + scatter * Math.sin(i * 78.233) * 0.35); // golden-angle spiral, jittered when thrown
    html += `<i class="c${i % 3} h${i % 4 === 0 ? 2 : 1}" style="left:${(R + r * Math.cos(a)).toFixed(2)}em;top:${(R + r * Math.sin(a)).toFixed(2)}em"></i>`;
  }
  el.innerHTML = html;
}

function buildSeats(keepBoard = false) {
  $('seats').innerHTML = '';
  if (!keepBoard) $('board').innerHTML = '';
  seatEls = game.players.map((p) => {
    const el = h('div', `seat ${mine(p) ? 's0 me' : 'ai'}`,
      `<div class="cards"></div><div class="badge"></div>
       <div class="plate"><div class="ava" data-mood="idle">${cast[p.seat].face ? face(cast[p.seat].face) : p.isHuman || cast[p.seat].badge ? (cast[p.seat].badge || p.name[0]) : face(p.name)}</div>
         <div class="who"><div class="name"></div><div class="chips"></div></div><div class="hand"></div></div>
       <div class="bet" hidden><span></span><em class="pile"></em></div><div class="say"></div><div class="clock"><i></i><b></b></div>`);
    const c = cast[p.seat];
    el.querySelector('.name').innerHTML = `${p.name}${c.tag ? ` <i>${c.tag}</i>` : ''}`;
    if (!mine(p)) { // spread everyone else evenly along the top, in order round the table from the viewer
      const n = game.players.length - 1;
      const slot = (p.seat - ME - 1 + game.players.length) % game.players.length;
      const left = n === 1 ? 50 : 13 + slot * (74 / (n - 1));
      el.style.left = `${left}%`;
      el.style.setProperty('--pc', c.color);
      el.style.setProperty('--i', slot + 1);
      el.style.setProperty('--dx', `${(50 - left) * 0.8}vw`);
    }
    $('seats').append(el);
    return el;
  });
}

const dealOrder = (seat) => (seat - game.dealer - 1 + game.players.length) % game.players.length;


function render() {
  const g = game;
  if (!g) return; // left for the menu while something was still finishing
  const over = g.stage === 'handOver' && settled;
  const pending = g.stage === 'handOver' && !settled; // result known but not yet revealed
  const n = g.players.length;
  let reveals = 0;
  const odds = g.runout && g.board.length < 5 && g.stage !== 'handOver' ? oddsFor(g) : null;
  g.players.forEach((p, i) => {
    const el = seatEls[i];
    const face = (mine(p) && !ui.hidden) || (g.showCards && !p.folded);
    const show = p.cards.length && (!p.folded || mine(p));
    const seen = (k) => face || (i === peekSeat && k === 0 && !p.folded); // Peek perk: one opponent shows a card
    const sig = show ? p.cards.map((c, k) => (seen(k) ? c : 'x')).join() : '';
    const cards = el.querySelector('.cards');
    const old = cards.dataset.sig || '';
    if (old !== sig) {
      cards.dataset.sig = sig;
      if (!sig) { // folded: toss the cards away
        for (const c of cards.children) c.classList.add('toss');
        setTimeout(() => { if (!cards.dataset.sig) cards.replaceChildren(); }, 340);
      } else if (old.includes('x') && !sig.includes('x')) { // turn them over, one player after another
        const wait = reveals++ * (ui.revealGap || REVEAL_GAP);
        cards.replaceChildren(...p.cards.map((c, k) => {
          const e = cardEl(c, true, 'flip');
          e.style.animationDelay = `${wait + k * 90}ms`;
          return e;
        }));
        audio.flip(wait / 1000);
      } else {
        const delay = (k) => SHUFFLE_MS + (dealOrder(i) + k * n) * DEAL_GAP;
        // cards fly from the deck, and go back towards it when folded
        const dr = $('deck').getBoundingClientRect(), cr = cards.getBoundingClientRect();
        cards.style.setProperty('--dx', `${dr.left + dr.width / 2 - cr.left - cr.width / 2}px`);
        cards.style.setProperty('--dy', `${dr.top + dr.height / 2 - cr.top - cr.height / 2}px`);
        // every card starts exactly on top of the deck, at the deck's size, and slides off it
        const sq = mine(p) && prefs.squeeze && mode !== 'pass' && !ui.hidden && !ui.noAnim && !replaying; // your cards stay face down until you squeeze them
        const els = p.cards.map((c, k) => {
          const e = cardEl(c, ui.noAnim ? seen(k) : sq || (seen(k) && !mine(p)), '', sq);
          if (sq) e.firstChild.classList.add('sq');
          return e;
        });
        cards.replaceChildren(...els);
        if (!ui.noAnim) els.forEach((e, k) => {
          const r = e.getBoundingClientRect();
          e.style.setProperty('--dx', `${dr.left + dr.width / 2 - r.left - r.width / 2}px`);
          e.style.setProperty('--dy', `${dr.top + dr.height / 2 - r.top - r.height / 2}px`);
          e.style.setProperty('--ds', dr.width / e.offsetWidth);
          e.style.animationDelay = `${delay(k)}ms`;
          e.classList.add('deal');
        });
        if (sq) startSqueeze(cards, sig);
        if (mine(p) && !sq && !ui.noAnim && mode !== 'pass' && !ui.hidden) { // your cards land face down, then turn over by themselves
          setTimeout(() => {
            if (cards.dataset.sig !== sig) return;
            cards.replaceChildren(...p.cards.map((c, k) => {
              const e = cardEl(c, true, 'flip');
              e.style.animationDelay = `${k * 160}ms`;
              return e;
            }));
            audio.flip(); audio.flip(0.16);
          }, delay(p.cards.length - 1) + 380);
        }
      }
    }
    el.classList.toggle('shown', !!sig && face && !mine(p));
    el.classList.toggle('active', g.stage === 'betting' && g.toAct === i);
    el.classList.toggle('folded', p.folded && !p.out);
    el.classList.toggle('out', p.out);
    el.classList.toggle('winner', over && p.won > 0);
    const chips = el.querySelector('.chips');
    if (p.out) { chips.textContent = 'Out'; chips._cur = 0; }
    else {
      fx.roll(chips, pending ? p.chips - p.won : p.chips, over && p.won > 0
        ? { dur: 1100, onTick: mine(p) ? audio.count : undefined }
        : {});
    }
    let hand = '';
    const known = !mine(p) || ui.squeezed; // don't name a hand you haven't looked at yet
    if (!p.folded && face && known && g.board.length >= 3) hand = describe(scoreHand(p.cards, g.board, g.variant), g.variant === 'short');
    const handEl = el.querySelector('.hand');
    if (ui.slowRiver && g.board.length === 5 && g.stage !== 'handOver') { /* river still in the air: don't give it away */ }
    else if (odds && odds[i] !== undefined) { // all-in: show each player's chance of winning
      const pct = `${Math.round(odds[i] * 100)}%`;
      const html = `${hand ? `${hand} ` : ''}<b>${pct}</b>`;
      if (handEl.innerHTML !== html) { handEl.innerHTML = html; fx.pop(handEl, 1.3); }
    } else if (mine(p) && mode !== 'pass' && !ui.hidden && prefs.coach && known && !p.folded && p.cards.length && g.stage !== 'handOver' && g.stage !== 'idle') {
      const html = `${hand ? `${hand} ` : ''}<b>${coachOdds(g)}%</b>`; // coach: rough chance your hand is best
      if (handEl.innerHTML !== html) handEl.innerHTML = html;
    } else if (handEl.textContent !== hand || handEl.children.length) handEl.textContent = hand;
    const badge = el.querySelector('.badge');
    const a = over ? '' : p.lastAction;
    if (badge.textContent !== a) {
      badge.textContent = a;
      badge.className = 'badge ' + (a === 'Fold' ? 'fold' : a.startsWith('All-in') ? 'allin' : /^(Bet|Raise)/.test(a) ? 'raise' : '');
      if (a) fx.pop(badge, 1.5);
    }
    const bet = el.querySelector('.bet');
    if (p.bet) { bet.hidden = false; bet.classList.remove('leaving'); fx.roll(bet.firstChild, p.bet, { dur: 200 }); setPile(bet.lastChild, chipCount(p.bet, 1.7, 10), mine(p) ? ui.scatter : 0); }
    else { bet.hidden = true; bet.firstChild._cur = 0; }
    const d = el.querySelector('.dealer');
    if (g.dealer === i && !d) el.querySelector('.plate').append(h('div', 'dealer', 'D'));
    else if (g.dealer !== i && d) d.remove();
  });

  const board = $('board');
  if (board.children.length > g.board.length) { board.innerHTML = ''; $('burn').innerHTML = ''; }
  const fresh = g.board.length - board.children.length;
  if (fresh > 0 && !ui.noAnim) burnCard();
  for (let i = board.children.length, k = 0; i < g.board.length; i++, k++) {
    const slow = ui.slowRiver && i === 4;
    const wait = BURN_MS + k * 170;
    if (ui.noAnim) { board.append(cardEl(g.board[i], true)); continue; } // putting a table back: no dealing, no sound
    const e = cardEl(g.board[i], true, slow ? 'slam' : 'drop', true);
    // each board card slides out from the deck, which sits just right of the fifth slot
    e.style.setProperty('--dx', `${17.59 - i * 3.382}em`);
    e.style.animationDelay = `${wait}ms`;
    e.firstChild.style.animationDelay = `${wait}ms`; // the card-back cover keeps time with the card
    board.append(e);
    if (!slow) { audio.card(wait / 1000); audio.flip(wait / 1000 + 0.3); }
  }
  if (fresh && !g.players[ME].folded) fx.pop(seatEls[ME].querySelector('.hand'), 1.3);

  // highlight the winning five at showdown
  const hl = new Set();
  if (over && g.result.showdown) {
    for (const s of g.result.winners) for (const c of bestFiveOf(g.players[s].cards, g.board, g.variant)) hl.add(`${s}:${c}`).add(`b:${c}`);
  }
  const mark = (el, key) => {
    el.classList.toggle('hl', hl.has(key));
    el.classList.toggle('dim', hl.size > 0 && !hl.has(key));
  };
  for (const el of board.children) mark(el, `b:${el.dataset.c}`);
  seatEls.forEach((s, i) => { for (const el of s.querySelectorAll('.card[data-c]')) mark(el, `${i}:${el.dataset.c}`); });

  $('pot').hidden = !g.pot || over;
  fx.roll($('pot-n'), over ? 0 : g.pot, { dur: 300 });
  if (g.pot && !over) setPile($('pot-chips'), chipCount(g.pot, 3, 16));
  const msg = over ? g.result.text : '';
  if ($('msg').textContent !== msg) {
    $('msg').textContent = msg;
    $('msg').classList.toggle('show', !!msg);
  }
  const left = g.players.filter((p) => !mine(p) && !p.out && (p.chips > 0 || p.total > 0)).length;
  $('hud').innerHTML = mode === 'daily'
    ? `<b>Daily</b> &middot; <b>${g.sb}/${g.bb}</b><br>Hand <b>${g.handNo}</b> of ${DAILY_HANDS}`
    : mode === 'net' ? `<b>Online ${net?.code || ''}</b> &middot; <b>${g.sb}/${g.bb}</b><br>Hand <b>${g.handNo}</b> &middot; ${net?.watch ? '<b>watching</b>' : `you are <b>${g.players[ME].name}</b>`}${g.watching && !net?.watch ? ` &middot; ${g.watching} watching` : ''}`
    : mode === 'pass' ? `<b>Pass &amp; play</b> &middot; <b>${g.sb}/${g.bb}</b><br>Hand <b>${g.handNo}</b>`
    : mode === 'quick' ? `<b>${g.variant === 'holdem' ? 'Quick' : VARIANTS[g.variant].name}</b> &middot; <b>${g.sb}/${g.bb}</b><br>Hand <b>${g.handNo}</b> &middot; <b>${left}</b> left`
    : `${bossMode ? '<b>Boss</b>' : `Table <b>${table}</b>`} &middot; <b>${g.sb}/${g.bb}</b><br>Hand <b>${g.handNo}</b> &middot; <b>${left}</b> left`;
  ui.reveals = reveals;
  if (replaying) $('hud').innerHTML = `<b>Replay</b><br>Hand <b>${g.handNo}</b>`;
  if (netOn('host') && net.started && !replaying && g === game) netBroadcast();
  renderActions();
}

const BURN_MS = 300;
function burnCard() {
  const e = h('div', 'card burn');
  e.append(h('div', 'in back'));
  e.style.rotate = `${Math.round(Math.random() * 28 - 14)}deg`;
  $('burn').append(e);
  audio.card();
}

// Coach: your chance of winning against the opponents still in, assuming they hold random cards.
let coachCache = { key: '', pct: 0 };
function coachOdds(g) {
  const opp = g.players.filter((p) => !mine(p) && !p.folded).length;
  const key = `${table}:${g.handNo}:${g.board.length}:${opp}`;
  if (coachCache.key !== key) coachCache = { key, pct: Math.round(equity(g.players[ME].cards, g.board, Math.max(1, opp), g.variant === 'omaha' ? 150 : 400, Math.random, g.variant) * 100) };
  return coachCache.pct;
}

// ---------- throwing your chips in ----------
// A quick flick up on the stick (or a swipe up on the buttons) while betting or calling
// throws the chips: they fly harder, land as a messier heap and thump the table, in
// proportion to how fast the flick was. A slow push still just adjusts the bet as before.
function throwBet(power) {
  power = Math.max(0.25, Math.min(1, power));
  if (ui.mode === 'raise') {
    if (flick.raiseBefore) setRaise(flick.raiseBefore, true, true); // undo the nudge the flick itself gave the amount
    ui.throwPower = power;
    confirmRaise();
  } else if (ui.mode === 'actions' && !game.legal(ME).canCheck) {
    ui.throwPower = power;
    choose('call');
  }
}
const flick = { t0: 0, peak: 0, raiseBefore: 0 };
(function watchFlick() {
  const up = overlay ? 0 : upAmount();
  const now = performance.now();
  if (up > 0.2 && !flick.t0) { flick.t0 = now; flick.peak = 0; }
  if (flick.t0) {
    flick.peak = Math.max(flick.peak, up);
    if (up < 0.2) { // released: was it a flick?
      const dt = now - flick.t0;
      if (flick.peak > 0.8 && dt < 240 && (ui.mode === 'raise' || ui.mode === 'actions')) throwBet(1.15 - dt / 240);
      flick.t0 = 0; flick.raiseBefore = 0;
    }
  }
  requestAnimationFrame(watchFlick);
})();
{ // swipe up on the action buttons or the bet panel
  let start = null;
  addEventListener('pointerdown', (e) => { start = e.target.closest?.('#actions') ? { y: e.clientY, t: performance.now() } : null; });
  addEventListener('pointerup', (e) => {
    if (!start) return;
    const dy = start.y - e.clientY, dt = performance.now() - start.t;
    start = null;
    if (dy > 45 && dt < 350) { e.preventDefault(); throwBet((dy / dt) / 1.2); }
  });
}

// ---------- squeezing your cards ----------
// Your hole cards land face down. Hold up on the stick (or D-pad, or drag the cards upward)
// to peel the backs away from the bottom; let go and they settle back. Peel all the way,
// or press A, and they are yours to see. Nothing else waits on it until it is your turn.
let squeeze = null; // { el, sig, peel, drag, done }
function startSqueeze(el, sig) {
  ui.squeezed = false;
  el.classList.remove('revealed');
  el.style.setProperty('--peel', 0);
  squeeze = { el, sig, peel: 0, drag: 0, done: null, ticked: 0 };
  const sq = squeeze;
  const loop = () => {
    if (squeeze !== sq || ui.squeezed) return;
    if (el.dataset.sig !== sig) { squeeze = null; ui.squeezed = true; return; } // the hand is gone
    const target = overlay ? 0 : Math.max(upAmount(), sq.drag);
    sq.peel += (target - sq.peel) * (target > sq.peel ? 0.045 : 0.16);
    el.style.setProperty('--peel', sq.peel.toFixed(3));
    const step = Math.floor(sq.peel * 6);
    if (step !== sq.ticked) { sq.ticked = step; if (target > sq.peel) { audio.slider(sq.peel); fx.rumble(0.1, 0.25, 30); } }
    if (sq.peel >= 0.9) { award('sweat'); return finishSqueeze(); }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
function finishSqueeze() {
  if (ui.squeezed) return;
  ui.squeezed = true;
  const sq = squeeze; squeeze = null;
  sq?.el.classList.add('revealed');
  sq?.el.style.setProperty('--peel', 0);
  audio.flip(); fx.rumble(0.3, 0.6, 80);
  if (ui.mode === 'squeeze') ui.mode = 'wait';
  if (game && game.stage !== 'idle') render();
  sq?.done?.();
}
// Called when it is your turn: you have to look before you act.
function waitForSqueeze() {
  if (ui.squeezed || !squeeze) return Promise.resolve();
  ui.mode = 'squeeze';
  renderActions();
  return new Promise((r) => { squeeze.done = r; });
}
{ // drag the cards upward with a finger or mouse
  let y0 = null;
  addEventListener('pointerdown', (e) => { if (squeeze && e.target.closest?.('.seat.me .cards')) y0 = e.clientY; });
  addEventListener('pointermove', (e) => {
    if (y0 === null || !squeeze) return;
    squeeze.drag = Math.max(0, Math.min(1, (y0 - e.clientY) / (squeeze.el.offsetHeight * 1.1))); // a long, gentle drag so a finger can stop part-way
  });
  for (const ev of ['pointerup', 'pointercancel']) addEventListener(ev, () => { y0 = null; if (squeeze) squeeze.drag = 0; });
}

// Win chances while an all-in is run out; worked out once per street.
let oddsCache = { key: '', odds: null };
function oddsFor(g) {
  const key = `${g.handNo}:${g.board.length}`;
  if (oddsCache.key !== key) {
    const live = g.players.filter((p) => !p.folded);
    const res = runoutOdds(live.map((p) => p.cards), g.board, g.variant === 'omaha' ? 250 : 700, Math.random, g.variant);
    const odds = {};
    live.forEach((p, k) => { odds[p.seat] = res[k]; });
    oddsCache = { key, odds };
  }
  return oddsCache.odds;
}

function presets(L) {
  const g = game, base = g.pot + L.toCall;
  const clamp = (v) => Math.max(L.minTo, Math.min(L.maxTo, Math.round(v / g.sb) * g.sb));
  return [
    ['Min', L.minTo],
    ['½ Pot', clamp(g.currentBet + base / 2)],
    ['Pot', clamp(g.currentBet + base)],
    ['All-in', L.maxTo],
  ];
}

function renderActions() {
  const bar = $('actions');
  bar.innerHTML = '';
  bar.classList.toggle('enter', ui.shown !== ui.mode);
  ui.shown = ui.mode;
  if (ui.mode === 'actions') {
    const L = game.legal(ME);
    const row = h('div', 'row');
    const defs = [
      ['fold', `${glyph('B')}Fold`, () => choose('fold'), false],
      ['call', `${glyph('X')}<span>${L.canCheck ? 'Check' : `Call<small>${L.toCall}</small>`}</span>${prefs.coach && !L.canCheck ? `<em class="need">need ${Math.round((L.toCall / (game.pot + L.toCall)) * 100)}%</em>` : ''}`, () => choose('call'), false],
      ['raise', `${glyph('Y')}${game.currentBet ? 'Raise' : 'Bet'}`, openRaise, !L.canRaise],
    ];
    defs.forEach(([cls, html, fn, disabled], i) => {
      const b = h('button', `btn ${cls}${ui.focus === i ? ' focus' : ''}`, html);
      b.disabled = disabled;
      b.onclick = fn;
      row.append(b);
    });
    bar.append(row);
  } else if (ui.mode === 'raise') {
    const L = game.legal(ME);
    const panel = h('div', 'raise-panel');
    panel.append(h('div', 'amt', `<span id="raise-label"></span><b id="raise-amt"></b>`));
    const slider = h('input');
    Object.assign(slider, { type: 'range', min: L.minTo, max: L.maxTo, step: 1, value: ui.raiseTo });
    slider.id = 'raise-slider';
    slider.oninput = () => setRaise(+slider.value, false);
    panel.append(slider);
    const pr = h('div', 'row presets');
    for (const [label, v] of presets(L)) {
      const b = h('button', 'btn sm', label);
      b.onclick = () => setRaise(v);
      pr.append(b);
    }
    panel.append(pr);
    const row = h('div', 'row');
    const back = h('button', 'btn sm', `${glyph('B')}Back`);
    back.onclick = closeRaise;
    const ok = h('button', 'btn raise focus', `${glyph('A')}Confirm`);
    ok.onclick = confirmRaise;
    row.append(back, h('div', 'flickhint', `${glyph('LB')} ${glyph('RB')}<small>flick &uarr; to throw</small>`), ok);
    panel.append(row);
    bar.append(panel);
    setRaise(ui.raiseTo, true, true);
  } else if (ui.mode === 'replay' || ui.mode === 'replayEnd') {
    const b = h('button', 'btn focus', `${glyph('A')}${ui.mode === 'replayEnd' ? 'Back to game' : 'Stop replay'}`);
    b.onclick = stopReplay;
    bar.append(b);
  } else if (ui.mode === 'squeeze') {
    const b = h('button', 'btn focus', `${glyph('A')}<span>Flip cards<small>or hold &uarr; to squeeze</small></span>`);
    b.onclick = finishSqueeze;
    bar.append(b);
  } else if (ui.mode === 'skip') {
    const b = h('button', 'btn focus', `${glyph('A')}Skip hand`);
    b.onclick = skipHand;
    bar.append(b);
  } else if (ui.mode === 'continue') {
    const b = h('button', 'btn call focus', `${glyph('A')}Next hand`);
    b.onclick = () => { audio.confirm(); finish(); };
    bar.append(b);
  }
}

function setRaise(v, moveSlider = true, silent = false) {
  const L = game.legal(ME);
  const prev = ui.raiseTo;
  ui.raiseTo = Math.max(L.minTo, Math.min(L.maxTo, Math.round(v)));
  const amt = $('raise-amt');
  amt.textContent = ui.raiseTo.toLocaleString();
  const allIn = ui.raiseTo === L.maxTo;
  $('raise-label').textContent = allIn ? 'All-in' : game.currentBet ? 'Raise to' : 'Bet';
  amt.classList.toggle('max', allIn);
  if (moveSlider) $('raise-slider').value = ui.raiseTo;
  if (!silent && prev !== ui.raiseTo) {
    audio.slider((ui.raiseTo - L.minTo) / Math.max(1, L.maxTo - L.minTo));
    if (moveSlider) fx.pop(amt, allIn ? 1.35 : 1.15, 200);
  }
}

let toastTimer;
function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

// ---------- human turn ----------
function finish(action) {
  const r = ui.resolve;
  ui.resolve = null;
  ui.mode = 'wait';
  renderActions();
  r?.(action);
}
function prompt(mode) {
  ui.mode = mode;
  ui.focus = 1;
  renderActions();
  return new Promise((r) => { ui.resolve = r; });
}
// You've folded: jump straight to the result instead of watching the rest play out.
function skipHand() {
  if (ui.mode !== 'skip') return;
  audio.confirm();
  fast = true;
  audio.hush(true);
  ui.mode = 'wait';
  renderActions();
}
function choose(type) {
  if (ui.mode === 'actions') finish({ type });
}
function openRaise() {
  const L = game.legal(ME);
  if (ui.mode !== 'actions' || !L.canRaise) return;
  audio.confirm();
  ui.mode = 'raise';
  ui.raiseTo = presets(L)[1][1];
  renderActions();
}
function closeRaise() { audio.back(); ui.mode = 'actions'; ui.focus = 2; renderActions(); }
function confirmRaise() { if (ui.mode === 'raise') finish({ type: 'raise', amount: ui.raiseTo }); }

// ---------- overlay (start / pause / game over) ----------
const CONTROLS = `<table>
<tr><td>${glyph('A')} / Enter</td><td>Confirm</td></tr>
<tr><td>${glyph('B')} / Esc</td><td>Fold &middot; Back</td></tr>
<tr><td>${glyph('X')} / C</td><td>Check &middot; Call</td></tr>
<tr><td>${glyph('Y')} / R</td><td>Bet &middot; Raise</td></tr>
<tr><td>D-pad / Stick</td><td>Move &middot; Adjust bet (&uarr;&darr; = big steps)</td></tr>
<tr><td>${glyph('LB')} ${glyph('RB')} / Q E</td><td>Bet presets</td></tr>
<tr><td>Start / P</td><td>Menu</td></tr></table>`;

// items: [label | () => label, fn, keepOpen]
function showOverlay({ title, body, items, closable = false, compact = false, wide = false, perky = false, onClose }) {
  overlay = { items, focus: 0, closable, onClose, cols: compact ? 2 : 1 };
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
function closeOverlay() { overlay = null; $('overlay').hidden = true; }
function overlayFocus(d) {
  const n = overlay.items.length;
  if (n > 1) audio.tick();
  overlay.focus = (overlay.focus + d + n) % n;
  [...$('overlay').querySelectorAll('.items .btn')].forEach((b, i) => {
    b.classList.toggle('focus', i === overlay.focus);
    b.classList.toggle('call', i === overlay.focus);
  });
}

const TITLE = '<span class="logo">Poker<span>Pad</span></span>';
const best = () => { try { return +localStorage.getItem('padpoker.best') || 0; } catch { return 0; } };
const tables = (n) => `${n} table${n === 1 ? '' : 's'}`;
function startScreen() {
  const saved = loadSave();
  const record = best() ? ` Your best run: ${tables(best())} cleared.` : '';
  showOverlay({
    title: TITLE,
    body: `<p>No-limit Texas Hold'em. Knock out every opponent to clear a table and climb to the next.${record}</p>${CONTROLS}`,
    items: saved
      ? [[`${glyph('A')}Continue \u2013 ${saved.boss ? 'Boss' : `Table ${saved.table}`}`, () => startTable(saved.table, saved)], ['New run', () => startTable(1)], ['More games', moreGames], ['Stats', () => statsScreen(startScreen)], ['Settings', () => settingsMenu(startScreen)], ['Help', () => helpMenu(startScreen)]]
      : [[`${glyph('A')}Play`, firstPlay], ['More games', moreGames], ['Stats', () => statsScreen(startScreen)], ['Settings', () => settingsMenu(startScreen)], ['Help', () => helpMenu(startScreen)]],
  });
}
function firstPlay() {
  let seen = true;
  try { seen = !!localStorage.getItem('padpoker.seen'); } catch { /* private mode */ }
  if (seen) startTable(1); else howTo(0, () => startTable(1), true);
}
// Leave the table for the title screen. A run or daily deal is kept exactly where it is,
// to carry on later; if you walk away in the middle of a hand, that hand counts as folded
// (your chips already in the pot are gone, everyone else gets theirs back).
function exitToMenu() {
  const g = game, kind = mode;
  if (kind === 'net') leaveOnline();
  else if (g && (kind === 'run' || kind === 'daily') && ['betting', 'streetEnd'].includes(g.stage)) {
    const me = g.players[ME];
    const chips = g.players.map((p) => (p === me ? p.chips : p.chips + p.total));
    if (me.chips > 0) { // (all-in and walking away would bust you: that hand is simply dealt again instead)
      writeSave({ table, boss: bossMode, chips, dealer: g.dealer, handNo: g.handNo, habits, run: runStats, perks, mem: memory });
      if (!me.folded && me.total > 0) setTimeout(() => toast('Saved. The hand you left counts as folded.'), 300);
    }
  }
  runId++; // stops the game loop
  fast = false; audio.hush(false); audio.tension(false); audio.musicLevel(0);
  game = null; ME = 0; mode = 'run'; squeeze = null;
  Object.assign(ui, { mode: 'wait', resolve: null, squeezed: true, hidden: false, slowRiver: false, scatter: 0 });
  toggleEmotes(false);
  for (const id of ['seats', 'board', 'burn', 'hud']) $(id).innerHTML = '';
  $('pot').hidden = true; $('msg').textContent = ''; $('msg').classList.remove('show');
  $('app').classList.remove('zoom', 'omaha');
  renderActions();
  startScreen();
}
function pauseMenu() {
  audio.tick();
  showOverlay({
    title: TITLE, body: CONTROLS, closable: true,
    items: [
      ['Resume'],
      ...(mode === 'net' ? [] : [['Hands', () => handsScreen(pauseMenu)]]), // no replays while others are waiting on you
      ['Stats', () => statsScreen(pauseMenu)],
      ['Help', () => helpMenu(pauseMenu)],
      ['Settings', () => settingsMenu(pauseMenu)],
      mode === 'net' ? ['Leave game', exitToMenu] : [mode === 'run' || mode === 'daily' ? 'Save & main menu' : 'Quit to menu', exitToMenu],
    ],
  });
}
function statsScreen(back) {
  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '\u2013');
  const tile = (v, label) => `<div><b>${v}</b>${label}</div>`;
  showOverlay({
    title: 'Stats', closable: true, onClose: back,
    body: `<div class="stats">
      ${tile(best(), 'best run (tables)')}${tile(stats.tables, 'tables cleared')}${tile(stats.knockouts, 'knock-outs')}
      ${tile(stats.hands.toLocaleString(), 'hands played')}${tile(pct(stats.won, stats.hands), 'hands won')}${tile(stats.biggest.toLocaleString(), 'biggest pot')}
      ${tile(pct(stats.showdownsWon, stats.showdowns), 'showdowns won')}${tile(pct(stats.allinsWon, stats.allins), 'all-ins won')}${tile(stats.bestHand || '\u2013', 'best hand')}
    </div>`,
    items: [[`Stickers ${stickerCount()}/${STICKERS.length}`, () => stickersScreen(() => statsScreen(back))], ['Notebook', () => notebookScreen(() => statsScreen(back))], [`${glyph('B')}Back`, back]],
  });
}
function handsScreen(back, at = history.length - 1) {
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

// ---------- review: how did you play it? ----------
// Judges each of your decisions in a hand from two numbers taken at the time: your rough
// chance of winning (against random cards for everyone still in) and the price of a call.
function judge(d) {
  const e = Math.round(d.eq * 100), n = Math.round(d.need * 100);
  if (d.type === 'fold') {
    return d.eq > d.need + 0.1 ? ['bad', 'Fold', `Folding gave up a good price: you were about ${e}% to win and only needed ${n}%.`]
      : ['good', 'Fold', `A sound fold: about ${e}% to win against the ${n}% the call needed.`];
  }
  if (d.type === 'call') {
    if (d.eq < d.need - 0.08) return ['bad', `Call ${d.toCall}`, `Too loose: about ${e}% to win, but the call needed ${n}%.`];
    if (d.eq > 0.7) return ['meh', `Call ${d.toCall}`, `Fine, but at about ${e}% to win a raise would have built a bigger pot.`];
    return ['good', `Call ${d.toCall}`, `A fair call: about ${e}% to win for a price that needed ${n}%.`];
  }
  if (d.type === 'check') {
    return d.eq > 0.7 ? ['meh', 'Check', `Missed value: you were about ${e}% to have the best hand and bet nothing.`]
      : ['good', 'Check', `Nothing to bet with at about ${e}%. ${d.street === 'river' ? 'Checking was fine.' : 'Taking a free card was fine.'}`];
  }
  const what = `${d.toCall ? 'Raise to' : 'Bet'} ${d.to}`;
  if (d.eq < 0.35) return ['bluff', what, `A bluff: only about ${e}% to win if called, so it needed them to fold.`];
  if (d.eq > 0.6) return ['good', what, `Betting for value at about ${e}% to win.`];
  return ['meh', what, `A thin bet at about ${e}%: fine against few players, risky against many.`];
}
const MARK = { good: '\u2713', meh: '!', bad: '\u2717', bluff: '~' };
// hands: a list to step through (most interesting first); back: where B goes
function reviewScreen(hands, at, back) {
  const hnd = hands[at];
  const rows = hnd.mine.map((d) => {
    const [kind, what, why] = judge(d);
    return `<tr><td><span class="mark ${kind}">${MARK[kind]}</span></td><td>${d.street[0].toUpperCase() + d.street.slice(1)}<br><b>${what}</b></td><td>${why}</td></tr>`;
  }).join('') || '<tr><td></td><td colspan="2">You were not in this hand long enough to make a decision.</td></tr>';
  const items = [];
  if (at < hands.length - 1) items.push([`${glyph('A')}Next hand`, () => reviewScreen(hands, at + 1, back)]);
  if (hnd.deck) items.push(['Replay', () => replayHand(hnd, () => reviewScreen(hands, at, back))]);
  items.push([`${glyph('B')}Back`, back]);
  showOverlay({
    title: 'Review', closable: true, onClose: back, wide: true, items,
    body: `<p>${hnd.where}, hand ${hnd.no} &middot; you held ${cardsText(hnd.hole)}${hnd.board?.length ? ` &middot; board ${cardsText(hnd.board)}` : ''} &middot; <b>${hnd.net >= 0 ? '+' : ''}${hnd.net.toLocaleString()}</b>${hands.length > 1 ? ` &middot; ${at + 1} of ${hands.length}` : ''}</p>
      <table class="log review">${rows}</table><p class="note">Chances are estimates that assume everyone else holds random cards, so they run high when someone is betting strongly.</p>`,
  });
}
// The hands that mattered most: the biggest swings, losses first.
const keyHands = () => [...history].filter((x) => x.mine.length).sort((a, b) => Math.abs(b.net) - Math.abs(a.net)).slice(0, 5).sort((a, b) => a.net - b.net);

// ---------- replay: play a recorded hand back on the table ----------
// The live game is frozen (see rawSleep) while a throwaway game is fed the recorded deck and
// actions through the normal renderer, then everything is put back exactly as it was.
function castFor(name) {
  if (name === 'You') return YOU;
  const b = BOSSES.find((x) => x.name === name);
  return { name, ...(b || CHARACTERS[name] || {}) };
}
async function replayHand(log, done) {
  const live = { game, cast, ME, mode: ui.mode, resolve: ui.resolve, squeezed: ui.squeezed, peek: peekSeat, settled, hidden: ui.hidden, mat: getComputedStyle($('app')).getPropertyValue('--mat') };
  replaying = true; replayStop = false;
  closeOverlay();
  toggleEmotes(false);
  cast = log.cast.map(castFor);
  game = new Game({ players: cast, handsPerLevel: log.before.per, variant: log.variant || 'holdem' });
  setVariantLook(game.variant);
  game.players.forEach((p, i) => { p.chips = log.before.chips[i]; });
  game.dealer = log.before.dealer; game.handNo = log.before.handNo;
  game.nextDeck = [...log.deck];
  ME = 0; peekSeat = -1; settled = false;
  Object.assign(ui, { squeezed: true, hidden: false, mode: 'replay', resolve: null, slowRiver: false, scatter: 0 });
  $('app').style.setProperty('--mat', log.mat);
  buildSeats();
  $('msg').textContent = ''; $('msg').classList.remove('show');
  const g = game;
  g.startHand();
  fx.shuffle($('deck')); audio.shuffle();
  render();
  await tick(SHUFFLE_MS + (g.variant === 'omaha' ? 4 : 2) * g.players.length * DEAL_GAP + 700);
  const streets = async () => {
    while (!replayStop && g.stage === 'streetEnd') { await collectBets(tick); await tick(300); g.nextStreet(); render(); await tick(g.stage === 'handOver' ? 300 : 900); }
  };
  for (const a of log.actions) {
    await streets();
    if (replayStop || g.stage !== 'betting') break;
    await tick(650);
    if (replayStop) break;
    const p = g.players[g.toAct], pot = g.pot;
    g.act(a.type, a.amount);
    render();
    actionFx(p, pot);
  }
  await streets();
  if (!replayStop) {
    settled = true;
    render();
    await new Promise((res) => { ui.mode = 'replayEnd'; ui.resolve = res; renderActions(); });
  }
  // put the live game back
  ({ game, cast, ME } = live);
  peekSeat = live.peek; settled = live.settled;
  Object.assign(ui, { mode: live.mode, resolve: live.resolve, squeezed: live.squeezed, hidden: live.hidden });
  $('app').style.setProperty('--mat', live.mat);
  setVariantLook(game.variant);
  ui.noAnim = true; buildSeats(); render(); ui.noAnim = false;
  replaying = false;
  done();
}
function stopReplay() {
  if (!replaying) return;
  audio.back();
  replayStop = true; // the replay loop sees this, unwinds and puts the live table back
  if (ui.mode === 'replayEnd') ui.resolve?.();
}
const RANKS_REF = [
  ['Royal Flush', 'As Ks Qs Js Ts'], ['Straight Flush', '9h 8h 7h 6h 5h'], ['Four of a Kind', 'Qs Qh Qd Qc 4s'],
  ['Full House', 'Ks Kh Kd 7c 7s'], ['Flush', 'Ad Jd 8d 5d 2d'], ['Straight', 'Ts 9d 8c 7h 6s'],
  ['Three of a Kind', '8s 8h 8d Kc 3s'], ['Two Pair', 'Js Jd 5c 5h As'], ['Pair', '9s 9h Ad 7c 4s'], ['High Card', 'As Jd 8c 6h 3s'],
];
// A three-step primer for people new to poker. Shown before the first game and from Help.
const HOWTO = [
  ['The <span>goal</span>', `<p>Everyone gets two cards of their own. Five more are dealt face up in the middle for all to share: three (the flop), then one (the turn), then one (the river).</p>
    <p>Win the pot by holding the best five-card hand at the end, or by betting so that everyone else folds.</p>`],
  ['Your <span>turn</span>', `<table>
    <tr><td>${glyph('B')} Fold</td><td>Give up this hand. You lose what you've already put in.</td></tr>
    <tr><td>${glyph('X')} Check</td><td>Pass, when nobody has bet yet.</td></tr>
    <tr><td>${glyph('X')} Call</td><td>Match the current bet to stay in.</td></tr>
    <tr><td>${glyph('Y')} Bet / Raise</td><td>Put more in, then choose how much.</td></tr></table>
    <p>Two players post small forced bets (the blinds) each hand, so there is always something to win. The blinds grow over time.</p>`],
  ['The <span>run</span>', `<p>Knock out every opponent to clear a table and move up to a tougher one. Lose all your chips and the run is over.</p>
    <p>Not sure what beats what? Hand ranks is in the menu under Help. Coach, in Settings, shows your chance of winning as you play.</p>`],
];
function howTo(step, done, firstRun = false) {
  const last = step === HOWTO.length - 1;
  const finish = () => { try { localStorage.setItem('padpoker.seen', '1'); } catch { /* private mode */ } done(); };
  const items = last
    ? [[`${glyph('A')}${firstRun ? "Let's play" : 'Got it'}`, finish]]
    : [[`${glyph('A')}Next`, () => howTo(step + 1, done, firstRun)], ['Skip', finish]];
  if (last && firstRun) items.push(['Play with Coach on', () => { prefs.coach = true; applyPrefs(); finish(); }]);
  showOverlay({ title: HOWTO[step][0], body: `<p class="venue">How to play &middot; ${step + 1} of ${HOWTO.length}</p>${HOWTO[step][1]}`, wide: true, items });
}
function helpMenu(back) {
  showOverlay({
    title: 'Help', closable: true, onClose: back, body: CONTROLS,
    items: [
      ['How to play', () => howTo(0, () => helpMenu(back))],
      ['Hand ranks', () => ranksScreen(() => helpMenu(back))],
      [`${glyph('B')}Back`, back],
    ],
  });
}
function ranksScreen(back) {
  const parse = (str) => str.split(' ').map((x) => RANKS.indexOf(x[0]) * 4 + 'shdc'.indexOf(x[1]));
  const rows = RANKS_REF.map(([name, ex], i) => `<div><i>${i + 1}</i><b>${name}</b><span>${cardsText(parse(ex))}</span></div>`).join('');
  showOverlay({
    title: 'Hand ranks', closable: true, onClose: back, wide: true,
    body: `<p>Best at the top. Your hand is the best five cards from your two plus the board. At short-deck tables a flush beats a full house; in Omaha you must use exactly two of your four.</p><div class="ranks">${rows}</div>`,
    items: [[`${glyph('B')}Back`, back]],
  });
}
function settingsMenu(back) {
  const onOff = (v) => (v ? 'On' : 'Off');
  const set = (fn) => () => { fn(); applyPrefs(); };
  showOverlay({
    title: 'Settings', compact: true, closable: true, onClose: back,
    body: `<p>Difficulty changes how well opponents play (Shark also gives them bigger stacks) and applies from the next table, as does stack size. Speed changes how long opponents and deals take. Left-handed moves the buttons to the left. Coach shows your rough chance of winning and the odds a call needs.</p>`,
    items: [
      [() => `Difficulty: ${prefs.difficulty}`, set(() => { prefs.difficulty = cycle(DIFFICULTY, prefs.difficulty); }), true],
      [() => `Speed: ${prefs.speed}`, set(() => { prefs.speed = cycle(PACE, prefs.speed); }), true],
      [() => `Stacks: ${prefs.stack}`, set(() => { prefs.stack = cycle(STACKS, prefs.stack); }), true],
      [() => `Left-handed: ${onOff(prefs.lefty)}`, set(() => { prefs.lefty = !prefs.lefty; }), true],
      [() => `Sound: ${onOff(audio.settings.sfx)}`, () => audio.setSfx(!audio.settings.sfx), true],
      [() => `Music: ${onOff(audio.settings.music)}`, () => audio.setMusic(!audio.settings.music), true],
      fx.hapticSupport() === 'none' && fx.isIOS
        ? ['Rumble: not on iPhone', () => toast('iPhone and iPad don\u2019t let web apps vibrate or rumble a controller'), true, true]
        : [() => `Rumble: ${onOff(prefs.rumble)}`, set(() => {
          prefs.rumble = !prefs.rumble;
          if (!prefs.rumble) return;
          setTimeout(() => fx.haptic('win1'), 30); // a test buzz, from wherever this device can make one
          const how = fx.hapticSupport();
          toast(how === 'controller' ? 'Rumbling the controller' : how === 'phone' ? 'No controller rumble: using the phone\u2019s vibration' : 'Nothing here can vibrate: connect a controller with rumble');
        }), true],
      [() => `Table talk: ${onOff(prefs.chatter)}`, set(() => { prefs.chatter = !prefs.chatter; }), true],
      [() => `Card back: ${prefs.back}`, set(() => {
        const mine = unlockedBacks();
        prefs.back = mine[(mine.indexOf(prefs.back) + 1) % mine.length];
        const next = Object.keys(BACKS).find((k) => BACKS[k] > bestRun());
        if (mine.length === 1 && next) toast(`Clear ${tables(BACKS[next])} in a run to unlock ${next}`);
      }), true],
      [() => `Deck: ${prefs.fourColour ? '4-colour' : '2-colour'}`, set(() => { prefs.fourColour = !prefs.fourColour; }), true],
      [() => `Squeeze cards: ${onOff(prefs.squeeze)}`, set(() => { prefs.squeeze = !prefs.squeeze; }), true],
      [() => `Coach: ${onOff(prefs.coach)}`, set(() => { prefs.coach = !prefs.coach; if (game && game.stage !== 'idle') render(); }), true],
      [`${glyph('B')}Back`, back],
    ],
  });
}
function tableIntro(start) {
  const cfg = tableConfig(table, bossMode);
  if (bossMode) {
    return showOverlay({
      title: 'Boss <span>fight</span>',
      body: `<p class="venue">${cfg.venue}</p><p>One on one. Beat ${cfg.boss.name} to carry on; lose and the run is over.</p><p class="who"><b>${cfg.boss.tag}:</b> ${cfg.boss.trick}</p>${perkSummary() ? `<p class="who">Your perks: ${perkSummary()}</p>` : ''}`,
      items: [[`${glyph('A')}Sit down`, start]],
    });
  }
  const who = cfg.names.map((n) => `<b>${n}</b> <i>${CHARACTERS[n].tag}</i>`).join(' &middot; ');
  showOverlay({
    title: `Table <span>${table}</span>`,
    body: `<p class="venue">${cfg.venue}</p><p>Knock out all ${cfg.names.length} to move up. Everyone starts with ${cfg.chips.toLocaleString()}. Blinds rise every ${cfg.handsPerLevel} hands.${prefs.difficulty !== 'Standard' ? ` Difficulty: ${prefs.difficulty}.` : ''}</p>${cfg.variant !== 'holdem' ? `<p class="who">This table plays <b>${VARIANTS[cfg.variant].name}</b>. ${VARIANTS[cfg.variant].rules}</p>` : ''}${cfg.twist ? `<p class="who">Twist: <b>${cfg.twist.name}</b> &ndash; ${cfg.twist.text}</p>` : ''}<p class="who">${who}</p>${cfg.names.some(grudge) ? `<p>${cfg.names.filter(grudge).join(' and ')} ${cfg.names.filter(grudge).length > 1 ? 'remember' : 'remembers'} you knocked them out, and will come after you.</p>` : ''}${perkSummary() ? `<p class="who">Your perks: ${perkSummary()}</p>` : ''}`,
    items: [[`${glyph('A')}Deal me in`, start]],
  });
}
// The moment you take the last chip: the losers' tiles topple, chips rain, a fanfare plays,
// and only then does the result screen come up.
async function tableCleared() {
  const id = runId;
  audio.musicLevel(0);
  ui.mode = 'wait'; renderActions();
  seatEls.forEach((el, i) => { if (i !== ME) setTimeout(() => el.classList.add('toppled'), 150 + i * 130); });
  setMood(ME, 'happy');
  audio.fanfare();
  fx.banner(bossMode ? 'Boss beaten!' : 'Table cleared!', 'info');
  fx.chipRain(46);
  fx.burst(seatEls[ME].querySelector('.cards'), 50);
  setTimeout(() => { fx.shake(7, 500); fx.rumble(1, 1, 400); fx.burst($('center'), 50); }, 620);
  await tick(2600);
  if (id !== runId) return;
  showCleared();
}
function showCleared() {
  if (bossMode) { // beat the boss: on to the next table
    award({ Vera: 'house_loses', Otto: 'harpooned', Stone: 'rock_breaker' }[bossFor(table).name]);
    stats.bosses = (stats.bosses || 0) + 1; saveStats();
    writeSave({ table: table + 1, habits, run: runStats, perks, mem: memory, owed: true });
    const b = bossFor(table);
    return showOverlay({
      title: 'Boss <span>beaten!</span>',
      body: `<p>${b.name} is out of chips after ${game.handNo} hands. Next up: ${tableConfig(table + 1).venue}.</p>`,
      items: [[`${glyph('A')}Carry on`, () => startTable(table + 1, loadSave())]],
    });
  }
  if (table >= 1) award('regular');
  if (table >= 3) award('made_it');
  if (table >= 5) award('vault');
  if (game.handNo <= 15) award('speedrun');
  const before = best();
  try { localStorage.setItem('padpoker.best', Math.max(before, table)); } catch { /* private mode */ }
  const prize = Object.keys(BACKS).find((k) => BACKS[k] > before && BACKS[k] <= table);
  const bossNext = table % 3 === 0;
  writeSave({ table: bossNext ? table : table + 1, boss: bossNext, habits, run: runStats, perks, mem: memory, owed: true });
  stats.tables++; saveStats();
  const next = bossNext ? `a boss: ${bossFor(table).name}, ${bossFor(table).tag}` : `${tableConfig(table + 1).venue}, and it's tougher`;
  showOverlay({
    title: 'Table <span>cleared!</span>',
    body: `<p>You took every chip at Table ${table} in ${game.handNo} hands. Next up: ${next}.</p>${prize ? `<p class="who">New card back unlocked: <b>${prize}</b>. Switch to it in Settings.</p>` : ''}`,
    items: [[`${glyph('A')}${bossNext ? 'Face the boss' : `Table ${table + 1}`}`, () => { const sv = loadSave(); startTable(sv.table, sv); }]],
  });
}
function busted() {
  audio.musicLevel(0);
  audio.lose();
  writeSave(null);
  bustSummary();
}
function bustSummary() {
  const cleared = bossMode ? table : table - 1;
  const r = runStats;
  const tile = (v, label) => `<div><b>${v}</b>${label}</div>`;
  const record = cleared > r.startBest ? '<p class="venue">New best run!</p>' : `<p>Best run: ${tables(best())} cleared.</p>`;
  showOverlay({
    title: 'Busted', wide: true,
    body: `<p>${bossMode ? `Beaten by ${bossFor(table).name}, ${bossFor(table).tag}, after Table ${table}.` : `Out at Table ${table}, ${tableConfig(table).venue}.`}</p>${record}<div class="stats">
      ${tile(cleared, 'tables cleared')}${tile(r.knockouts, 'knock-outs')}${tile(r.hands, 'hands played')}
      ${tile(r.hands ? `${Math.round((r.won / r.hands) * 100)}%` : '\u2013', 'hands won')}${tile(r.biggest.toLocaleString(), 'biggest pot')}${tile(r.bestHand || '\u2013', 'best hand')}
    </div>`,
    items: [[`${glyph('A')}New run`, () => startTable(1)], ...(keyHands().length ? [['Review key hands', () => reviewScreen(keyHands(), 0, bustSummary)]] : []), ['Share', () => share(runCard(), 'pad-poker-run.png'), true], ['Stats', () => statsScreen(bustSummary)]],
  });
}

// ---------- input ----------
function onButton(b) {
  if (!audio.unlock() && !onButton.warned) {
    onButton.warned = true;
    toast('Tap the screen once to turn sound on');
  }
  if (overlay) {
    if (overlay.onKey?.(b)) return;
    if (b === 'up') overlayFocus(-overlay.cols);
    else if (b === 'down') overlayFocus(overlay.cols);
    else if (b === 'left') overlayFocus(-1);
    else if (b === 'right') overlayFocus(1);
    else if (b === 'a') $('overlay').querySelectorAll('.items .btn')[overlay.focus].click();
    else if ((b === 'b' || b === 'start') && overlay.closable) { const done = overlay.onClose; audio.back(); closeOverlay(); done?.(); }
    return;
  }
  if (replaying) { if (['a', 'b', 'x', 'start'].includes(b)) stopReplay(); return; }
  if (!$('emotes').hidden) { // table talk is open: a direction says it, anything else closes it
    const e = EMOTES.find((x) => x[0] === b);
    if (e) sendEmote(e[3]); else if (b === 'a' && mode === 'net') chatEntry(); else toggleEmotes(false);
    return;
  }
  if (b === 'rb' && ui.mode !== 'raise') return toggleEmotes(true);
  if (b === 'start') return pauseMenu();
  if (ui.mode === 'actions') {
    const L = game.legal(ME);
    const n = L.canRaise ? 3 : 2;
    const move = (d) => {
      const f = Math.max(0, Math.min(n - 1, ui.focus + d));
      if (f !== ui.focus) { ui.focus = f; audio.tick(); renderActions(); }
    };
    if (b === 'left') move(-1);
    else if (b === 'right') move(1);
    else if (b === 'a') [() => choose('fold'), () => choose('call'), openRaise][ui.focus]();
    else if (b === 'b') L.canCheck ? toast('Checking is free — press X to check') : choose('fold');
    else if (b === 'x') choose('call');
    else if (b === 'y') L.canRaise ? openRaise() : toast("Can't raise here");
  } else if (ui.mode === 'raise') {
    const L = game.legal(ME);
    const step = game.bb;
    const ps = [...new Set(presets(L).map((p) => p[1]))].sort((x, y) => x - y);
    if (b === 'left') setRaise(ui.raiseTo - step);
    else if (b === 'right') setRaise(ui.raiseTo + step);
    else if (b === 'down') setRaise(ui.raiseTo - step * 5);
    else if (b === 'up') { flick.raiseBefore = ui.raiseTo; setRaise(ui.raiseTo + step * 5); } // remembered in case this turns out to be a flick
    else if (b === 'lb') setRaise(ps.filter((v) => v < ui.raiseTo).pop() ?? L.minTo);
    else if (b === 'rb') setRaise(ps.find((v) => v > ui.raiseTo) ?? L.maxTo);
    else if (b === 'a' || b === 'y') confirmRaise();
    else if (b === 'b') closeRaise();
  } else if (ui.mode === 'squeeze') {
    if (b === 'a' || b === 'x') finishSqueeze();
  } else if (ui.mode === 'skip') {
    if (b === 'a' || b === 'x') skipHand();
  } else if (ui.mode === 'continue') {
    if (b === 'a' || b === 'x') { audio.confirm(); finish(); }
  }
}

// ---------- effects tied to game events ----------
function actionFx(p, potBefore) {
  if (fast) return;
  netEffect('act', { seat: p.seat, pot: potBefore });
  { // your own actions each have their own feel; other players' bets are a faint nudge
    const a0 = p.lastAction;
    const kind = a0 === 'Fold' ? 'fold' : a0 === 'Check' ? 'check' : a0.startsWith('Call') ? 'call' : a0.startsWith('All-in') ? '' : 'raise';
    if (mine(p)) fx.haptic(kind); else if (kind === 'raise') fx.haptic('nudge');
  }
  const el = seatEls[p.seat];
  const a = p.lastAction;
  const bet = el.querySelector('.bet');
  if (a === 'Fold') return audio.fold();
  if (a === 'Check') return audio.check();
  const size = p.bet / Math.max(potBefore, 1);
  const allIn = a.startsWith('All-in');
  const thrown = mine(p) ? ui.throwPower : 0; // how hard you threw it, 0 if you just placed it
  ui.throwPower = 0;
  if (mine(p)) { ui.scatter = Math.round(thrown * 10) / 10; if (thrown) setPile(bet.lastChild, chipCount(p.bet, 1.7, 10), ui.scatter); }
  fx.flyChips(el.querySelector('.plate'), bet, (allIn ? 8 : size > 0.6 ? 4 : 2) + Math.round(thrown * 6), { stagger: thrown ? 18 : 35, spread: 1 + thrown * 2.2 });
  if (thrown) { audio.thrown(thrown); setTimeout(() => { fx.shake(2 + thrown * 6, 260); fx.haptic(thrown > 0.6 ? 'slam' : 'raise'); }, 330); }
  fx.pop(bet, allIn ? 1.7 : 1.35);
  fx.pop($('pot'), 1.12);
  if (allIn) {
    if (!p.isHuman && Math.random() < 0.7) setTimeout(() => say(p, 'allin'), 500);
    for (const q of game.players) if (q !== p && !q.folded && !q.out) setTimeout(() => setMood(q.seat, 'shock', 1500), 450);
    audio.allin();
    fx.haptic('allin');
    setTimeout(() => { fx.shake(10, 500); fx.banner('All in!'); }, 450);
  } else {
    if (a.startsWith('Call')) audio.chips(2, 0.05);
    else audio.raise(size > 0.6 ? 4 : 3);
    if (/^(Bet|Raise)/.test(a) && size > 0.6) fx.shake(3, 220);
  }
}

async function collectBets(wait = sleep) { // replays pass their own timer, since the game's is frozen during a replay
  if (fast) return;
  netEffect('collect');
  const bets = seatEls.map((el) => el.querySelector('.bet')).filter((b) => !b.hidden);
  if (!bets.length) return;
  for (const b of bets) { fx.flyChips(b, $('pot'), 2, { stagger: 30 }); b.classList.add('leaving'); }
  audio.chips(Math.min(5, bets.length + 1), 0.3, -3);
  await wait(420);
  fx.pop($('pot'), 1.2);
}

function handOverFx() {
  netEffect('over');
  const g = game, me = g.players[ME];
  lastWinner = g.result.winners[0];
  for (const p of g.players) {
    if (p.out) continue;
    if (p.won > 0) setMood(p.seat, 'happy');
    else if (p.chips === 0 || (g.result.showdown && !p.folded)) setMood(p.seat, 'sad');
  }
  const total = g.players.reduce((s, p) => s + p.won, 0);
  for (const s of g.result.winners) {
    const p = g.players[s], plate = seatEls[s].querySelector('.plate');
    const n = Math.max(4, Math.min(14, Math.round(p.won / g.bb / 2)));
    fx.flyChips($('center'), plate, n, { stagger: 50, onLand: (i) => { if (i % 2 === 0) audio.chips(1, 0, i / 2); } });
    setTimeout(() => fx.floatText(plate, `+${p.won.toLocaleString()}`, mine(p) ? 'big' : ''), 350);
  }
  if (me.won > 0) {
    const size = me.won >= total && me.won > 40 * g.bb ? 3 : me.won > 12 * g.bb ? 2 : 1;
    audio.win(size);
    setTimeout(() => {
      fx.burst(seatEls[ME].querySelector('.cards'), 14 + size * 14);
      if (size > 1) fx.shake(size * 3, 400);
      fx.haptic(size >= 3 ? 'win3' : 'win1');
    }, 250);
  } else if (!me.folded && g.result.showdown) { audio.lose(); fx.haptic('lose'); }
  else audio.win(0);
}

// ---------- shareable result cards ----------
async function share(card, name) {
  toast('Making your card\u2026');
  const res = await shareCard(card, name).catch(() => 'failed');
  toast(res === 'saved' ? 'Card saved as an image' : res === 'failed' ? "Couldn't make the card" : 'Shared');
}
function runCard() {
  const cleared = bossMode ? table : table - 1, r = runStats;
  return {
    kicker: 'My run', title: `${tables(cleared)} cleared`,
    sub: bossMode ? `Beaten by ${bossFor(table).name}, ${bossFor(table).tag}` : `Out at Table ${table}, ${tableConfig(table).venue}`,
    accent: tableConfig(table, bossMode).mat,
    tiles: [[r.knockouts, 'knock-outs'], [r.hands, 'hands played'], [r.hands ? `${Math.round((r.won / r.hands) * 100)}%` : '\u2013', 'hands won'],
      [r.biggest.toLocaleString(), 'biggest pot'], [r.bestHand ? r.bestHand.split(',')[0] : '\u2013', 'best hand'], [`${stickerCount()}/${STICKERS.length}`, 'stickers']],
  };
}
function dailyCard() {
  const d = dailyData(), t = today(), all = Object.values(d.scores);
  return {
    kicker: `Daily deal \u00b7 ${t}`, title: `${(d.scores[t] ?? 0).toLocaleString()} chips`, sub: `from 1,000 over ${DAILY_HANDS} hands`, accent: DAILY_CFG.mat,
    tiles: [[all.length, 'days played'], [Math.max(...all, 0).toLocaleString(), 'best day'], [`${stickerCount()}/${STICKERS.length}`, 'stickers']],
  };
}

// ---------- the notebook: what you have seen each opponent do ----------
// Kept across runs. A tell is only written down once you have seen it three times in hands
// where their cards were shown, so you could have worked it out yourself.
const TELLS = {
  fastBluff: 'Acts fast when bluffing', slowBluff: 'Takes ages when bluffing', bigBluff: 'Overbets when bluffing',
  slowStrong: 'Slows down with a big hand', fastStrong: 'Snaps when strong', smallValue: 'Bets small with a big hand',
};
const CLUES_NEEDED = 3;
let notes = {};
try { notes = JSON.parse(localStorage.getItem('padpoker.notes')) || {}; } catch { /* private mode */ }
const saveNotes = () => { try { localStorage.setItem('padpoker.notes', JSON.stringify(notes)); } catch { /* private mode */ } };
let handFlags = {}; // seat -> { vpip, raised, clue } for the hand in progress
function noteDecision(g, p, a, toCall) {
  const fl = handFlags[p.seat] ||= {};
  if (g.street === 'preflop' && ((a.type === 'call' && toCall > 0) || a.type === 'raise')) fl.vpip = true;
  if (a.type === 'raise') fl.raised = true;
  const tell = p.style?.tell;
  if ((a.bluff && ['fastBluff', 'slowBluff', 'bigBluff'].includes(tell) && a.type === 'raise')
    || (a.strong && ['slowStrong', 'fastStrong', 'smallValue'].includes(tell))) fl.clue = true;
}
function noteHand(g) {
  for (const p of g.players) {
    if (p.isHuman || p.out || !p.cards.length) continue;
    const n = notes[p.name] ||= { hands: 0, vpip: 0, raised: 0, shown: 0, clues: 0 };
    const fl = handFlags[p.seat] || {};
    n.hands++;
    if (fl.vpip) n.vpip++;
    if (fl.raised) n.raised++;
    if (g.result.showdown && !p.folded) { n.shown++; if (fl.clue) n.clues = Math.min(CLUES_NEEDED, n.clues + 1); }
  }
  saveNotes();
}
function notebookScreen(back) {
  const everyone = [...Object.keys(CHARACTERS).map((name) => ({ name, ...CHARACTERS[name] })), ...BOSSES];
  const pct = (a, b) => `${Math.round((a / b) * 100)}%`;
  const tiles = everyone.map((c) => {
    const n = notes[c.name];
    if (!n) return `<div class="unmet"><div class="ava">?</div><span><b>???</b><small>Not met yet</small></span></div>`;
    const tell = c.trick ? c.trick
      : !c.style.tell ? (n.hands >= 20 ? 'No tell that you can see' : 'Still watching\u2026')
        : n.clues >= CLUES_NEEDED ? TELLS[c.style.tell] : `Tell: ${n.clues} of ${CLUES_NEEDED} clues`;
    return `<div><div class="ava" data-mood="idle" style="background:${c.color}">${face(c.name)}</div><span><b>${c.name}</b> <i>${c.tag}</i><small>Plays ${pct(n.vpip, n.hands)} &middot; raises ${pct(n.raised, n.hands)} &middot; ${n.hands} hands</small><small class="tell">${tell}</small></span></div>`;
  }).join('');
  showOverlay({
    title: 'Notebook', wide: true, closable: true, onClose: back,
    body: `<p>What you have seen each opponent do. A tell is written down once you have seen it ${CLUES_NEEDED} times at showdown.</p><div class="notebook">${tiles}</div>`,
    items: [[`${glyph('B')}Back`, back]],
  });
}

// ---------- stickers (achievements) ----------
let stickerQueue = 0;
function award(id) {
  const st = unlockSticker(id);
  if (!st) return;
  const delay = 1500 + stickerQueue++ * 1900; // let the hand's own fanfare finish, and don't stack them
  setTimeout(() => {
    stickerQueue = Math.max(0, stickerQueue - 1);
    audio.sticker();
    fx.sticker(st[3], st[1], st[2], STICKERS.indexOf(st) % 4);
  }, delay);
}
// Things only the game loop knows, noted during a hand for the checks below.
const feats = { startChips: 0, turnOdds: 1, lastAct: null, winStreak: 0, foldStreak: 0 };
function checkHandStickers(g, kos) {
  const me = g.players[ME];
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
function stickersScreen(back) {
  const tiles = STICKERS.map(([id, name, , icon], i) => `<div class="${hasSticker(id) ? 'got' : ''}"><b class="${hasSticker(id) ? `k${i % 4}` : ''}">${hasSticker(id) ? icon : '?'}</b>${name}</div>`).join('');
  showOverlay({
    title: 'Stickers', wide: true, closable: true, onClose: back,
    body: `<p>${stickerCount()} of ${STICKERS.length} collected. Each one is earned by something you did at the table.</p><div class="stickers">${tiles}</div>`,
    items: [[`${glyph('B')}Back`, back]],
  });
}

// ---------- stats and hand history ----------
const STATS0 = { hands: 0, won: 0, biggest: 0, showdowns: 0, showdownsWon: 0, allins: 0, allinsWon: 0, knockouts: 0, tables: 0, runs: 0, bestScore: 0, bestHand: '' };
const stats = { ...STATS0 };
try { Object.assign(stats, JSON.parse(localStorage.getItem('padpoker.stats')) || {}); } catch { /* private mode */ }
const saveStats = () => { try { localStorage.setItem('padpoker.stats', JSON.stringify(stats)); } catch { /* private mode */ } };
const RUN0 = { hands: 0, won: 0, biggest: 0, knockouts: 0, bestScore: 0, bestHand: '', startBest: 0, seed: 0 };
let runStats = { ...RUN0 }; // this run only; saved with the game
let handLog = null; // the hand in progress
let lastHand = null; // the most recent finished hand
const history = []; // the last 40 finished hands this session, oldest first
const cardText = (c) => `<span class="s${c & 3} ${(c & 3) === 1 || (c & 3) === 2 ? 'rd' : 'bk'}">${RANKS[c >> 2] === 'T' ? '10' : RANKS[c >> 2]}${SUITS[c & 3]}</span>`;
const cardsText = (cs) => cs.map(cardText).join(' ');

function logStart(g, before) {
  handLog = {
    no: g.handNo, table, where: mode === 'daily' ? 'Daily deal' : mode === 'quick' ? 'Quick table' : bossMode ? 'Boss' : `Table ${table}`,
    blinds: `${g.sb}/${g.bb}`, hole: [...g.players[ME].cards], streets: [{ name: 'Preflop', board: [], acts: [] }], shown: [], result: '',
    // enough to play the hand back exactly: who sat where, the stacks, the shuffled deck and every action
    cast: g.players.map((p) => p.name), before, deck: g.dealt, variant: g.variant, actions: [], mine: [], net: 0, mat: getComputedStyle($('app')).getPropertyValue('--mat'),
  };
}
function logAction(p, a) {
  if (!handLog) return;
  handLog.streets.at(-1).acts.push(`${p.name} ${p.lastAction.toLowerCase()}`);
  handLog.actions.push({ type: a.type, amount: a.amount });
}
function logStreet(g) {
  if (!handLog || g.stage === 'handOver') return;
  handLog.streets.push({ name: g.street[0].toUpperCase() + g.street.slice(1), board: [...g.board], acts: [] });
}
function recordHand(g) {
  const me = g.players[ME];
  if (handLog) {
    if (g.result.showdown) handLog.shown = g.players.filter((p) => !p.folded).map((p) => ({ name: p.name, cards: [...p.cards], hand: p.handName }));
    handLog.board = [...g.board];
    handLog.result = g.result.text;
    handLog.net = me.chips - handLog.before.chips[ME];
    lastHand = handLog; handLog = null;
    history.push(lastHand); if (history.length > 40) history.shift();
  }
  const kos = me.won > 0 ? g.players.filter((p) => !p.isHuman && !p.out && p.chips === 0 && p.total > 0).length : 0;
  for (const st of mode === 'run' ? [stats, runStats] : [stats]) {
    st.hands++;
    if (me.won > 0) { st.won++; st.biggest = Math.max(st.biggest, me.won); }
    if (g.result.showdown && !me.folded && me.score > st.bestScore) { st.bestScore = me.score; st.bestHand = me.handName; }
    st.knockouts += kos;
  }
  if (g.result.showdown && !me.folded) { stats.showdowns++; if (me.won > 0) stats.showdownsWon++; }
  if (me.allIn) { stats.allins++; if (me.won > 0) stats.allinsWon++; }
  saveStats();
  return kos;
}

// ---------- opponent character ----------
// Faces: idle | think | happy | sad | shock. A mood lasts `ms`, or until changed if ms is 0.
function setMood(seat, mood, ms = 0) {
  const ava = seatEls[seat]?.querySelector('.ava');
  if (!ava || game.players[seat].isHuman) return;
  ava.dataset.mood = mood;
  clearTimeout(ava._t);
  if (ms) ava._t = setTimeout(() => { ava.dataset.mood = 'idle'; }, ms);
}
const bluffers = new Set(); // seats that have bluff-raised this hand
// How the human has been playing; the AI adapts to it (see ai.js).
let habits = { facing: 0, folds: 0, acts: 0, raises: 0 };
function noteHumanAction(a, L) {
  habits.acts++;
  if (a.type === 'raise') habits.raises++;
  if (L.toCall > 0) { habits.facing++; if (a.type === 'fold') habits.folds++; }
}
const humanProfile = () => ({
  foldToBet: (habits.folds + 2) / (habits.facing + 5),
  aggression: (habits.raises + 1.5) / (habits.acts + 5),
});

// Each opponent's pause before acting: longer for hard decisions, bent by their personal tell.
function thinkTime(p, a) {
  let t = 450 + a.think * 1900 + Math.random() * 300;
  const tell = p.style?.tell;
  if (tell === 'fastBluff' && a.bluff) t = 260;
  if (tell === 'slowBluff' && a.bluff) t += 1800;
  if (tell === 'slowStrong' && a.strong) t += 1400;
  if (tell === 'fastStrong' && a.strong) t = 300;
  return t;
}
function showThinking(seat) {
  setMood(seat, 'think');
  const badge = seatEls[seat].querySelector('.badge');
  badge.textContent = '\u2022 \u2022 \u2022';
  badge.className = 'badge think';
}
function say(p, moment) {
  if (!prefs.chatter) return;
  const text = line(p.name, moment);
  if (!text) return;
  const el = seatEls[p.seat].querySelector('.say');
  el.textContent = text;
  el.classList.remove('show');
  void el.offsetWidth; // restart the pop animation
  el.classList.add('show');
  audio.talk(cast[p.seat].voice);
  netEffect('say', { seat: p.seat, moment });
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2600);
}
// ---------- table talk: say something, and someone answers in character ----------
const EMOTES = [['up', '\u2191', 'Nice hand', 'nice', 'happy'], ['right', '\u2192', 'Hurry up', 'hurry', 'think'], ['down', '\u2193', 'Ouch', 'ouch', 'idle'], ['left', '\u2190', 'Ha!', 'ha', 'happy']];
let lastTalk = 0, lastWinner = -1;
// Online, what a player says goes to everyone at the table: the quick lines, or anything they type.
const cleanChat = (t) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, 40);
function bubble(seat, text, ms = 2600) {
  const el = seatEls[seat]?.querySelector('.say');
  if (!el) return;
  el.textContent = text; el.style.marginLeft = ''; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  // keep a long line on the screen when the speaker sits at the edge
  const seat0 = seatEls[seat].getBoundingClientRect(), mid = seat0.left + seat0.width / 2, half = el.offsetWidth / 2, pad = 8;
  const shift = Math.min(0, innerWidth - pad - (mid + half)) + Math.max(0, pad - (mid - half));
  if (shift && !seatEls[seat].classList.contains('me')) el.style.marginLeft = `${shift}px`;
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), ms);
}
// Spectators speak from the rail: one bubble beside the table, with their name.
function crowdSay(who, text) {
  const el = $('crowd');
  el.textContent = ''; el.append(h('b', '', `${who}: `), text); // names and messages are plain text
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 2600 + text.length * 50);
}
function showChat(seat, text, who = '') {
  if (!prefs.chatter || !text) return; // table talk off: other players are muted too
  if (seat < 0) { crowdSay(who || 'Spectator', text); return audio.talk(3); }
  if (!game?.players[seat]) return;
  bubble(seat, text, 2200 + text.length * 50);
  audio.talk(cast[seat]?.voice ?? seat);
  setMood(seat, 'happy', 1400);
}
function netSay(key, text) { // from this device to the rest of the table
  const now = performance.now();
  if (now - lastTalk < 1500 || !text) return;
  lastTalk = now;
  if (net?.watch) crowdSay('You', text); else bubble(ME, text, 2200 + text.length * 50);
  audio.talk(0);
  if (netOn('host')) netEffect('chat', { seat: ME, text });
  else sendUp(key ? { t: 'chat', key } : { t: 'chat', text });
}
function chatEntry() {
  toggleEmotes(false);
  if (overlay || mode !== 'net') return;
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
function toggleEmotes(open = $('emotes').hidden) {
  const bar = $('emotes');
  if (open && (!game || mode === 'pass' || !prefs.chatter)) return;
  bar.hidden = !open;
  if (!open) return;
  audio.tick();
  bar.innerHTML = '';
  for (const [, arrow, text, key] of EMOTES) {
    const b = h('button', 'btn sm', `<span class="glyph wide">${arrow}</span>${text}`);
    b.onclick = () => sendEmote(key);
    bar.append(b);
  }
  if (mode === 'net') { const b = h('button', 'btn sm type', `${glyph('A')}Type a message`); b.onclick = chatEntry; bar.append(b); }
}
function sendEmote(key) {
  toggleEmotes(false);
  if (mode === 'net') return netSay(key, EMOTES.find((e) => e[3] === key)[2]);
  const now = performance.now();
  if (now - lastTalk < 2500) return;
  lastTalk = now;
  const [, , text, , mood] = EMOTES.find((e) => e[3] === key);
  const mineEl = seatEls[ME].querySelector('.say');
  mineEl.textContent = text; mineEl.classList.remove('show'); void mineEl.offsetWidth; mineEl.classList.add('show');
  clearTimeout(mineEl._t); mineEl._t = setTimeout(() => mineEl.classList.remove('show'), 2200);
  audio.talk(0);
  // who answers: the last winner for a compliment, whoever is thinking for "hurry up", otherwise anyone
  const g = game, ais = g.players.filter((p) => !p.isHuman && !p.out);
  if (!ais.length) return;
  let who = ais[Math.floor(Math.random() * ais.length)];
  if (key === 'nice' && ais.some((p) => p.seat === lastWinner)) who = g.players[lastWinner];
  if (key === 'hurry' && g.stage === 'betting' && !g.players[g.toAct].isHuman) who = g.players[g.toAct];
  setTimeout(() => { if (game === g) { say(who, key); setMood(who.seat, mood, 1600); } }, 750);
}

function handOverBanter() {
  const g = game;
  if (!g || g.stage !== 'handOver') return; // the next hand has already started
  const me0 = g.players[ME];
  if (mode === 'run' && !bossMode) {
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

// ---------- game loop ----------
// Progress is saved between hands so a reload (new version, or iOS evicting the app) is harmless.
const SAVE_KEY = 'padpoker.save';
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!s || !(s.table >= 1)) return null;
    if (s.chips && (s.chips.length !== tableConfig(s.table, !!s.boss).names.length + 1 || !(s.chips[ME] > 0))) return null;
    return s;
  } catch { return null; }
}
function writeSave(s) {
  if (mode === 'quick' || mode === 'pass' || mode === 'net') return;
  if (mode === 'daily') { // the daily deal keeps its own progress and never touches the run
    const d = dailyData();
    if (s) d.game = { date: today(), chips: s.chips, dealer: s.dealer, handNo: s.handNo }; else delete d.game;
    return saveDaily(d);
  }
  try { s ? localStorage.setItem(SAVE_KEY, JSON.stringify(s)) : localStorage.removeItem(SAVE_KEY); } catch { /* private mode */ }
}

// Start (or resume) a table. `saved` may carry mid-table chip stacks.
function startTable(n, saved) {
  leaveOnline();
  mode = 'run'; aiRng = Math.random; ME = 0; ui.hidden = false;
  if (n === 1 && !saved) memory = {};
  if (saved?.mem) memory = saved.mem;
  if (n === 1 && !saved) perks = {};
  if (saved?.perks) perks = saved.perks;
  if (saved?.owed) return pickPerk(() => startTable(n, { ...saved, perks, owed: false })); // a perk is due for the table just cleared
  if (n === 1 && !saved) { habits = { facing: 0, folds: 0, acts: 0, raises: 0 }; stats.runs++; saveStats(); runStats = { ...RUN0, startBest: best(), seed: Math.floor(Math.random() * 1e9) + 1 }; }
  if (saved?.run) runStats = { ...RUN0, ...saved.run };
  table = n;
  bossMode = !!saved?.boss;
  const cfg = tableConfig(n, bossMode);
  const info = (name) => (cfg.boss ? cfg.boss : CHARACTERS[name]);
  cast = [YOU, ...cfg.names.map((name) => {
    const st = { ...info(name).style, skill: cfg.skill };
    if (grudge(name)) st.aggr = Math.min(0.95, st.aggr + 0.12 * grudge(name)); // out for revenge
    return { name, ...info(name), style: st };
  })];
  game = new Game({ players: cast, handsPerLevel: cfg.handsPerLevel + 2 * (perks.slowblinds || 0), chips: cfg.chips, variant: cfg.variant || 'holdem' });
  setVariantLook(game.variant);
  game.players[ME].chips = Math.round(cfg.chips * (1 + 0.3 * (perks.bigstack || 0)));
  if (cfg.boss?.chips) game.players[1].chips = cfg.chips * cfg.boss.chips;
  if (DIFFICULTY[prefs.difficulty].stack !== 1) for (const p of game.players) if (!p.isHuman) p.chips = Math.round(p.chips * DIFFICULTY[prefs.difficulty].stack);
  twist = cfg.twist?.key || '';
  if (saved?.habits) habits = saved.habits;
  if (saved?.chips) {
    game.players.forEach((p, i) => { p.chips = saved.chips[i]; p.out = p.chips <= 0; });
    game.dealer = saved.dealer;
    game.handNo = saved.handNo;
  } else writeSave({ table: n, boss: bossMode, habits, run: runStats, perks, mem: memory });
  $('app').style.setProperty('--mat', cfg.mat);
  audio.setVenue(n - 1);
  buildSeats();
  $('msg').textContent = ''; $('msg').classList.remove('show');
  $('pot').hidden = true;
  $('hud').innerHTML = bossMode ? `<b>Boss</b><br>${cfg.boss.name}` : `Table <b>${table}</b><br>${cfg.venue}`;
  ui.mode = 'wait'; ui.resolve = null;
  lastBB = 0; fast = false; audio.hush(false); squeeze = null; ui.squeezed = true; $('app').classList.remove('zoom');
  runId++; // stop any game loop still running from the previous table
  renderActions();
  if (saved?.chips) run(); else tableIntro(run);
}

async function run() {
  const id = ++runId;
  const g = game;
  const me = g.players[ME];
  if (g.handNo === 0) { // a fresh table: the new venue slides in
    const app = $('app');
    app.classList.remove('arrive'); void app.offsetWidth; app.classList.add('arrive');
    audio.arrive();
    await rawSleep(750);
    if (id !== runId) return;
  }
  const nextHand = () => {
    if (mode === 'daily') { // every hand of the day is dealt, and played by the opponents, from a fixed seed
      if (g.handNo >= DAILY_HANDS) return false;
      g.rng = mulberry(dailySeed(g.handNo + 1));
      aiRng = mulberry(dailySeed(g.handNo + 1) ^ 0x5bd1e995);
    }
    return g.startHand();
  };
  let before = null; // stacks and button just before each deal, for the hand history
  const snap = () => { before = { chips: g.players.map((p) => p.chips), dealer: g.dealer, handNo: g.handNo, per: g.handsPerLevel }; return true; };
  while (snap() && nextHand()) {
    audio.tension(false);
    audio.newHand();
    ui.scatter = 0; ui.throwPower = 0;
    bluffers.clear();
    g.players.forEach((p) => setMood(p.seat, 'idle'));
    audio.musicLevel(1);
    settled = false;
    handFlags = {};
    feats.startChips = me.chips + me.total; feats.turnOdds = 1; feats.lastAct = null;
    const others = g.players.filter((p) => !p.isHuman && !p.out);
    peekSeat = perks.peek && others.length ? others[Math.floor(Math.random() * others.length)].seat : -1;
    logStart(g, before);
    if (lastBB && g.bb !== lastBB) { fx.banner(`Blinds up \u2013 ${g.sb}/${g.bb}`, 'info'); audio.blindsUp(); fx.haptic('blinds'); }
    lastBB = g.bb;
    netEffect('deal');
    fx.shuffle($('deck')); audio.shuffle();
    if (g.handNo === 1 && mode === 'run') { const again = g.players.find((p) => !p.isHuman && grudge(p.name)); if (again) setTimeout(() => say(again, 'again'), 1600); }
    render();
    const n = g.players.length;
    const holeCards = g.variant === 'omaha' ? [0, 1, 2, 3] : [0, 1];
    for (const p of g.players) if (!p.out) for (const k of holeCards) audio.card((SHUFFLE_MS + (dealOrder(p.seat) + k * n) * DEAL_GAP) / 1000);
    audio.chips(2, 0.1, 0);
    if (!me.out) for (const k of holeCards) setTimeout(() => fx.haptic('deal'), SHUFFLE_MS + (dealOrder(ME) + k * n) * DEAL_GAP + 450); // feel your cards land
    await rawSleep(SHUFFLE_MS + holeCards.length * n * DEAL_GAP + 500); // the shuffle and deal play at their own speed
    await sleep(350);
    while (g.stage !== 'handOver') {
      if (id !== runId) return;
      if (g.stage === 'streetEnd') {
        await collectBets();
        ui.slowRiver = false;
        if (g.runout) {
          audio.tension(true);
          if (g.street !== 'river') { audio.heartbeat(); fx.rumble(0.8, 0.2, 120); }
          // the river of a live all-in gets the full treatment
          const o = g.street === 'turn' ? Object.values(oddsFor(g)) : [];
          if (g.street === 'turn' && !me.folded) feats.turnOdds = oddsFor(g)[ME] ?? 1;
          ui.slowRiver = o.some((x) => x > 0.02 && x < 0.98);
          await sleep(g.street === 'river' ? 900 : ui.slowRiver ? 1700 : 1300);
          if (ui.slowRiver) { audio.heartbeat(); fx.rumble(0.8, 0.2, 120); }
        } else await sleep(250);
        if (id !== runId) return;
        g.nextStreet();
        logStreet(g);
        audio.musicLevel(2);
        render();
        if (ui.slowRiver && g.board.length === 5) {
          await rawSleep(BURN_MS);
          audio.riverSlam();
          await rawSleep(1000); // matches the slam animation and sound, whatever the speed setting
          fx.shake(8, 400); fx.haptic('slam');
          await sleep(500);
        }
        continue;
      }
      const p = g.players[g.toAct];
      let a;
      if (netOn('host')) { net.turn++; if (p.isHuman) startClock(p.seat); else clock = null; netBroadcast(); } // tells whoever is next that it is their move, and starts their clock
      if (p.isHuman && mode === 'net' && p.seat !== ME) { // someone else's device decides
        a = await remoteAction(p);
        if (id !== runId) return;
      } else if (p.isHuman) {
        if (mode === 'pass') { await takeSeat(p); if (id !== runId) return; }
        audio.turn(); fx.haptic('turn');
        await waitForSqueeze();
        if (id !== runId) return;
        a = await prompt('actions');
        noteHumanAction(a, g.legal(ME));
        if (handLog && mode !== 'pass' && a) { // what you knew when you chose: your rough chance to win and the price you were offered
          const L = g.legal(ME), opp = g.players.filter((q) => !mine(q) && !q.folded).length;
          handLog.mine.push({
            street: g.street, type: a.type === 'call' && L.canCheck ? 'check' : a.type, toCall: L.toCall, pot: g.pot,
            to: a.type === 'raise' ? Math.max(L.minTo, Math.min(a.amount, L.maxTo)) : 0,
            eq: equity(g.players[ME].cards, g.board, Math.max(1, opp), g.variant === 'omaha' ? 120 : 250, Math.random, g.variant), need: L.toCall / (g.pot + L.toCall),
          });
        }
        feats.lastAct = { type: a.type === 'call' && g.legal(ME).canCheck ? 'check' : a.type, street: g.street };
      } else {
        const watching = mode === 'net' || (mode === 'pass' ? g.players.some((q) => q.isHuman && !q.folded) : !me.folded);
        if (!watching && !fast && ui.mode === 'wait') { ui.mode = 'skip'; renderActions(); }
        a = decide(g, p.seat, aiRng, humanProfile());
        noteDecision(g, p, a, g.legal(p.seat).toCall);
        const wait = !watching ? 300 : thinkTime(p, a);
        if (wait > 1100 && !fast) showThinking(p.seat);
        if (wait > 2000 && !fast && Math.random() < 0.35) say(p, 'tank');
        await sleep(wait);
        if (a.bluff && a.type === 'raise') bluffers.add(p.seat);
      }
      if (id !== runId) return;
      const potBefore = g.pot;
      g.act(a.type, a.amount);
      setMood(p.seat, 'idle');
      logAction(p, a);
      if (mode === 'pass' && p.isHuman && g.stage !== 'handOver') { // cards face down before the device moves on
        ui.hidden = true; ui.noAnim = true; render(); ui.noAnim = false;
      } else render();
      actionFx(p, potBefore);
    }
    audio.tension(false);
    if (!ui.squeezed) finishSqueeze(); // the hand ended before you looked
    if (ui.mode === 'skip') { ui.mode = 'wait'; renderActions(); }
    if (fast) { fast = false; audio.hush(false); await rawSleep(350); }
    // let everyone turn their cards over before the result lands
    if (mode === 'pass') { ui.hidden = true; ui.noAnim = true; } // a winner who wasn't called doesn't have to show
    // A big pot going to a showdown gets slow motion: the view pushes in, the music sinks,
    // and the hands turn over one at a time with a heartbeat before the result lands.
    const stake = g.players.reduce((sum, p) => sum + p.won, 0);
    const slowmo = g.result.showdown && !g.runout && !fast && stake >= 20 * g.bb && (!me.folded || stake >= 40 * g.bb);
    if (slowmo) {
      $('app').classList.add('zoom');
      audio.tension(true); audio.heartbeat(); fx.haptic('nudge');
      ui.revealGap = 900;
      await rawSleep(700);
    }
    render();
    ui.noAnim = false;
    const gap = ui.revealGap || REVEAL_GAP;
    if (slowmo) for (let k = 0; k < ui.reveals; k++) setTimeout(() => { audio.heartbeat(); fx.haptic('nudge'); }, k * gap + gap - 260);
    ui.revealGap = 0;
    if (ui.reveals) await (slowmo ? rawSleep : sleep)(ui.reveals * gap + (slowmo ? 900 : 500));
    if (slowmo) { $('app').classList.remove('zoom'); audio.tension(false); fx.shake(5, 300); }
    if (id !== runId) return;
    settled = true;
    const friendly = mode === 'pass' || mode === 'net'; // games among people: no stats, stickers or notes
    const kos = friendly ? 0 : recordHand(g);
    if (!friendly) noteHand(g);
    if (mode === 'run' && !bossMode && me.won > 0) { // they remember who took their last chip
      for (const p of g.players) if (!p.isHuman && !p.out && p.chips === 0 && p.total > 0) memory[p.name] = { ko: grudge(p.name) + 1 };
    }
    if (!friendly) checkHandStickers(g, kos);
    // bonuses are paid by the house, on top of the pot
    const bonus = (twist === 'bounty' ? BOUNTY * kos : 0) + 100 * (perks.hunter || 0) * kos
      + (me.won > 0 ? Math.round(me.won * 0.1 * (perks.rakeback || 0)) : 0);
    if (bonus > 0) {
      me.chips += bonus;
      setTimeout(() => { fx.banner(`${kos ? 'Bounty' : 'Rakeback'} +${bonus}`, 'info'); audio.chips(5, 0, 4); }, 900);
    }
    if (me.chips === 0 && perks.lifeline > 0) { // one more chance
      perks.lifeline--;
      award('second_wind');
      me.chips = Math.round(tableConfig(table, bossMode).chips * 0.3);
      setTimeout(() => { fx.banner('Lifeline!', 'info'); audio.win(1); }, 1200);
    }
    render();
    handOverFx();
    setTimeout(handOverBanter, 700);
    writeSave({ table, boss: bossMode, chips: g.players.map((p) => p.chips), dealer: g.dealer, handNo: g.handNo, habits, run: runStats, perks, mem: memory });
    await sleep(500);
    if (mode === 'net') { await Promise.race([prompt('continue'), tick(9000)]); if (ui.mode === 'continue') finish(); } // nobody should wait on the host
    else await prompt('continue');
    if (id !== runId) return;
    if (mode === 'pass') { ui.hidden = true; continue; }
    if (mode === 'net') {
      if (twist === 'bounty') { // whoever won the hand collects for everyone it knocked out
        const out = g.players.filter((p) => !p.out && p.chips === 0 && p.total > 0).length, w = g.players[g.result.winners[0]];
        if (out && w) { w.chips += BOUNTY * out; const text = `${w.name}: bounty +${BOUNTY * out}`; fx.banner(text, 'info'); audio.chips(5, 0, 4); netEffect('banner', { text }); render(); }
      }
      continue;
    }
    if (me.chips === 0) return mode === 'daily' ? dailyDone() : mode === 'quick' ? quickDone() : busted();
    if (stale) return location.reload(); // new version deployed: pick it up between hands
  }
  if (mode === 'net') { if (netOn('host')) netDone(); } else if (mode === 'pass') passDone(); else if (mode === 'daily') dailyDone(); else if (mode === 'quick') quickDone(); else if (me.chips > 0) tableCleared(); else busted();
}

// ---------- new-version check ----------
// The deploy writes the commit id to version.txt. If it changes while we're open,
// reload at the next safe moment (title screen, or between hands).
let version = null;
let stale = false;
async function checkVersion() {
  try {
    const r = await fetch('version.txt', { cache: 'no-store' });
    if (!r.ok) return;
    const v = (await r.text()).trim();
    if (version === null) version = v;
    else if (v !== version) {
      stale = true;
      if (!game || ui.mode === 'continue' || (overlay && !overlay.closable)) location.reload();
    }
  } catch { /* offline */ }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkVersion(); });
addEventListener('pageshow', (e) => { if (e.persisted) checkVersion(); });
checkVersion();

// ---------- boot ----------
$('talk-btn').onclick = () => { audio.unlock(); if (!overlay) toggleEmotes(); };
$('menu-btn').onclick = () => { audio.unlock(); if (!overlay && game) pauseMenu(); };
for (const ev of ['pointerdown', 'touchend', 'keydown']) addEventListener(ev, () => audio.unlock(), { capture: true, passive: true });
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault()); // iOS pinch-zoom
startInput(onButton, (on) => {
  document.body.classList.toggle('gp', on);
  toast(on ? 'Controller connected' : 'Controller disconnected');
});
addEventListener('pagehide', () => { if (netOn('guest')) sendUp({ t: 'leave' }); }); // closing the tab frees your seat's clock
applyPrefs();
startScreen();
{ // opened from a shared link: go straight to that room
  const join = new URLSearchParams(location.search).get('join');
  if (join) { window.history.replaceState(null, '', location.pathname); joinOnline(join); } // window.history: plain 'history' is the hand list here
}
if (['localhost', '127.0.0.1'].includes(location.hostname)) window.__poker = { get game() { return game; }, ui, runCard, dailyCard }; // a handle for tests only: not on the live site, where it would let a host read the table from the console

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
