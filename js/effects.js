import * as audio from './audio.js';
import { say, setMood } from './character.js';
import { mine, sleep } from './core.js';
import * as fx from './fx.js';
import { netEffect } from './online.js';
import { ui } from './prefs.js';
import { chipCount, setPile } from './render.js';
import { S } from './state.js';
import { $ } from './util.js';

// ---------- effects tied to game events ----------
export function actionFx(p, potBefore) {
  if (S.fast) return;
  netEffect('act', { seat: p.seat, pot: potBefore });
  { // your own actions each have their own feel; other players' bets are a faint nudge
    const a0 = p.lastAction;
    const kind = a0 === 'Fold' ? 'fold' : a0 === 'Check' ? 'check' : a0.startsWith('Call') ? 'call' : a0.startsWith('All-in') ? '' : 'raise';
    if (mine(p)) fx.haptic(kind); else if (kind === 'raise') fx.haptic('nudge');
  }
  const el = S.seatEls[p.seat];
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
    for (const q of S.game.players) if (q !== p && !q.folded && !q.out) setTimeout(() => setMood(q.seat, 'shock', 1500), 450);
    audio.allin();
    fx.haptic('allin');
    setTimeout(() => { fx.shake(10, 500); fx.banner('All in!'); }, 450);
  } else {
    if (a.startsWith('Call')) audio.chips(2, 0.05);
    else audio.raise(size > 0.6 ? 4 : 3);
    if (/^(Bet|Raise)/.test(a) && size > 0.6) fx.shake(3, 220);
  }
}

export async function collectBets(wait = sleep) { // replays pass their own timer, since the game's is frozen during a replay
  if (S.fast) return;
  netEffect('collect');
  const bets = S.seatEls.map((el) => el.querySelector('.bet')).filter((b) => !b.hidden);
  if (!bets.length) return;
  for (const b of bets) { fx.flyChips(b, $('pot'), 2, { stagger: 30 }); b.classList.add('leaving'); }
  audio.chips(Math.min(5, bets.length + 1), 0.3, -3);
  await wait(420);
  fx.pop($('pot'), 1.2);
}

export function handOverFx() {
  netEffect('over');
  const g = S.game, me = g.players[S.ME];
  S.lastWinner = g.result.winners[0];
  for (const p of g.players) {
    if (p.out) continue;
    if (p.won > 0) setMood(p.seat, 'happy');
    else if (p.chips === 0 || (g.result.showdown && !p.folded)) setMood(p.seat, 'sad');
  }
  const total = g.players.reduce((s, p) => s + p.won, 0);
  for (const s of g.result.winners) {
    const p = g.players[s], plate = S.seatEls[s].querySelector('.plate');
    const n = Math.max(4, Math.min(14, Math.round(p.won / g.bb / 2)));
    fx.flyChips($('center'), plate, n, { stagger: 50, onLand: (i) => { if (i % 2 === 0) audio.chips(1, 0, i / 2); } });
    const net = p.won - p.total; // what the hand actually made them, not the size of the pot
    if (net > 0) setTimeout(() => fx.floatText(plate, `+${net.toLocaleString()}`, mine(p) ? 'big' : ''), 350);
  }
  if (me.total > me.won) { // any hand that cost you chips, folded or not: say what it cost
    const cost = me.total - me.won;
    setTimeout(() => fx.floatText(S.seatEls[S.ME].querySelector('.plate'), `\u2212${cost.toLocaleString()}`, 'lost'), 350);
    if (g.result.showdown && !me.folded && S.mode !== 'pass' && S.mode !== 'net') {
      const w = g.players[g.result.winners.find((s) => s !== S.ME)];
      if (w?.handName && me.handName) {
        const lower = (t) => t.replace(/^(Two Pair|Pair|Full House|Straight Flush|Straight|Flush|Royal Flush|Three|Four)/, (m) => (/^(Two|Three|Four)/.test(m) ? '' : 'a ') + m.toLowerCase());
        const text = `${w.name} had ${lower(w.handName)}; you had ${lower(me.handName)}.`;
        let tries = 0; // wait for the end of any banner already on screen (a bonus or lifeline) rather than overlap it
        const show = () => {
          if (S.game !== g) return;
          if (document.querySelector('#fx .bannerfx') && tries++ < 6) return void setTimeout(show, 500);
          fx.banner(text, 'info beat');
        };
        setTimeout(show, 1200);
      }
    }
  }
  if (me.won > 0) {
    const size = me.won >= total && me.won > 40 * g.bb ? 3 : me.won > 12 * g.bb ? 2 : 1;
    audio.win(size);
    setTimeout(() => {
      fx.burst(S.seatEls[S.ME].querySelector('.cards'), 14 + size * 14);
      if (size > 1) fx.shake(size * 3, 400);
      fx.haptic(size >= 3 ? 'win3' : 'win1');
    }, 250);
  } else if (!me.folded && g.result.showdown) { audio.lose(); fx.haptic('lose'); }
  else audio.win(0);
}
