import { readText } from './reads.js';
import { BOSSES, CHARACTERS } from './config.js';
import { face } from './faces.js';
import { showOverlay } from './menus.js';
import { S } from './state.js';
import { glyph } from './util.js';

// ---------- the notebook: what you have seen each opponent do ----------
// Kept across runs. A tell is only written down once you have seen it three times in hands
// where their cards were shown, so you could have worked it out yourself.
export const TELLS = {
  fastBluff: 'Acts fast when bluffing', slowBluff: 'Takes ages when bluffing', bigBluff: 'Overbets when bluffing',
  slowStrong: 'Slows down with a big hand', fastStrong: 'Snaps when strong', smallValue: 'Bets small with a big hand',
};
export const CLUES_NEEDED = 3;
/* notes: see state.js */
try { S.notes = JSON.parse(localStorage.getItem('padpoker.notes')) || {}; } catch { /* private mode */ }
export const saveNotes = () => { try { localStorage.setItem('padpoker.notes', JSON.stringify(S.notes)); } catch { /* private mode */ } };
/* handFlags: see state.js */ // seat -> { vpip, raised, clue } for the hand in progress
export function noteDecision(g, p, a, toCall) {
  const fl = S.handFlags[p.seat] ||= {};
  if (g.street === 'preflop' && ((a.type === 'call' && toCall > 0) || a.type === 'raise')) fl.vpip = true;
  if (a.type === 'raise') fl.raised = true;
  const tell = p.style?.tell;
  if ((a.bluff && ['fastBluff', 'slowBluff', 'bigBluff'].includes(tell) && a.type === 'raise')
    || (a.strong && ['slowStrong', 'fastStrong', 'smallValue'].includes(tell))) fl.clue = true;
}
export function noteHand(g) {
  for (const p of g.players) {
    if (p.isHuman || p.out || !p.cards.length) continue;
    const n = S.notes[p.name] ||= { hands: 0, vpip: 0, raised: 0, shown: 0, clues: 0 };
    const fl = S.handFlags[p.seat] || {};
    n.hands++;
    if (fl.vpip) n.vpip++;
    if (fl.raised) n.raised++;
    if (g.result.showdown && !p.folded) { n.shown++; if (fl.clue) n.clues = Math.min(CLUES_NEEDED, n.clues + 1); }
  }
  saveNotes();
}
export function notebookScreen(back) {
  const everyone = [...Object.keys(CHARACTERS).map((name) => ({ name, ...CHARACTERS[name] })), ...BOSSES];
  const pct = (a, b) => `${Math.round((a / b) * 100)}%`;
  const tiles = everyone.map((c) => {
    const n = S.notes[c.name];
    if (!n) return `<div class="unmet"><div class="ava">?</div><span><b>???</b><small>Not met yet</small></span></div>`;
    const tell = c.trick ? c.trick
      : !c.style.tell ? (n.hands >= 20 ? 'No tell that you can see' : 'Still watching\u2026')
        : n.clues >= CLUES_NEEDED ? TELLS[c.style.tell] : `Tell: ${n.clues} of ${CLUES_NEEDED} clues`;
    return `<div><div class="ava" data-mood="idle" style="background:${c.color}">${face(c.name)}</div><span><b>${c.name}</b> <i>${c.tag}</i><small>${n.hands >= 10 ? `Plays ${pct(n.vpip, n.hands)} of hands &middot; raises ${pct(n.raised, n.hands)} &middot; ${n.hands} hands` : `${n.hands} hands seen so far`}</small><small class="tell">${tell}</small>${readText(S.memory[c.name]) ? `<small class="read">${readText(S.memory[c.name])}</small>` : ''}</span></div>`;
  }).join('');
  showOverlay({
    title: 'Notebook', wide: true, closable: true, onClose: back,
    body: `<p>What you have seen each opponent do. A tell is written down once you have seen it ${CLUES_NEEDED} times at showdown. During a run each one also adjusts to how you play them, shown in green.</p><div class="notebook">${tiles}</div>`,
    items: [[`${glyph('B')}Back`, back]],
  });
}
