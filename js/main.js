import { Game } from './engine.js';
import { decide, runoutOdds, equity } from './ai.js';
import { startInput, upAmount } from './input.js';
import { RANKS, SUITS, evaluate, describe } from './cards.js';
import * as audio from './audio.js';
import * as fx from './fx.js';
import { line } from './banter.js';
import { face } from './faces.js';
import { STICKERS, has as hasSticker, count as stickerCount, unlock as unlockSticker } from './stickers.js';

const YOU = { name: 'You', isHuman: true };
const CHARACTERS = {
  Mav: { tag: 'Wild', color: 'var(--red)', voice: 1, style: { loose: 0.8, aggr: 0.8, tell: 'fastBluff' } },
  Dot: { tag: 'Careful', color: 'var(--mint)', voice: 2, style: { loose: 0.25, aggr: 0.3, tell: 'slowBluff' } },
  Rex: { tag: 'Shark', color: 'var(--yellow)', voice: 3, style: { loose: 0.35, aggr: 0.85, tell: 'bigBluff' } },
  Ivy: { tag: 'Sticky', color: 'var(--pink)', voice: 4, style: { loose: 0.75, aggr: 0.3, tell: 'slowStrong' } },
  Gus: { tag: 'Steady', color: 'var(--sky)', voice: 5, style: { loose: 0.5, aggr: 0.55 } },
};
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
  const names = n === 1 ? ['Dot', 'Ivy', 'Gus'] : n === 2 ? ['Mav', 'Dot', 'Ivy', 'Gus'] : ['Mav', 'Dot', 'Rex', 'Ivy', 'Gus'];
  const [venue, mat] = VENUES[(n - 1) % VENUES.length];
  const lap = Math.ceil(n / VENUES.length);
  const twist = n >= 3 ? TWISTS[(n - 3) % TWISTS.length] : null; // the first two tables are plain
  return {
    names, skill: Math.min(1, 0.3 + (n - 1) * 0.175), venue: lap > 1 ? `${venue}, round ${lap}` : venue, mat, twist,
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
    title: 'Daily <span>deal</span>', wide: true, closable: true, onClose: startScreen,
    body: `<p>${done ? `Today's score: <b>${d.scores[t].toLocaleString()}</b>. A new deal arrives tomorrow.` : `The same ${DAILY_HANDS} hands for everyone today, against all five regulars. Start with 1,000 and finish with as many chips as you can. One attempt.`}</p>${dailyCalendar()}`,
    items: done ? [[`${glyph('B')}Back`, startScreen]] : [[`${glyph('A')}${mid ? 'Carry on' : "Play today's deal"}`, () => startDaily(mid ? d.game : null)], [`${glyph('B')}Back`, startScreen]],
  });
}
function startDaily(saved) {
  mode = 'daily'; bossMode = false; twist = ''; perks = {}; table = 0;
  const cfg = DAILY_CFG;
  cast = [YOU, ...cfg.names.map((name) => ({ name, ...CHARACTERS[name], style: { ...CHARACTERS[name].style, skill: cfg.skill } }))];
  game = new Game({ players: cast, handsPerLevel: cfg.handsPerLevel, chips: cfg.chips });
  habits = { facing: 0, folds: 0, acts: 0, raises: 0 };
  if (saved) {
    game.players.forEach((p, i) => { p.chips = saved.chips[i]; p.out = p.chips <= 0; });
    game.dealer = saved.dealer; game.handNo = saved.handNo;
  } else { const d = dailyData(); d.game = { date: today(), chips: game.players.map((p) => p.chips), dealer: -1, handNo: 0 }; saveDaily(d); }
  $('app').style.setProperty('--mat', cfg.mat);
  audio.setVenue(2);
  buildSeats();
  $('msg').textContent = ''; $('msg').classList.remove('show');
  $('pot').hidden = true;
  $('hud').innerHTML = `<b>Daily deal</b><br>${today()}`;
  ui.mode = 'wait'; ui.resolve = null;
  lastBB = 0; fast = false; audio.hush(false); squeeze = null; ui.squeezed = true;
  runId++;
  renderActions();
  run();
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
    items: [[`${glyph('A')}Done`, startScreen]],
  });
}

