import { facingBet, rangeEquity } from './coach.js';
import { cashHud } from './tables.js';
import { equity } from './ai.js';
import * as audio from './audio.js';
import { RANKS, SUITS, bestFiveOf, describe, scoreHand, onBoard } from './cards.js';
import { VARIANTS, tableConfig } from './config.js';
import { tableTarget } from './trip.js';
import { DEAL_GAP, REVEAL_GAP, SHUFFLE_MS, mine } from './core.js';
import { DAILY_HANDS } from './daily.js';
import { face } from './faces.js';
import * as fx from './fx.js';
import { netBroadcast, netOn } from './online.js';
import { prefs, ui } from './prefs.js';
import { oddsFor, renderActions, startSqueeze } from './squeeze.js';
import { S } from './state.js';
import { $, h } from './util.js';

 // { items, focus, closable }

// ---------- rendering ----------
// cover: the card arrives face down and turns over at the end of its entry animation
export function cardEl(c, face, cls = '', cover = false) {
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
export const chipCount = (amount, per, max) => Math.max(1, Math.min(max, Math.round(Math.log2(amount / S.game.bb + 1) * per)));
export function setPile(el, n, scatter = 0) { // scatter 0..1: a thrown bet lands as a looser, messier heap
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

export function buildSeats(keepBoard = false) {
  $('seats').innerHTML = '';
  if (!keepBoard) $('board').innerHTML = '';
  S.seatEls = S.game.players.map((p) => {
    const el = h('div', `seat ${mine(p) ? 's0 me' : 'ai'}`,
      `<div class="cards"></div><div class="badge"></div>
       <div class="plate"><div class="ava" data-mood="idle">${S.cast[p.seat].face ? face(S.cast[p.seat].face) : p.isHuman || S.cast[p.seat].badge ? (S.cast[p.seat].badge || p.name[0]) : face(p.name)}</div>
         <div class="who"><div class="name"></div><div class="chips"></div></div><div class="hand"></div></div>
       <div class="bet" hidden><span></span><em class="pile"></em></div><div class="say"></div><div class="clock"><i></i><b></b></div>`);
    const c = S.cast[p.seat];
    el.querySelector('.name').innerHTML = `${p.name}${c.tag ? ` <i>${c.tag}</i>` : ''}`;
    if (!mine(p)) { // spread everyone else evenly along the top, in order round the table from the viewer
      const n = S.game.players.length - 1;
      const slot = (p.seat - S.ME - 1 + S.game.players.length) % S.game.players.length;
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

export const dealOrder = (seat) => (seat - S.game.dealer - 1 + S.game.players.length) % S.game.players.length;


export function render() {
  const g = S.game;
  if (!g) return; // left for the menu while something was still finishing
  const over = g.stage === 'handOver' && S.settled;
  const pending = g.stage === 'handOver' && !S.settled; // result known but not yet revealed
  const n = g.players.length;
  let reveals = 0;
  const odds = g.runout && g.board.length < 5 && g.stage !== 'handOver' ? oddsFor(g) : null;
  g.players.forEach((p, i) => {
    const el = S.seatEls[i];
    const face = (mine(p) && !ui.hidden) || (g.showCards && !p.folded);
    const show = p.cards.length && (!p.folded || mine(p));
    const seen = (k) => face || (i === S.peekSeat && k === 0 && !p.folded); // Peek perk: one opponent shows a card
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
        const sq = mine(p) && prefs.squeeze && S.mode !== 'pass' && !ui.hidden && !ui.noAnim && !S.replaying; // your cards stay face down until you squeeze them
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
        if (mine(p) && !sq && !ui.noAnim && S.mode !== 'pass' && !ui.hidden) { // your cards land face down, then turn over by themselves
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
    const turned = seenBoard(g); // only the cards that have actually been turned over
    if (!p.folded && face && known && turned.length >= 3) {
      const v = scoreHand(p.cards, turned, g.variant);
      hand = describe(v, g.variant === 'short');
      if (mine(p) && onBoard(v, turned, g.variant === 'short')) hand += ' (on the board)'; // everyone has it
    }
    const handEl = el.querySelector('.hand');
    if (ui.slowRiver && g.board.length === 5 && g.stage !== 'handOver') { /* river still in the air: don't give it away */ }
    else if (odds && odds[i] !== undefined) { // all-in: show each player's chance of winning
      const pct = `${Math.round(odds[i] * 100)}%`;
      const html = `${hand ? `${hand} ` : ''}<b>${pct}</b>`;
      if (handEl.innerHTML !== html) { handEl.innerHTML = html; fx.pop(handEl, 1.3); }
    } else if (mine(p) && S.mode !== 'pass' && !ui.hidden && prefs.coach && known && !p.folded && p.cards.length && g.stage !== 'handOver' && g.stage !== 'idle') {
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
  if ((ui.boardShown ?? 0) > g.board.length) ui.boardShown = g.board.length; // a new hand
  for (let i = board.children.length, k = 0; i < g.board.length; i++, k++) {
    const slow = ui.slowRiver && i === 4;
    const wait = BURN_MS + k * 170;
    if (ui.noAnim) { board.append(cardEl(g.board[i], true)); ui.boardShown = i + 1; continue; }
    const dealtIn = g.handNo;
    setTimeout(() => { // the card has landed and turned: now it may be named
      if (S.game !== g || g.handNo !== dealtIn || g.board.length <= i) return; // (a timer left over from an earlier hand must not count)
      ui.boardShown = Math.max(ui.boardShown ?? 0, i + 1);
      render();
    }, wait + (slow ? 1300 : 560)); // putting a table back: no dealing, no sound
    const e = cardEl(g.board[i], true, slow ? 'slam' : 'drop', true);
    // each board card slides out from the deck, which sits just right of the fifth slot
    e.style.setProperty('--dx', `${17.59 - i * 3.382}em`);
    e.style.animationDelay = `${wait}ms`;
    e.firstChild.style.animationDelay = `${wait}ms`; // the card-back cover keeps time with the card
    board.append(e);
    if (!slow) { audio.card(wait / 1000); audio.flip(wait / 1000 + 0.3); }
  }
  if (fresh && !g.players[S.ME].folded) fx.pop(S.seatEls[S.ME].querySelector('.hand'), 1.3);

  // highlight the winning five at showdown
  const hl = new Set();
  if (over && g.result.showdown) {
    for (const s of g.result.winners) for (const c of bestFiveOf(g.players[s].cards, g.board, g.variant)) hl.add(`${s}:${c}`).add(`b:${c}`);
  }
  const mark = (el, key) => {
    el.classList.toggle('hl', hl.has(key));
    el.classList.toggle('dim', hl.size > 0 && !hl.has(key));
  };
  for (const el of /** @type {any} */ (board.children)) mark(el, `b:${el.dataset.c}`);
  S.seatEls.forEach((s, i) => { for (const el of s.querySelectorAll('.card[data-c]')) mark(el, `${i}:${el.dataset.c}`); });

  const pot = shownPot(g), wasHidden = $('pot').hidden;
  $('pot').hidden = !pot || over;
  if (wasHidden) $('pot-n')._cur = undefined; // a pot that has just appeared shows its amount at once, rather than counting up from nothing
  fx.roll($('pot-n'), over ? 0 : pot, { dur: 300 });
  if (pot && !over) setPile($('pot-chips'), chipCount(pot, 3, 16));
  const msg = over ? g.result.text : '';
  if ($('msg').textContent !== msg) {
    $('msg').textContent = msg;
    $('msg').classList.toggle('show', !!msg);
  }
  const left = g.players.filter((p) => !mine(p) && !p.out && (p.chips > 0 || p.total > 0)).length;
  $('hud').innerHTML = S.mode === 'daily'
    ? `<b>Daily</b> &middot; <b>${g.sb}/${g.bb}</b><br>Hand <b>${g.handNo}</b> of ${DAILY_HANDS}`
    : S.mode === 'net' ? `<b>Online ${S.net?.code || ''}</b> &middot; <b>${g.sb}/${g.bb}</b><br>Hand <b>${g.handNo}</b> &middot; ${S.net?.watch ? '<b>watching</b>' : `you are <b>${g.players[S.ME].name}</b>`}${g.watching && !S.net?.watch ? ` &middot; ${g.watching} watching` : ''}`
    : S.mode === 'pass' ? `<b>Pass &amp; play</b> &middot; <b>${g.sb}/${g.bb}</b><br>Hand <b>${g.handNo}</b>`
    : S.mode === 'cash' ? cashHud(g)
    : S.mode === 'quick' ? `<b>${g.variant === 'holdem' ? 'Quick' : VARIANTS[g.variant].name}</b> &middot; <b>${g.sb}/${g.bb}</b><br>Hand <b>${g.handNo}</b> &middot; vs <b>${left}</b>`
    : S.mode === 'run' && !S.bossMode ? runHud(g)
    : `${S.bossMode ? '<b>Boss</b>' : `Table <b>${S.table}</b>`} &middot; <b>${g.sb}/${g.bb}</b><br>Hand <b>${g.handNo}</b> &middot; vs <b>${left}</b>${S.mode === 'run' && S.perks.heater && S.heat > 0 ? ` &middot; <b class="heat">heat ${S.heat}</b>` : ''}`;
  ui.reveals = reveals;
  if (S.replaying) $('hud').innerHTML = `<b>Replay</b><br>Hand <b>${g.handNo}</b>`;
  if (netOn('host') && S.net.started && !S.replaying && g === S.game) netBroadcast();
  renderActions();
}

// The HUD of a normal run table: the chip target, and what you have towards it.
function runHud(g) {
  const me = g.players[S.ME], live = g.stage === 'betting' || g.stage === 'streetEnd', pending = g.stage === 'handOver' && !S.settled;
  const stack = me.chips + (!live && pending ? me.total - me.won : 0); // what you have behind, as your plate shows it; a result is counted once it is shown
  return `Table <b>${S.table}</b> &middot; <b>${g.sb}/${g.bb}</b><br>Goal <b>${tableTarget(tableConfig(S.table).chips).toLocaleString()}</b> &middot; you have ${stack.toLocaleString()}${S.perks.heater && S.heat > 0 ? ` &middot; <b class="heat">heat ${S.heat}</b>` : ''}`;
}

// The pot as the table shows it: without the part of the biggest stake that nobody left in could ever match
// (a shove for more than everyone else has), which is handed back at the end of the street.
export function shownPot(g) {
  const live = g.players.filter((p) => !p.folded);
  if (live.length < 2) return g.pot;
  const top = live.reduce((a, b) => (b.total > a.total ? b : a));
  const reach = Math.max(...live.filter((p) => p !== top).map((p) => p.total + p.chips));
  return g.pot - Math.max(0, top.total - reach);
}
export const BURN_MS = 300;
export function burnCard() {
  const e = h('div', 'card burn');
  e.append(h('div', 'in back'));
  e.style.rotate = `${Math.round(Math.random() * 28 - 14)}deg`;
  $('burn').append(e);
  audio.card();
}

// Coach: your chance of winning against the opponents still in, given what each is likely to hold.
/* coachCache: see state.js */
// The board as the player can see it: a card counts once it has landed and turned, not when it is dealt.
export const seenBoard = (g) => g.board.slice(0, Math.min(g.board.length, ui.boardShown ?? g.board.length));
export function coachOdds(g) {
  const opp = g.players.filter((p) => !mine(p) && !p.folded).length, board = seenBoard(g);
  const L = g.stage === 'betting' && g.toAct === S.ME ? g.legal(S.ME) : { toCall: 0 };
  const key = `${S.table}:${g.handNo}:${board.length}:${opp}:${L.toCall}`;
  if (S.coachCache.key !== key) {
    const hole = g.players[S.ME].cards, plain = !g.variant || g.variant === 'holdem';
    // Each opponent is given cards that fit their character and how hard they have bet (see rangeEquity).
    const size = L.toCall > 0 ? Math.min(1, L.toCall / Math.max(1, g.pot - L.toCall)) : 0;
    const them = g.players.filter((p) => !mine(p) && !p.folded).map((p) => ({
      loose: p.style?.loose ?? 0.5,
      pressure: L.toCall > 0 && p.seat === g.aggressor ? Math.min(1, 0.3 + 0.7 * size) : p.total > 3 * g.bb ? 0.3 : 0,
      entered: !!S.handFlags?.[p.seat]?.vpip || (L.toCall > 0 && p.seat === g.aggressor), // false for a blind who has only checked, or someone yet to act
    }));
    const eq = plain && them.length ? rangeEquity(hole, board, them, 400) : facingBet(equity(hole, board, Math.max(1, opp), 150, Math.random, g.variant), L.toCall, g.pot, g.street);
    S.coachCache = { key, pct: Math.round(eq * 100) };
  }
  return S.coachCache.pct;
}
