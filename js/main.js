import { Game } from './engine.js';
import { decide, runoutOdds } from './ai.js';
import { startInput } from './input.js';
import { RANKS, SUITS, evaluate, describe } from './cards.js';
import * as audio from './audio.js';
import * as fx from './fx.js';
import { line } from './banter.js';

const YOU = { name: 'You', isHuman: true };
const CHARACTERS = {
  Mav: { tag: 'Wild', color: 'var(--red)', voice: 1, style: { loose: 0.8, aggr: 0.8, tell: 'fastBluff' } },
  Dot: { tag: 'Careful', color: 'var(--mint)', voice: 2, style: { loose: 0.25, aggr: 0.3, tell: 'slowBluff' } },
  Rex: { tag: 'Shark', color: 'var(--yellow)', voice: 3, style: { loose: 0.35, aggr: 0.85, tell: 'bigBluff' } },
  Ivy: { tag: 'Sticky', color: 'var(--pink)', voice: 4, style: { loose: 0.75, aggr: 0.3, tell: 'slowStrong' } },
  Gus: { tag: 'Steady', color: 'var(--sky)', voice: 5, style: { loose: 0.5, aggr: 0.55 } },
};
// A run is a climb through tables: knock everyone out to move up. Each table has more
// or sharper opponents and faster blinds.
function tableConfig(n) {
  const names = n === 1 ? ['Dot', 'Ivy', 'Gus'] : n === 2 ? ['Mav', 'Dot', 'Ivy', 'Gus'] : ['Mav', 'Dot', 'Rex', 'Ivy', 'Gus'];
  return { names, skill: Math.min(1, 0.3 + (n - 1) * 0.175), handsPerLevel: Math.max(3, 7 - n) };
}
let table = 1;
let cast = []; // cast[seat] = character info for the current table
const ME = 0;
const DEAL_GAP = 55; // ms between dealt cards
const REVEAL_GAP = 320; // ms between players turning their cards over

const $ = (id) => document.getElementById(id);
const h = (tag, cls = '', html = '') => {
  const e = document.createElement(tag);
  e.className = cls; e.innerHTML = html;
  return e;
};
const glyph = (g) => `<span class="glyph ${g.length > 1 ? 'wide' : g.toLowerCase()}">${g}</span>`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let game = null;
let runId = 0;
let seatEls = [];
// mode: 'wait' | 'actions' | 'raise' | 'continue'
const ui = { mode: 'wait', focus: 1, raiseTo: 0, resolve: null, shown: '', reveals: 0, slowRiver: false };
let settled = false; // false between the last action of a hand and the moment the result is shown
let overlay = null; // { items, focus, closable }

// ---------- rendering ----------
function cardEl(c, face, cls = '') {
  const el = h('div', `card ${cls}`);
  if (!face) { el.append(h('div', 'in back')); return el; }
  const r = RANKS[c >> 2], s = c & 3;
  el.dataset.c = c;
  el.append(h('div', `in face ${s === 1 || s === 2 ? 'red' : 'black'}`,
    `<span class="r">${r === 'T' ? '10' : r}</span><span class="s">${SUITS[s]}</span>`));
  return el;
}