let table = 1;
let twist = ''; // the current table's rule change, if any
let lastBB = 0; // to announce when the blinds go up
let cast = []; // cast[seat] = character info for the current table
const ME = 0;
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
let fast = false; // true while skipping the rest of a hand you've folded
const tick = (ms) => new Promise((r) => setTimeout(r, ms));
// Every pause in the game goes through here, so opening a menu really does pause play.
const rawSleep = async (ms) => {
  await tick(fast ? 0 : ms);
  while (overlay) await tick(120);
};
const sleep = (ms) => rawSleep(ms * PACE[prefs.speed]); // game pauses stretch with the speed setting

// ---------- player preferences ----------
const PACE = { Relaxed: 1.4, Normal: 1, Fast: 0.5 };
const STACKS = { Short: 500, Standard: 1000, Deep: 2000 };
const prefs = { speed: 'Normal', stack: 'Standard', lefty: false, rumble: true, chatter: true, coach: false, back: 'Spade', fourColour: false, squeeze: true };
// Card backs, and how many tables your best run must have cleared to unlock each.
const BACKS = { Spade: 0, Lattice: 1, Sunburst: 2, Ruby: 3, Gold: 5 };
const bestRun = () => { try { return +localStorage.getItem('padpoker.best') || 0; } catch { return 0; } };
const unlockedBacks = () => Object.keys(BACKS).filter((k) => BACKS[k] <= bestRun());
try { Object.assign(prefs, JSON.parse(localStorage.getItem('padpoker.prefs')) || {}); } catch { /* private mode */ }
if (!PACE[prefs.speed]) prefs.speed = 'Normal';
if (!STACKS[prefs.stack]) prefs.stack = 'Standard';
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
const ui = { mode: 'wait', focus: 1, raiseTo: 0, resolve: null, shown: '', reveals: 0, slowRiver: false, squeezed: true };
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
    `<span class="r">${r === 'T' ? '10' : r}</span><span class="s">${SUITS[s]}</span>`));
  return el;
}

// Chips are drawn from above as a heap: discs spiral out from the middle in x and y,
// overlapping, with the middle of the heap on top. The layout is fixed for a given
// count, so a pile grows outwards as chips are added rather than reshuffling.
const chipCount = (amount, per, max) => Math.max(1, Math.min(max, Math.round(Math.log2(amount / game.bb + 1) * per)));
function setPile(el, n) {
  if (el.dataset.n === String(n)) return;
  el.dataset.n = n;
  const gap = 0.6, disc = 1.55; // em
  const R = gap * Math.sqrt(Math.max(0, n - 1));
  el.style.width = el.style.height = `${(2 * R + disc + 0.3).toFixed(2)}em`;
  let html = '';
  for (let i = n - 1; i >= 0; i--) { // outer chips first, so they sit underneath
    const a = i * 2.39996 + 0.7, r = gap * Math.sqrt(i); // golden-angle spiral
    html += `<i class="c${i % 3} h${i % 4 === 0 ? 2 : 1}" style="left:${(R + r * Math.cos(a)).toFixed(2)}em;top:${(R + r * Math.sin(a)).toFixed(2)}em"></i>`;
  }
  el.innerHTML = html;
}

function buildSeats() {
  $('seats').innerHTML = '';
  $('board').innerHTML = '';
  seatEls = game.players.map((p) => {
    const el = h('div', `seat ${p.isHuman ? 's0 me' : 'ai'}`,
      `<div class="cards"></div><div class="badge"></div>
       <div class="plate"><div class="ava" data-mood="idle">${p.isHuman ? p.name[0] : face(p.name)}</div>
         <div class="who"><div class="name"></div><div class="chips"></div></div><div class="hand"></div></div>
       <div class="bet" hidden><span></span><em class="pile"></em></div><div class="say"></div>`);
    const c = cast[p.seat];
    el.querySelector('.name').innerHTML = `${p.name}${c.tag ? ` <i>${c.tag}</i>` : ''}`;
    if (!p.isHuman) { // spread the opponents evenly along the top
      const n = game.players.length - 1;
      const left = n === 1 ? 50 : 13 + (p.seat - 1) * (74 / (n - 1));
      el.style.left = `${left}%`;
      el.style.setProperty('--pc', c.color);
      el.style.setProperty('--i', p.seat);
      el.style.setProperty('--dx', `${(50 - left) * 0.8}vw`);
    }
    $('seats').append(el);
    return el;
  });
}

