import { showOverlay } from './menus.js';
import { replayHand } from './replay.js';
import { cardsText, history } from './stats.js';
import { glyph } from './util.js';

// ---------- review: how did you play it? ----------
// Judges each of your decisions in a hand from two numbers taken at the time: your rough
// chance of winning (against random cards for everyone still in) and the price of a call.
export function judge(d) {
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
export const MARK = { good: '\u2713', meh: '!', bad: '\u2717', bluff: '~' };
// hands: a list to step through (most interesting first); back: where B goes
export function reviewScreen(hands, at, back) {
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
export const keyHands = () => [...history].filter((x) => x.mine.length).sort((a, b) => Math.abs(b.net) - Math.abs(a.net)).slice(0, 5).sort((a, b) => a.net - b.net);
