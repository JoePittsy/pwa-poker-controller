import { award } from './achievements.js';
import { runoutOdds } from './ai.js';
import * as audio from './audio.js';
import * as fx from './fx.js';
import { upAmount } from './input.js';
import { prefs, ui } from './prefs.js';
import { render } from './render.js';
import { stopReplay } from './replay.js';
import { S } from './state.js';
import { choose, closeRaise, confirmRaise, finish, openRaise, skipHand } from './turn.js';
import { $, glyph, h } from './util.js';

// ---------- squeezing your cards ----------
// Your hole cards land face down. Hold up on the stick (or D-pad, or drag the cards upward)
// to peel the backs away from the bottom; let go and they settle back. Peel all the way,
// or press A, and they are yours to see. Nothing else waits on it until it is your turn.
/* squeeze: see state.js */ // { el, sig, peel, drag, done }
export function startSqueeze(el, sig) {
  ui.squeezed = false;
  el.classList.remove('revealed');
  el.style.setProperty('--peel', 0);
  S.squeeze = { el, sig, peel: 0, drag: 0, done: null, ticked: 0 };
  const sq = S.squeeze;
  const loop = () => {
    if (S.squeeze !== sq || ui.squeezed) return;
    if (el.dataset.sig !== sig) { S.squeeze = null; ui.squeezed = true; return; } // the hand is gone
    const target = S.overlay ? 0 : Math.max(upAmount(), sq.drag);
    sq.peel += (target - sq.peel) * (target > sq.peel ? 0.045 : 0.16);
    el.style.setProperty('--peel', sq.peel.toFixed(3));
    const step = Math.floor(sq.peel * 6);
    if (step !== sq.ticked) { sq.ticked = step; if (target > sq.peel) { audio.slider(sq.peel); fx.rumble(0.1, 0.25, 30); } }
    if (sq.peel >= 0.9) { award('sweat'); return finishSqueeze(); }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
export function finishSqueeze() {
  if (ui.squeezed) return;
  ui.squeezed = true;
  const sq = S.squeeze; S.squeeze = null;
  sq?.el.classList.add('revealed');
  sq?.el.style.setProperty('--peel', 0);
  audio.flip(); fx.rumble(0.3, 0.6, 80);
  if (ui.mode === 'squeeze') ui.mode = 'wait';
  if (S.game && S.game.stage !== 'idle') render();
  sq?.done?.();
}
// Called when it is your turn: you have to look before you act.
export function waitForSqueeze() {
  if (ui.squeezed || !S.squeeze) return Promise.resolve();
  ui.mode = 'squeeze';
  renderActions();
  return new Promise((r) => { S.squeeze.done = r; });
}
{ // drag the cards upward with a finger or mouse
  let y0 = null;
  addEventListener('pointerdown', (e) => { if (S.squeeze && /** @type {any} */ (e.target).closest?.('.seat.me .cards')) y0 = e.clientY; });
  addEventListener('pointermove', (e) => {
    if (y0 === null || !S.squeeze) return;
    S.squeeze.drag = Math.max(0, Math.min(1, (y0 - e.clientY) / (S.squeeze.el.offsetHeight * 1.1))); // a long, gentle drag so a finger can stop part-way
  });
  for (const ev of ['pointerup', 'pointercancel']) addEventListener(ev, () => { y0 = null; if (S.squeeze) S.squeeze.drag = 0; });
}

// Win chances while an all-in is run out; worked out once per street.
/* oddsCache: see state.js */
export function oddsFor(g) {
  const key = `${g.handNo}:${g.board.length}`;
  if (S.oddsCache.key !== key) {
    const live = g.players.filter((p) => !p.folded);
    const res = runoutOdds(live.map((p) => p.cards), g.board, g.variant === 'omaha' ? 250 : 700, Math.random, g.variant);
    const odds = {};
    live.forEach((p, k) => { odds[p.seat] = res[k]; });
    S.oddsCache = { key, odds };
  }
  return S.oddsCache.odds;
}

export function presets(L) {
  const g = S.game, base = g.pot + L.toCall;
  const clamp = (v) => Math.max(L.minTo, Math.min(L.maxTo, Math.round(v / g.sb) * g.sb));
  return [
    ['Min', L.minTo],
    ['½ Pot', clamp(g.currentBet + base / 2)],
    ['Pot', clamp(g.currentBet + base)],
    ['All-in', L.maxTo],
  ];
}

export function renderActions() {
  const bar = $('actions');
  bar.innerHTML = '';
  bar.classList.toggle('enter', ui.shown !== ui.mode);
  ui.shown = ui.mode;
  if (ui.mode === 'actions') {
    const L = S.game.legal(S.ME);
    const row = h('div', 'row');
    const defs = [
      ['fold', `${glyph('B')}Fold`, () => choose('fold'), false],
      ['call', `${glyph('X')}<span>${L.canCheck ? 'Check' : `Call<small>${L.toCall}</small>`}</span>${prefs.coach && !L.canCheck ? `<em class="need">need ${Math.round((L.toCall / (S.game.pot + L.toCall)) * 100)}%</em>` : ''}`, () => choose('call'), false],
      ['raise', `${glyph('Y')}${S.game.currentBet ? 'Raise' : 'Bet'}`, openRaise, !L.canRaise],
    ];
    defs.forEach(([cls, html, fn, disabled], i) => {
      const b = h('button', `btn ${cls}${ui.focus === i ? ' focus' : ''}`, String(html));
      b.disabled = disabled;
      b.onclick = fn;
      row.append(b);
    });
    bar.append(row);
  } else if (ui.mode === 'raise') {
    const L = S.game.legal(S.ME);
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

export function setRaise(v, moveSlider = true, silent = false) {
  const L = S.game.legal(S.ME);
  const prev = ui.raiseTo;
  ui.raiseTo = Math.max(L.minTo, Math.min(L.maxTo, Math.round(v)));
  const amt = $('raise-amt');
  amt.textContent = ui.raiseTo.toLocaleString();
  const allIn = ui.raiseTo === L.maxTo;
  $('raise-label').textContent = allIn ? 'All-in' : S.game.currentBet ? 'Raise to' : 'Bet';
  amt.classList.toggle('max', allIn);
  if (moveSlider) $('raise-slider').value = ui.raiseTo;
  if (!silent && prev !== ui.raiseTo) {
    audio.slider((ui.raiseTo - L.minTo) / Math.max(1, L.maxTo - L.minTo));
    if (moveSlider) fx.pop(amt, allIn ? 1.35 : 1.15, 200);
  }
}

/* toastTimer: see state.js */
export function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(S.toastTimer);
  S.toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}