function buildSeats() {
  $('seats').innerHTML = '';
  $('board').innerHTML = '';
  seatEls = game.players.map((p) => {
    const el = h('div', `seat ${p.isHuman ? 's0 me' : 'ai'}`,
      `<div class="cards"></div><div class="badge"></div>
       <div class="plate"><div class="ava">${p.name[0]}</div>
         <div class="who"><div class="name"></div><div class="chips"></div></div><div class="hand"></div></div>
       <div class="bet" hidden><span></span></div><div class="say"></div>`);
    const c = cast[p.seat];
    el.querySelector('.name').innerHTML = `${p.name}${c.tag ? ` <i>${c.tag}</i>` : ''}`;
    if (!p.isHuman) { // spread the opponents evenly along the top
      const n = game.players.length - 1;
      const left = n === 1 ? 50 : 13 + (p.seat - 1) * (74 / (n - 1));
      el.style.left = `${left}%`;
      el.style.setProperty('--pc', c.color);
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
    const sig = show ? p.cards.map((c) => (face ? c : 'x')).join() : '';
    const cards = el.querySelector('.cards');
    const old = cards.dataset.sig || '';
    if (old !== sig) {
      cards.dataset.sig = sig;
      if (!sig) { // folded: toss the cards away
        for (const c of cards.children) c.classList.add('toss');
        setTimeout(() => { if (!cards.dataset.sig) cards.replaceChildren(); }, 260);
      } else if (old === 'x,x') { // turn them over, one player after another
        const wait = reveals++ * REVEAL_GAP;
        cards.replaceChildren(...p.cards.map((c, k) => {
          const e = cardEl(c, true, 'flip');
          e.style.animationDelay = `${wait + k * 90}ms`;
          return e;
        }));
        audio.flip(wait / 1000);
      } else {
        const delay = (k) => (dealOrder(i) + k * n) * DEAL_GAP;
        cards.replaceChildren(...p.cards.map((c, k) => {
          const e = cardEl(c, face && !p.isHuman, 'deal');
          e.style.animationDelay = `${delay(k)}ms`;
          return e;
        }));
        if (p.isHuman) { // your cards land face down, then you get to look
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
    if (!p.folded && face && g.board.length >= 3) hand = describe(evaluate([...p.cards, ...g.board]));
    const handEl = el.querySelector('.hand');
    if (ui.slowRiver && g.board.length === 5 && g.stage !== 'handOver') { /* river still in the air: don't give it away */ }
    else if (odds && odds[i] !== undefined) { // all-in: show each player's chance of winning
      const pct = `${Math.round(odds[i] * 100)}%`;
      const html = `${hand ? `${hand} ` : ''}<b>${pct}</b>`;
      if (handEl.innerHTML !== html) { handEl.innerHTML = html; fx.pop(handEl, 1.3); }
    } else if (handEl.textContent !== hand || handEl.children.length) handEl.textContent = hand;
    const badge = el.querySelector('.badge');
    const a = over ? '' : p.lastAction;
    if (badge.textContent !== a) {
      badge.textContent = a;
      badge.className = 'badge ' + (a === 'Fold' ? 'fold' : a.startsWith('All-in') ? 'allin' : /^(Bet|Raise)/.test(a) ? 'raise' : '');
      if (a) fx.pop(badge, 1.5);
    }
    const bet = el.querySelector('.bet');
    if (p.bet) { bet.hidden = false; bet.classList.remove('leaving'); fx.roll(bet.firstChild, p.bet, { dur: 200 }); }
    else { bet.hidden = true; bet.firstChild._cur = 0; }
    const d = el.querySelector('.dealer');
    if (g.dealer === i && !d) el.querySelector('.plate').append(h('div', 'dealer', 'D'));
    else if (g.dealer !== i && d) d.remove();
  });

  const board = $('board');
  if (board.children.length > g.board.length) board.innerHTML = '';
  const fresh = g.board.length - board.children.length;
  for (let i = board.children.length, k = 0; i < g.board.length; i++, k++) {
    const slow = ui.slowRiver && i === 4;
    const e = cardEl(g.board[i], true, slow ? 'slam' : 'drop');
    e.style.animationDelay = `${k * 130}ms`;
    board.append(e);
    if (!slow) audio.card(k * 0.13);
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
  const msg = over ? g.result.text : '';
  if ($('msg').textContent !== msg) {
    $('msg').textContent = msg;
    $('msg').classList.toggle('show', !!msg);
  }
  const left = g.players.filter((p) => !p.isHuman && !p.out && (p.chips > 0 || p.total > 0)).length;
  $('hud').innerHTML = `Table <b>${table}</b> &middot; <b>${g.sb}/${g.bb}</b><br>Hand <b>${g.handNo}</b> &middot; <b>${left}</b> left`;
  ui.reveals = reveals;
  renderActions();
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
      ['call', `${glyph('X')}<span>${L.canCheck ? 'Check' : `Call<small>${L.toCall}</small>`}</span>`, () => choose('call'), false],
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
function showOverlay({ title, body, items, closable = false }) {
  overlay = { items, focus: 0, closable };
  const el = $('overlay');
  el.innerHTML = '';
  const d = h('div', 'dialog');
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
      ? [[`${glyph('A')}Continue \u2013 Table ${saved.table}`, () => startTable(saved.table, saved)], ['New run', () => startTable(1)]]
      : [[`${glyph('A')}Play`, () => startTable(1)]],
  });
}
function pauseMenu() {
  audio.tick();
  showOverlay({
    title: TITLE, body: CONTROLS, closable: true,
    items: [
      ['Resume'],
      [() => `Sound: ${audio.settings.sfx ? 'On' : 'Off'}`, () => audio.setSfx(!audio.settings.sfx), true],
      [() => `Music: ${audio.settings.music ? 'On' : 'Off'}`, () => audio.setMusic(!audio.settings.music), true],
      ['New run', () => startTable(1)],
    ],
  });
}
function tableIntro(start) {
  const cfg = tableConfig(table);
  const who = cfg.names.map((n) => `<b>${n}</b> <i>${CHARACTERS[n].tag}</i>`).join(' &middot; ');
  showOverlay({
    title: `Table <span>${table}</span>`,
    body: `<p>Knock out all ${cfg.names.length} to move up. Everyone starts with 1,000. Blinds rise every ${cfg.handsPerLevel} hands.</p><p class="who">${who}</p>`,
    items: [[`${glyph('A')}Deal me in`, start]],
  });
}
function tableCleared() {
  audio.musicLevel(0);
  audio.win(3); fx.burst($('center'), 60);
  try { localStorage.setItem('padpoker.best', Math.max(best(), table)); } catch { /* private mode */ }
  writeSave({ table: table + 1, habits });
  showOverlay({
    title: 'Table <span>cleared!</span>',
    body: `<p>You took every chip at Table ${table} in ${game.handNo} hands. The next table is tougher.</p>`,
    items: [[`${glyph('A')}Table ${table + 1}`, () => startTable(table + 1)]],
  });
}
function busted() {
  audio.musicLevel(0);
  audio.lose();
  writeSave(null);
  const cleared = table - 1;
  showOverlay({
    title: 'Busted',
    body: `<p>Out at Table ${table} after ${game.handNo} hands, with ${tables(cleared)} cleared. Best run: ${tables(best())}.</p>`,
    items: [[`${glyph('A')}New run`, () => startTable(1)]],
  });
}

// ---------- input ----------
function onButton(b) {
  if (!audio.unlock() && !onButton.warned) {
    onButton.warned = true;
    toast('Tap the screen once to turn sound on');
  }
  if (overlay) {
    if (b === 'up' || b === 'left') overlayFocus(-1);
    else if (b === 'down' || b === 'right') overlayFocus(1);
    else if (b === 'a') $('overlay').querySelectorAll('.items .btn')[overlay.focus].click();
    else if ((b === 'b' || b === 'start') && overlay.closable) { audio.back(); closeOverlay(); }
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
  } else if (ui.mode === 'continue') {
    if (b === 'a' || b === 'x') { audio.confirm(); finish(); }
  }
}

// ---------- effects tied to game events ----------
function actionFx(p, potBefore) {
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
    audio.allin();
    setTimeout(() => { fx.shake(10, 500); fx.rumble(1, 1, 350); fx.banner('All in!'); }, 450);
  } else {
    if (a.startsWith('Call')) audio.chips(2, 0.05);
    else audio.raise(size > 0.6 ? 4 : 3);
    if (/^(Bet|Raise)/.test(a) && size > 0.6) { fx.shake(3, 220); fx.rumble(0.4, 0.6, 90); }
  }
}

async function collectBets() {
  const bets = seatEls.map((el) => el.querySelector('.bet')).filter((b) => !b.hidden);
  if (!bets.length) return;
  for (const b of bets) { fx.flyChips(b, $('pot'), 2, { stagger: 30 }); b.classList.add('leaving'); }
  audio.chips(Math.min(5, bets.length + 1), 0.3, -3);
  await sleep(420);
  fx.pop($('pot'), 1.2);
}

function handOverFx() {
  const g = game, me = g.players[ME];
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
      fx.rumble(0.6, 1, 120 + size * 80);
    }, 250);
  } else if (!me.folded && g.result.showdown) audio.lose();
  else audio.win(0);
}

