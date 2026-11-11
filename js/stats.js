import { RANKS, SUITS } from './cards.js';
import { S } from './state.js';
import { $ } from './util.js';

// ---------- stats and hand history ----------
export const STATS0 = { hands: 0, won: 0, biggest: 0, showdowns: 0, showdownsWon: 0, allins: 0, allinsWon: 0, knockouts: 0, tables: 0, runs: 0, bosses: 0, online: 0, onlineWins: 0, bestScore: 0, bestHand: '' };
export const stats = { ...STATS0 };
try { Object.assign(stats, JSON.parse(localStorage.getItem('padpoker.stats')) || {}); } catch { /* private mode */ }
export const saveStats = () => { try { localStorage.setItem('padpoker.stats', JSON.stringify(stats)); } catch { /* private mode */ } };
export const RUN0 = { hands: 0, won: 0, biggest: 0, showdowns: 0, showdownsWon: 0, knockouts: 0, bestScore: 0, bestHand: '', startBest: 0, seed: 0 };
S.runStats = { ...RUN0 }; // this run only; saved with the game
/* handLog: see state.js */ // the hand in progress
/* lastHand: see state.js */ // the most recent finished hand
export const history = []; // the last 40 finished hands this session, oldest first
export const cardText = (c) => `<span class="s${c & 3} ${(c & 3) === 1 || (c & 3) === 2 ? 'rd' : 'bk'}">${RANKS[c >> 2] === 'T' ? '10' : RANKS[c >> 2]}${SUITS[c & 3]}</span>`;
export const cardsText = (cs) => cs.map(cardText).join(' ');

export function logStart(g, before) {
  S.handLog = {
    no: g.handNo, table: S.table, where: S.mode === 'daily' ? 'Daily deal' : S.mode === 'quick' ? 'Sit & go' : S.mode === 'cash' ? 'Cash game' : S.bossMode ? 'Boss' : `Table ${S.table}`,
    run: S.mode === 'run' ? S.runStats?.seed || 0 : 0, blinds: `${g.sb}/${g.bb}`, hole: [...g.players[S.ME].cards], streets: [{ name: 'Preflop', board: [], acts: [] }], shown: [], result: '',
    // enough to play the hand back exactly: who sat where, the stacks, the shuffled deck and every action
    cast: g.players.map((p) => p.name), before, deck: g.dealt, variant: g.variant, actions: [], mine: [], net: 0, mat: getComputedStyle($('app')).getPropertyValue('--mat'),
  };
}
export function logAction(p, a) {
  if (!S.handLog) return;
  S.handLog.streets.at(-1).acts.push(`${p.name} ${p.lastAction.toLowerCase()}`);
  S.handLog.actions.push({ type: a.type, amount: a.amount });
}
export function logStreet(g) {
  if (!S.handLog || g.stage === 'handOver') return;
  S.handLog.streets.push({ name: g.street[0].toUpperCase() + g.street.slice(1), board: [...g.board], acts: [] });
}
export function recordHand(g) {
  const me = g.players[S.ME];
  if (S.handLog) {
    if (g.result.showdown) S.handLog.shown = g.players.filter((p) => !p.folded).map((p) => ({ name: p.name, cards: [...p.cards], hand: p.handName }));
    S.handLog.board = [...g.board];
    S.handLog.result = g.result.text;
    S.handLog.net = me.chips - S.handLog.before.chips[S.ME];
    S.lastHand = S.handLog; S.handLog = null;
    history.push(S.lastHand); if (history.length > 40) history.shift();
  }
  const kos = me.won > 0 ? g.players.filter((p) => !p.isHuman && !p.out && p.chips === 0 && p.total > 0).length : 0;
  for (const st of S.mode === 'run' ? [stats, S.runStats] : [stats]) {
    st.hands++;
    if (me.won > 0) { st.won++; st.biggest = Math.max(st.biggest, me.won); }
    if (g.result.showdown && !me.folded && me.score > st.bestScore) { st.bestScore = me.score; st.bestHand = me.handName; }
    st.knockouts += kos;
    if (g.result.showdown && !me.folded) { st.showdowns++; if (me.won > 0) st.showdownsWon++; }
  }
  if (me.allIn) { stats.allins++; if (me.won > 0) stats.allinsWon++; }
  saveStats();
  return kos;
}