const dealOrder = (seat) => (seat - game.dealer - 1 + game.players.length) % game.players.length;

function bestFive(cards) {
  const target = evaluate(cards);
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const five = cards.filter((_, k) => k !== i && k !== j);
      if (evaluate(five) === target) return five;
    }
  }
  return cards;
}

function render() {
  const g = game;
  const over = g.stage === 'handOver' && settled;
  const pending = g.stage === 'handOver' && !settled; // result known but not yet revealed
  const n = g.players.length;
  let reveals = 0;
  const odds = g.runout && g.board.length < 5 && g.stage !== 'handOver' ? oddsFor(g) : null;
  g.players.forEach((p, i) => {
    const el = seatEls[i];
    const face = p.isHuman || (g.showCards && !p.folded);
    const show = p.cards.length && (!p.folded || p.isHuman);
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
        const wait = reveals++ * REVEAL_GAP;
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
        const sq = p.isHuman && prefs.squeeze; // your cards stay face down until you squeeze them
        const els = p.cards.map((c, k) => {
          const e = cardEl(c, sq || (seen(k) && !p.isHuman), '', sq);
          if (sq) e.firstChild.classList.add('sq');
          return e;
        });
        cards.replaceChildren(...els);
        els.forEach((e, k) => {
          const r = e.getBoundingClientRect();
          e.style.setProperty('--dx', `${dr.left + dr.width / 2 - r.left - r.width / 2}px`);
          e.style.setProperty('--dy', `${dr.top + dr.height / 2 - r.top - r.height / 2}px`);
          e.style.setProperty('--ds', dr.width / e.offsetWidth);
          e.style.animationDelay = `${delay(k)}ms`;
          e.classList.add('deal');
        });
        if (sq) startSqueeze(cards, sig);
        if (p.isHuman && !sq) { // your cards land face down, then turn over by themselves
          setTimeout(() => {
            if (cards.dataset.sig !== sig) return;
            cards.replaceChildren(...p.cards.map((c, k) => {
              const e = cardEl(c, true, 'flip');
              e.style.animationDelay = `${k * 160}ms`;
              return e;
            }));
            audio.flip(); audio.flip(0.16);
          }, delay(1) + 380);
        }
      }
    }
    el.classList.toggle('shown', !!sig && face && !p.isHuman);
    el.classList.toggle('active', g.stage === 'betting' && g.toAct === i);
    el.classList.toggle('folded', p.folded && !p.out);
    el.classList.toggle('out', p.out);
    el.classList.toggle('winner', over && p.won > 0);
    const chips = el.querySelector('.chips');
    if (p.out) { chips.textContent = 'Out'; chips._cur = 0; }
    else {
      fx.roll(chips, pending ? p.chips - p.won : p.chips, over && p.won > 0
        ? { dur: 1100, onTick: p.isHuman ? audio.count : undefined }
        : {});
    }
    let hand = '';
    const known = !p.isHuman || ui.squeezed; // don't name a hand you haven't looked at yet
    if (!p.folded && face && known && g.board.length >= 3) hand = describe(evaluate([...p.cards, ...g.board]));
    const handEl = el.querySelector('.hand');
    if (ui.slowRiver && g.board.length === 5 && g.stage !== 'handOver') { /* river still in the air: don't give it away */ }
    else if (odds && odds[i] !== undefined) { // all-in: show each player's chance of winning
      const pct = `${Math.round(odds[i] * 100)}%`;
      const html = `${hand ? `${hand} ` : ''}<b>${pct}</b>`;
      if (handEl.innerHTML !== html) { handEl.innerHTML = html; fx.pop(handEl, 1.3); }
    } else if (p.isHuman && prefs.coach && known && !p.folded && p.cards.length && g.stage !== 'handOver' && g.stage !== 'idle') {
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
    if (p.bet) { bet.hidden = false; bet.classList.remove('leaving'); fx.roll(bet.firstChild, p.bet, { dur: 200 }); setPile(bet.lastChild, chipCount(p.bet, 1.7, 10)); }
    else { bet.hidden = true; bet.firstChild._cur = 0; }
    const d = el.querySelector('.dealer');
    if (g.dealer === i && !d) el.querySelector('.plate').append(h('div', 'dealer', 'D'));
    else if (g.dealer !== i && d) d.remove();
  });

  const board = $('board');
  if (board.children.length > g.board.length) { board.innerHTML = ''; $('burn').innerHTML = ''; }
  const fresh = g.board.length - board.children.length;
  if (fresh > 0) burnCard();
  for (let i = board.children.length, k = 0; i < g.board.length; i++, k++) {
    const slow = ui.slowRiver && i === 4;
    const wait = BURN_MS + k * 170;
    const e = cardEl(g.board[i], true, slow ? 'slam' : 'drop', !slow);
    // each board card slides out from the deck, which sits just right of the fifth slot
    e.style.setProperty('--dx', `${17.59 - i * 3.382}em`);
    e.style.animationDelay = `${wait}ms`;
    if (!slow) e.firstChild.style.animationDelay = `${wait}ms`;
    board.append(e);
    if (!slow) { audio.card(wait / 1000); audio.flip(wait / 1000 + 0.3); }
  }
  if (fresh && !g.players[ME].folded) fx.pop(seatEls[ME].querySelector('.hand'), 1.3);

  // highlight the winning five at showdown
  const hl = new Set();
  if (over && g.result.showdown) {
    for (const s of g.result.winners) for (const c of bestFive([...g.players[s].cards, ...g.board])) hl.add(`${s}:${c}`).add(`b:${c}`);
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
  const left = g.players.filter((p) => !p.isHuman && !p.out && (p.chips > 0 || p.total > 0)).length;
  $('hud').innerHTML = mode === 'daily'
    ? `<b>Daily</b> &middot; <b>${g.sb}/${g.bb}</b><br>Hand <b>${g.handNo}</b> of ${DAILY_HANDS}`
    : `${bossMode ? '<b>Boss</b>' : `Table <b>${table}</b>`} &middot; <b>${g.sb}/${g.bb}</b><br>Hand <b>${g.handNo}</b> &middot; <b>${left}</b> left`;
  ui.reveals = reveals;
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
  const opp = g.players.filter((p) => !p.isHuman && !p.folded).length;
  const key = `${table}:${g.handNo}:${g.board.length}:${opp}`;
  if (coachCache.key !== key) coachCache = { key, pct: Math.round(equity(g.players[ME].cards, g.board, Math.max(1, opp), 400) * 100) };
  return coachCache.pct;
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
    squeeze.drag = Math.max(0, Math.min(1, (y0 - e.clientY) / (squeeze.el.offsetHeight * 0.7)));
  });
  for (const ev of ['pointerup', 'pointercancel']) addEventListener(ev, () => { y0 = null; if (squeeze) squeeze.drag = 0; });
}

