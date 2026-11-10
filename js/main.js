import { Game } from './engine.js';
import { decide } from './ai.js';
import { startInput } from './input.js';
import { RANKS, SUITS, evaluate, describe } from './cards.js';

const ROSTER = [
  { name: 'You', isHuman: true },
  { name: 'Mav', style: { loose: 0.8, aggr: 0.8 } },
  { name: 'Dot', style: { loose: 0.25, aggr: 0.3 } },
  { name: 'Rex', style: { loose: 0.35, aggr: 0.85 } },
  { name: 'Ivy', style: { loose: 0.75, aggr: 0.3 } },
  { name: 'Gus', style: { loose: 0.5, aggr: 0.55 } },
];
const ME = 0;

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
const ui = { mode: 'wait', focus: 1, raiseTo: 0, resolve: null };
let overlay = null; // { items, focus, closable }

// ---------- rendering ----------
function cardEl(c, face) {
  if (!face) return h('div', 'card back');
  const r = RANKS[c >> 2], s = c & 3;
  return h('div', `card face ${s === 1 || s === 2 ? 'red' : 'black'}`,
    `<span class="r">${r === 'T' ? '10' : r}</span><span class="s">${SUITS[s]}</span>`);
}

function buildSeats() {
  $('seats').innerHTML = '';
  $('board').innerHTML = '';
  seatEls = game.players.map((p) => {
    const el = h('div', `seat s${p.seat}${p.isHuman ? ' me' : ''}`,
      `<div class="cards"></div><div class="badge"></div>
       <div class="plate"><div class="name"></div><div class="chips"></div><div class="hand"></div></div>
       <div class="bet" hidden></div>`);
    el.querySelector('.name').textContent = p.name;
    $('seats').append(el);
    return el;
  });
}

function render() {
  const g = game;
  const over = g.stage === 'handOver';
  g.players.forEach((p, i) => {
    const el = seatEls[i];
    const face = p.isHuman || (g.showCards && !p.folded);
    const show = p.cards.length && (!p.folded || p.isHuman);
    const sig = show ? p.cards.map((c) => (face ? c : 'x')).join() : '';
    const cards = el.querySelector('.cards');
    if (cards.dataset.sig !== sig) {
      cards.dataset.sig = sig;
      cards.replaceChildren(...(show ? p.cards.map((c) => cardEl(c, face)) : []));
    }
    el.classList.toggle('active', g.stage === 'betting' && g.toAct === i);
    el.classList.toggle('folded', p.folded && !p.out);
    el.classList.toggle('out', p.out);
    el.classList.toggle('winner', over && p.won > 0);
    el.querySelector('.chips').textContent = p.out ? 'Out' : p.chips.toLocaleString();
    let hand = '';
    if (!p.folded && face && g.board.length >= 3) hand = describe(evaluate([...p.cards, ...g.board]));
    el.querySelector('.hand').textContent = hand;
    const badge = el.querySelector('.badge');
    const a = over ? (p.won > 0 && !g.result.showdown ? `+${p.won}` : '') : p.lastAction;
    badge.textContent = a;
    badge.className = 'badge ' + (a === 'Fold' ? 'fold' : a.startsWith('All-in') ? 'allin' : /^(Bet|Raise)/.test(a) ? 'raise' : '');
    const bet = el.querySelector('.bet');
    bet.hidden = !p.bet;
    bet.textContent = p.bet;
    let d = el.querySelector('.dealer');
    if (g.dealer === i && !d) el.querySelector('.plate').append(h('div', 'dealer', 'D'));
    else if (g.dealer !== i && d) d.remove();
  });
  const board = $('board');
  if (board.children.length > g.board.length) board.innerHTML = '';
  for (let i = board.children.length; i < g.board.length; i++) board.append(cardEl(g.board[i], true));
  $('pot').textContent = g.pot ? `Pot ${g.pot.toLocaleString()}` : '';
  $('msg').textContent = over ? g.result.text : '';
  $('hud').innerHTML = `Blinds <b>${g.sb}/${g.bb}</b><br>Hand <b>${g.handNo}</b>`;
  renderActions();
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
    setRaise(ui.raiseTo);
  } else if (ui.mode === 'continue') {
    const b = h('button', 'btn call focus', `${glyph('A')}Next hand`);
    b.onclick = () => finish();
    bar.append(b);
  }
}

