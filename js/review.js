import { judge, leaks } from './coach.js';
import { showOverlay } from './menus.js';
import { replayHand } from './replay.js';
import { cardsText, history } from './stats.js';
import { glyph } from './util.js';

// ---------- review: how did you play it? ----------
// (How a decision is judged, and how the judgements add up into leaks, is in coach.js.)
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
      <table class="log review">${rows}</table><p class="note">Chances are estimates against what each opponent is likely to hold, given how they play and how they bet.</p>`,
  });
}
// The hands that mattered most: the biggest swings, losses first.
// run: a run's seed, to look only at that run's hands (each hand is logged with the seed of the run it was played in).
// The last hand of that run, the one that ended it, always comes first.
export function keyHands(run = 0) {
  const pool = history.filter((x) => !run || x.run === run);
  const top = pool.filter((x) => x.mine.length).sort((a, b) => Math.abs(b.net) - Math.abs(a.net)).slice(0, 5).sort((a, b) => a.net - b.net);
  const last = run ? pool.at(-1) : null;
  return last ? [last, ...top.filter((x) => x !== last)] : top;
}

// The coach's report: every decision in the hands you have played this session, added up into
// what you do well and what is costing you, worst first.
export function coachReport(back) {
  const r = leaks(history);
  const rows = r.list.map((l) => `<tr><td><span class="mark ${l.kind}">${MARK[l.kind]}</span></td><td><b>${l.name}</b><br>${l.count} time${l.count === 1 ? '' : 's'}${l.cost ? ` &middot; ${l.cost.toLocaleString()} chips` : ''}</td><td>${l.tip}</td></tr>`).join('');
  showOverlay({
    title: 'Coach <span>report</span>', wide: true, closable: true, onClose: back,
    body: r.total ? `<p>${r.total} decision${r.total === 1 ? '' : 's'} over ${r.hands} hand${r.hands === 1 ? '' : 's'} this session &middot; <b>${Math.round(r.sound * 100)}%</b> were solid. ${r.headline}</p><table class="log review">${rows}</table>
      <p class="note">Chances are estimates against what each opponent is likely to hold, given how they play and how they bet.</p>`
      : '<p>Play a few hands and the coach will have something to say.</p>',
    items: [...(keyHands().length ? [[`${glyph('A')}Review key hands`, () => reviewScreen(keyHands(), 0, () => coachReport(back))]] : []), [`${glyph('B')}Back`, back]],
  });
}