// ---------- opponent character ----------
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
  const badge = seatEls[seat].querySelector('.badge');
  badge.textContent = '\u2022 \u2022 \u2022';
  badge.className = 'badge think';
}
function say(p, moment) {
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
    if (s.chips && (s.chips.length !== tableConfig(s.table).names.length + 1 || !(s.chips[ME] > 0))) return null;
    return s;
  } catch { return null; }
}
function writeSave(s) {
  try { s ? localStorage.setItem(SAVE_KEY, JSON.stringify(s)) : localStorage.removeItem(SAVE_KEY); } catch { /* private mode */ }
}

// Start (or resume) a table. `saved` may carry mid-table chip stacks.
function startTable(n, saved) {
  table = n;
  const cfg = tableConfig(n);
  cast = [YOU, ...cfg.names.map((name) => ({ name, ...CHARACTERS[name], style: { ...CHARACTERS[name].style, skill: cfg.skill } }))];
  game = new Game({ players: cast, handsPerLevel: cfg.handsPerLevel });
  if (n === 1 && !saved) habits = { facing: 0, folds: 0, acts: 0, raises: 0 };
  if (saved?.habits) habits = saved.habits;
  if (saved?.chips) {
    game.players.forEach((p, i) => { p.chips = saved.chips[i]; p.out = p.chips <= 0; });
    game.dealer = saved.dealer;
    game.handNo = saved.handNo;
  } else writeSave({ table: n, habits });
  buildSeats();
  $('msg').textContent = ''; $('msg').classList.remove('show');
  $('pot').hidden = true;
  $('hud').innerHTML = `Table <b>${table}</b>`;
  ui.mode = 'wait'; ui.resolve = null;
  runId++; // stop any game loop still running from the previous table
  renderActions();
  if (saved?.chips) run(); else tableIntro(run);
}