// Win chances while an all-in is run out; worked out once per street.
let oddsCache = { key: '', odds: null };
function oddsFor(g) {
  const key = `${g.handNo}:${g.board.length}`;
  if (oddsCache.key !== key) {
    const live = g.players.filter((p) => !p.folded);
    const res = runoutOdds(live.map((p) => p.cards), g.board);
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
    row.append(back, h('div', '', `${glyph('LB')} ${glyph('RB')}`), ok);
    panel.append(row);
    bar.append(panel);
    setRaise(ui.raiseTo, true, true);
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
  items.forEach(([label, fn, keep], i) => {
    const b = h('button', 'btn' + (i === 0 ? ' focus call' : ''), text(label));
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

const TITLE = '<span class="logo">Pad <span>Poker</span></span>';
const best = () => { try { return +localStorage.getItem('padpoker.best') || 0; } catch { return 0; } };
const tables = (n) => `${n} table${n === 1 ? '' : 's'}`;
function startScreen() {
  const saved = loadSave();
  const record = best() ? ` Your best run: ${tables(best())} cleared.` : '';
  showOverlay({
    title: TITLE,
    body: `<p>No-limit Texas Hold'em. Knock out every opponent to clear a table and climb to the next.${record}</p>${CONTROLS}`,
    items: saved
      ? [[`${glyph('A')}Continue \u2013 ${saved.boss ? 'Boss' : `Table ${saved.table}`}`, () => startTable(saved.table, saved)], ['New run', () => startTable(1)], ['Daily deal', dailyScreen], ['Stats', () => statsScreen(startScreen)], ['Settings', () => settingsMenu(startScreen)], ['Help', () => helpMenu(startScreen)]]
      : [[`${glyph('A')}Play`, firstPlay], ['Daily deal', dailyScreen], ['Stats', () => statsScreen(startScreen)], ['Settings', () => settingsMenu(startScreen)], ['Help', () => helpMenu(startScreen)]],
  });
}
function firstPlay() {
  let seen = true;
  try { seen = !!localStorage.getItem('padpoker.seen'); } catch { /* private mode */ }
  if (seen) startTable(1); else howTo(0, () => startTable(1), true);
}
function pauseMenu() {
  audio.tick();
  showOverlay({
    title: TITLE, body: CONTROLS, closable: true,
    items: [
      ['Resume'],
      ['Last hand', () => lastHandScreen(pauseMenu)],
      ['Stats', () => statsScreen(pauseMenu)],
      ['Help', () => helpMenu(pauseMenu)],
      ['Settings', () => settingsMenu(pauseMenu)],
      ['New run', () => startTable(1)],
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
    items: [[`Stickers ${stickerCount()}/${STICKERS.length}`, () => stickersScreen(() => statsScreen(back))], [`${glyph('B')}Back`, back]],
  });
}
function lastHandScreen(back) {
  const hnd = lastHand;
  let body = '<p>No finished hand yet.</p>';
  if (hnd) {
    const rows = hnd.streets.filter((st) => st.acts.length || st.board.length).map((st) =>
      `<tr><td>${st.name}${st.board.length ? `<br>${cardsText(st.board)}` : ''}</td><td>${st.acts.join(', ') || '\u2013'}</td></tr>`);
    if (hnd.shown.length) rows.push(`<tr><td>Showdown</td><td>${hnd.shown.map((x) => `${x.name} ${cardsText(x.cards)} <i>${x.hand}</i>`).join('<br>')}</td></tr>`);
    body = `<p>Table ${hnd.table}, hand ${hnd.no} &middot; blinds ${hnd.blinds} &middot; you held ${cardsText(hnd.hole)}</p>
      <table class="log">${rows.join('')}</table><p class="res">${hnd.result}</p>`;
  }
  showOverlay({ title: 'Last hand', closable: true, onClose: back, wide: true, body, items: [[`${glyph('B')}Back`, back]] });
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
    body: `<p>Best at the top. Your hand is the best five cards from your two plus the board.</p><div class="ranks">${rows}</div>`,
    items: [[`${glyph('B')}Back`, back]],
  });
}
function settingsMenu(back) {
  const onOff = (v) => (v ? 'On' : 'Off');
  const set = (fn) => () => { fn(); applyPrefs(); };
  showOverlay({
    title: 'Settings', compact: true, closable: true, onClose: back,
    body: `<p>Speed changes how long opponents and deals take. Stack size applies from the next table. Left-handed moves the buttons to the left. Coach shows your rough chance of winning and the odds a call needs.</p>`,
    items: [
      [() => `Speed: ${prefs.speed}`, set(() => { prefs.speed = cycle(PACE, prefs.speed); }), true],
      [() => `Stacks: ${prefs.stack}`, set(() => { prefs.stack = cycle(STACKS, prefs.stack); }), true],
      [() => `Left-handed: ${onOff(prefs.lefty)}`, set(() => { prefs.lefty = !prefs.lefty; }), true],
      [() => `Sound: ${onOff(audio.settings.sfx)}`, () => audio.setSfx(!audio.settings.sfx), true],
      [() => `Music: ${onOff(audio.settings.music)}`, () => audio.setMusic(!audio.settings.music), true],
      [() => `Rumble: ${onOff(prefs.rumble)}`, set(() => { prefs.rumble = !prefs.rumble; if (prefs.rumble) setTimeout(() => fx.rumble(0.6, 0.6, 150), 30); }), true],
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
    body: `<p class="venue">${cfg.venue}</p><p>Knock out all ${cfg.names.length} to move up. Everyone starts with ${cfg.chips.toLocaleString()}. Blinds rise every ${cfg.handsPerLevel} hands.</p>${cfg.twist ? `<p class="who">Twist: <b>${cfg.twist.name}</b> &ndash; ${cfg.twist.text}</p>` : ''}<p class="who">${who}</p>${perkSummary() ? `<p class="who">Your perks: ${perkSummary()}</p>` : ''}`,
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
    writeSave({ table: table + 1, habits, run: runStats, perks, owed: true });
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
  writeSave({ table: bossNext ? table : table + 1, boss: bossNext, habits, run: runStats, perks, owed: true });
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
    items: [[`${glyph('A')}New run`, () => startTable(1)], ['Stats', () => statsScreen(bustSummary)]],
  });
}

// ---------- input ----------
function onButton(b) {
  if (!audio.unlock() && !onButton.warned) {
    onButton.warned = true;
    toast('Tap the screen once to turn sound on');
  }
  if (overlay) {
    if (b === 'up') overlayFocus(-overlay.cols);
    else if (b === 'down') overlayFocus(overlay.cols);
    else if (b === 'left') overlayFocus(-1);
    else if (b === 'right') overlayFocus(1);
    else if (b === 'a') $('overlay').querySelectorAll('.items .btn')[overlay.focus].click();
    else if ((b === 'b' || b === 'start') && overlay.closable) { const done = overlay.onClose; audio.back(); closeOverlay(); done?.(); }
    return;
  }
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
    else if (b === 'up') setRaise(ui.raiseTo + step * 5);
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
  { // your own actions each have their own feel; other players' bets are a faint nudge
    const a0 = p.lastAction;
    const kind = a0 === 'Fold' ? 'fold' : a0 === 'Check' ? 'check' : a0.startsWith('Call') ? 'call' : a0.startsWith('All-in') ? '' : 'raise';
    if (p.isHuman) fx.haptic(kind); else if (kind === 'raise') fx.haptic('nudge');
  }
  const el = seatEls[p.seat];
  const a = p.lastAction;
  const bet = el.querySelector('.bet');
  if (a === 'Fold') return audio.fold();
  if (a === 'Check') return audio.check();
  const size = p.bet / Math.max(potBefore, 1);
  const allIn = a.startsWith('All-in');
  fx.flyChips(el.querySelector('.plate'), bet, allIn ? 8 : size > 0.6 ? 4 : 2, { stagger: 35 });
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

async function collectBets() {
  if (fast) return;
  const bets = seatEls.map((el) => el.querySelector('.bet')).filter((b) => !b.hidden);
  if (!bets.length) return;
  for (const b of bets) { fx.flyChips(b, $('pot'), 2, { stagger: 30 }); b.classList.add('leaving'); }
  audio.chips(Math.min(5, bets.length + 1), 0.3, -3);
  await sleep(420);
  fx.pop($('pot'), 1.2);
}

function handOverFx() {
  const g = game, me = g.players[ME];
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
    setTimeout(() => fx.floatText(plate, `+${p.won.toLocaleString()}`, p.isHuman ? 'big' : ''), 350);
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
  if (won && ranks[0] === 0 && ranks[1] === 5) award('seven_two');
  if (ranks[0] === 12 && ranks[1] === 12) { if (won) award('rockets'); else if (sd) award('cracked'); }
  if (won && !g.result.showdown && g.street === 'river') award('stone_cold');
  if (won && sd && cat <= 1 && feats.lastAct?.type === 'call' && feats.lastAct.street === 'river') award('soul_read');
  if (won && cat === 5) award('flushed');
  if (won && cat === 6) award('full_boat');
  if (cat === 7) award('quads');
  if (cat === 8) award('unicorn');
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
const RUN0 = { hands: 0, won: 0, biggest: 0, knockouts: 0, bestScore: 0, bestHand: '', startBest: 0 };
let runStats = { ...RUN0 }; // this run only; saved with the game
let handLog = null; // the hand in progress
let lastHand = null; // the most recent finished hand
const cardText = (c) => `<span class="s${c & 3} ${(c & 3) === 1 || (c & 3) === 2 ? 'rd' : 'bk'}">${RANKS[c >> 2] === 'T' ? '10' : RANKS[c >> 2]}${SUITS[c & 3]}</span>`;
const cardsText = (cs) => cs.map(cardText).join(' ');

function logStart(g) {
  handLog = { no: g.handNo, table, blinds: `${g.sb}/${g.bb}`, hole: [...g.players[ME].cards], streets: [{ name: 'Preflop', board: [], acts: [] }], shown: [], result: '' };
}
function logAction(p) {
  handLog?.streets.at(-1).acts.push(`${p.name} ${p.lastAction.toLowerCase()}`);
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
    lastHand = handLog; handLog = null;
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
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2600);
}
function handOverBanter() {
  const g = game;
  if (g.stage !== 'handOver') return; // the next hand has already started
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
  if (mode === 'daily') { // the daily deal keeps its own progress and never touches the run
    const d = dailyData();
    if (s) d.game = { date: today(), chips: s.chips, dealer: s.dealer, handNo: s.handNo }; else delete d.game;
    return saveDaily(d);
  }
  try { s ? localStorage.setItem(SAVE_KEY, JSON.stringify(s)) : localStorage.removeItem(SAVE_KEY); } catch { /* private mode */ }
}

// Start (or resume) a table. `saved` may carry mid-table chip stacks.
function startTable(n, saved) {
  mode = 'run'; aiRng = Math.random;
  if (n === 1 && !saved) perks = {};
  if (saved?.perks) perks = saved.perks;
  if (saved?.owed) return pickPerk(() => startTable(n, { ...saved, perks, owed: false })); // a perk is due for the table just cleared
  table = n;
  bossMode = !!saved?.boss;
  const cfg = tableConfig(n, bossMode);
  const info = (name) => (cfg.boss ? cfg.boss : CHARACTERS[name]);
  cast = [YOU, ...cfg.names.map((name) => ({ name, ...info(name), style: { ...info(name).style, skill: cfg.skill } }))];
  game = new Game({ players: cast, handsPerLevel: cfg.handsPerLevel + 2 * (perks.slowblinds || 0), chips: cfg.chips });
  game.players[ME].chips = Math.round(cfg.chips * (1 + 0.3 * (perks.bigstack || 0)));
  if (cfg.boss?.chips) game.players[1].chips = cfg.chips * cfg.boss.chips;
  twist = cfg.twist?.key || '';
  if (n === 1 && !saved) { habits = { facing: 0, folds: 0, acts: 0, raises: 0 }; stats.runs++; saveStats(); runStats = { ...RUN0, startBest: best() }; }
  if (saved?.run) runStats = { ...RUN0, ...saved.run };
  if (saved?.habits) habits = saved.habits;
  if (saved?.chips) {
    game.players.forEach((p, i) => { p.chips = saved.chips[i]; p.out = p.chips <= 0; });
    game.dealer = saved.dealer;
    game.handNo = saved.handNo;
  } else writeSave({ table: n, boss: bossMode, habits, run: runStats, perks });
  $('app').style.setProperty('--mat', cfg.mat);
  audio.setVenue(n - 1);
  buildSeats();
  $('msg').textContent = ''; $('msg').classList.remove('show');
  $('pot').hidden = true;
  $('hud').innerHTML = bossMode ? `<b>Boss</b><br>${cfg.boss.name}` : `Table <b>${table}</b><br>${cfg.venue}`;
  ui.mode = 'wait'; ui.resolve = null;
  lastBB = 0; fast = false; audio.hush(false); squeeze = null; ui.squeezed = true;
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
  while (nextHand()) {
    audio.tension(false);
    audio.newHand();
    bluffers.clear();
    g.players.forEach((p) => setMood(p.seat, 'idle'));
    audio.musicLevel(1);
    settled = false;
    feats.startChips = me.chips + me.total; feats.turnOdds = 1; feats.lastAct = null;
    const others = g.players.filter((p) => !p.isHuman && !p.out);
    peekSeat = perks.peek && others.length ? others[Math.floor(Math.random() * others.length)].seat : -1;
    logStart(g);
    if (lastBB && g.bb !== lastBB) { fx.banner(`Blinds up \u2013 ${g.sb}/${g.bb}`, 'info'); audio.blindsUp(); fx.haptic('blinds'); }
    lastBB = g.bb;
    fx.shuffle($('deck')); audio.shuffle();
    render();
    const n = g.players.length;
    for (const p of g.players) if (!p.out) for (const k of [0, 1]) audio.card((SHUFFLE_MS + (dealOrder(p.seat) + k * n) * DEAL_GAP) / 1000);
    audio.chips(2, 0.1, 0);
    if (!me.out) for (const k of [0, 1]) setTimeout(() => fx.haptic('deal'), SHUFFLE_MS + (dealOrder(ME) + k * n) * DEAL_GAP + 450); // feel your cards land
    await rawSleep(SHUFFLE_MS + 2 * n * DEAL_GAP + 500); // the shuffle and deal play at their own speed
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
      if (p.isHuman) {
        audio.turn(); fx.haptic('turn');
        await waitForSqueeze();
        if (id !== runId) return;
        a = await prompt('actions');
        noteHumanAction(a, g.legal(ME));
        feats.lastAct = { type: a.type === 'call' && g.legal(ME).canCheck ? 'check' : a.type, street: g.street };
      } else {
        if (me.folded && !fast && ui.mode === 'wait') { ui.mode = 'skip'; renderActions(); }
        a = decide(g, p.seat, aiRng, humanProfile());
        const wait = me.folded ? 300 : thinkTime(p, a);
        if (wait > 1100 && !fast) showThinking(p.seat);
        if (wait > 2000 && !fast && Math.random() < 0.35) say(p, 'tank');
        await sleep(wait);
        if (a.bluff && a.type === 'raise') bluffers.add(p.seat);
      }
      if (id !== runId) return;
      const potBefore = g.pot;
      g.act(a.type, a.amount);
      setMood(p.seat, 'idle');
      logAction(p);
      render();
      actionFx(p, potBefore);
    }
    audio.tension(false);
    if (!ui.squeezed) finishSqueeze(); // the hand ended before you looked
    if (ui.mode === 'skip') { ui.mode = 'wait'; renderActions(); }
    if (fast) { fast = false; audio.hush(false); await rawSleep(350); }
    // let everyone turn their cards over before the result lands
    render();
    if (ui.reveals) await sleep(ui.reveals * REVEAL_GAP + 500);
    if (id !== runId) return;
    settled = true;
    const kos = recordHand(g);
    checkHandStickers(g, kos);
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
    writeSave({ table, boss: bossMode, chips: g.players.map((p) => p.chips), dealer: g.dealer, handNo: g.handNo, habits, run: runStats, perks });
    await sleep(500);
    await prompt('continue');
    if (id !== runId) return;
    if (me.chips === 0) return mode === 'daily' ? dailyDone() : busted();
    if (stale) return location.reload(); // new version deployed: pick it up between hands
  }
  if (mode === 'daily') dailyDone(); else if (me.chips > 0) tableCleared(); else busted();
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
$('menu-btn').onclick = () => { audio.unlock(); if (!overlay && game) pauseMenu(); };
for (const ev of ['pointerdown', 'touchend', 'keydown']) addEventListener(ev, () => audio.unlock(), { capture: true, passive: true });
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault()); // iOS pinch-zoom
startInput(onButton, (on) => {
  document.body.classList.toggle('gp', on);
  toast(on ? 'Controller connected' : 'Controller disconnected');
});
applyPrefs();
startScreen();
window.__poker = { get game() { return game; }, ui };

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