function setRaise(v, moveSlider = true) {
  const L = game.legal(ME);
  ui.raiseTo = Math.max(L.minTo, Math.min(L.maxTo, Math.round(v)));
  $('raise-amt').textContent = ui.raiseTo.toLocaleString();
  $('raise-label').textContent = ui.raiseTo === L.maxTo ? 'All-in' : game.currentBet ? 'Raise to' : 'Bet';
  if (moveSlider) $('raise-slider').value = ui.raiseTo;
}

let toastTimer;
function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1600);
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
  ui.mode = 'raise';
  ui.raiseTo = presets(L)[1][1];
  renderActions();
}
function closeRaise() { ui.mode = 'actions'; ui.focus = 2; renderActions(); }
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

function showOverlay({ title, body, items, closable = false }) {
  overlay = { items, focus: 0, closable };
  const el = $('overlay');
  el.innerHTML = '';
  const d = h('div', 'dialog');
  d.append(h('div', '', `<h1>${title}</h1>${body}`));
  const list = h('div', 'items');
  items.forEach(([label, fn], i) => {
    const b = h('button', 'btn' + (i === 0 ? ' focus call' : ''), label);
    b.onclick = () => { closeOverlay(); fn?.(); };
    list.append(b);
  });
  d.append(list);
  el.append(d);
  el.hidden = false;
}
function closeOverlay() { overlay = null; $('overlay').hidden = true; }
function overlayFocus(d) {
  const n = overlay.items.length;
  overlay.focus = (overlay.focus + d + n) % n;
  [...$('overlay').querySelectorAll('.items .btn')].forEach((b, i) => {
    b.classList.toggle('focus', i === overlay.focus);
    b.classList.toggle('call', i === overlay.focus);
  });
}

const TITLE = 'Pad <span>Poker</span>';
function startScreen() {
  showOverlay({
    title: TITLE,
    body: `<p>No-limit Texas Hold'em against five AI players. Touch, keyboard or game controller.</p>${CONTROLS}`,
    items: [[`${glyph('A')}Play`, newGame]],
  });
}
function pauseMenu() {
  showOverlay({
    title: TITLE, body: CONTROLS, closable: true,
    items: [['Resume'], ['New game', newGame]],
  });
}
function gameOver(won) {
  showOverlay({
    title: won ? 'You <span>win!</span>' : 'Busted',
    body: `<p>${won ? 'You took every chip on the table' : 'You ran out of chips'} after ${game.handNo} hands.</p>`,
    items: [[`${glyph('A')}New game`, newGame]],
  });
}

// ---------- input ----------
function onButton(b) {
  if (overlay) {
    if (b === 'up' || b === 'left') overlayFocus(-1);
    else if (b === 'down' || b === 'right') overlayFocus(1);
    else if (b === 'a') $('overlay').querySelectorAll('.items .btn')[overlay.focus].click();
    else if ((b === 'b' || b === 'start') && overlay.closable) closeOverlay();
    return;
  }
  if (b === 'start') return pauseMenu();
  if (ui.mode === 'actions') {
    const L = game.legal(ME);
    const n = L.canRaise ? 3 : 2;
    if (b === 'left') { ui.focus = Math.max(0, ui.focus - 1); renderActions(); }
    else if (b === 'right') { ui.focus = Math.min(n - 1, ui.focus + 1); renderActions(); }
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
    if (b === 'a' || b === 'x') finish();
  }
}

// ---------- game loop ----------
function newGame() {
  game = new Game({ players: ROSTER });
  buildSeats();
  ui.mode = 'wait'; ui.resolve = null;
  run();
}

async function run() {
  const id = ++runId;
  const g = game;
  const me = g.players[ME];
  while (g.startHand()) {
    render();
    await sleep(700);
    while (g.stage !== 'handOver') {
      if (id !== runId) return;
      if (g.stage === 'streetEnd') {
        await sleep(g.runout ? 1100 : 550);
        if (id !== runId) return;
        g.nextStreet();
        render();
        continue;
      }
      const p = g.players[g.toAct];
      let a;
      if (p.isHuman) {
        a = await prompt('actions');
      } else {
        await sleep(me.folded ? 280 : 550 + Math.random() * 650);
        a = decide(g, p.seat);
      }
      if (id !== runId) return;
      g.act(a.type, a.amount);
      render();
    }
    render();
    await prompt('continue');
    if (id !== runId) return;
    if (me.chips === 0) return gameOver(false);
  }
  gameOver(me.chips > 0);
}

// ---------- boot ----------
$('menu-btn').onclick = () => { if (!overlay && game) pauseMenu(); };
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