async function run() {
  const id = ++runId;
  const g = game;
  const me = g.players[ME];
  while (g.startHand()) {
    audio.tension(false);
    audio.newHand();
    bluffers.clear();
    audio.musicLevel(1);
    settled = false;
    render();
    const n = g.players.length;
    for (const p of g.players) if (!p.out) for (const k of [0, 1]) audio.card((dealOrder(p.seat) + k * n) * DEAL_GAP / 1000);
    audio.chips(2, 0.1, 0);
    await sleep(2 * n * DEAL_GAP + 850);
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
          ui.slowRiver = o.some((x) => x > 0.02 && x < 0.98);
          await sleep(g.street === 'river' ? 900 : ui.slowRiver ? 1700 : 1300);
          if (ui.slowRiver) { audio.heartbeat(); fx.rumble(0.8, 0.2, 120); }
        } else await sleep(250);
        if (id !== runId) return;
        g.nextStreet();
        audio.musicLevel(2);
        render();
        if (ui.slowRiver && g.board.length === 5) {
          audio.riverSlam();
          await sleep(1000);
          fx.shake(8, 400); fx.rumble(1, 1, 250);
          await sleep(500);
        }
        continue;
      }
      const p = g.players[g.toAct];
      let a;
      if (p.isHuman) {
        audio.turn(); fx.rumble(0.2, 0.5, 70);
        a = await prompt('actions');
        noteHumanAction(a, g.legal(ME));
      } else {
        a = decide(g, p.seat, Math.random, humanProfile());
        const wait = me.folded ? 300 : thinkTime(p, a);
        if (wait > 1100) showThinking(p.seat);
        if (wait > 2000 && Math.random() < 0.35) say(p, 'tank');
        await sleep(wait);
        if (a.bluff && a.type === 'raise') bluffers.add(p.seat);
      }
      if (id !== runId) return;
      const potBefore = g.pot;
      g.act(a.type, a.amount);
      render();
      actionFx(p, potBefore);
    }
    audio.tension(false);
    // let everyone turn their cards over before the result lands
    render();
    if (ui.reveals) await sleep(ui.reveals * REVEAL_GAP + 500);
    if (id !== runId) return;
    settled = true;
    render();
    handOverFx();
    setTimeout(handOverBanter, 700);
    writeSave({ table, chips: g.players.map((p) => p.chips), dealer: g.dealer, handNo: g.handNo, habits });
    await sleep(500);
    await prompt('continue');
    if (id !== runId) return;
    if (me.chips === 0) return busted();
    if (stale) return location.reload(); // new version deployed: pick it up between hands
  }
  if (me.chips > 0) tableCleared(); else busted();
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
startScreen();
window.__poker = { get game() { return game; }, ui };

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
