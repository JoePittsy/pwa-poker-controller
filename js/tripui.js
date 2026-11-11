// The screens of a run's trip: picking a deal, the shop between tables, and choosing the way on.
// (The rules and prices are in trip.js.)
import { award } from './achievements.js';
import * as audio from './audio.js';
import { FAMILIES, PERKS, familyCount } from './build.js';
import { LADDER } from './career.js';
import { tableConfig } from './config.js';
import { loadSave, setNextTrip, startTable, writeSave } from './loop.js';
import { pauseMenu, showOverlay, startScreen } from './menus.js';
import { perkSummary, perkTag } from './perks.js';
import { myRank } from './rank.js';
import { toast } from './squeeze.js';
import { S } from './state.js';
import { PRICES, RISKY, canWalk, cashOut, dealOf, dealsFor, newTrip, spend } from './trip.js';
import { $, glyph } from './util.js';

const money = (n) => n.toLocaleString();
// explain: say in a few words what the pocket is, for screens where a new player first meets it
export const pocketHtml = (explain = false) => `<p class="bank">Pocket <b>${money(S.trip?.pocket || 0)}</b>${explain ? ' <small>this run\u2019s winnings so far, to spend in the shop between tables</small>' : ''}${S.trip && S.trip.deal !== 'regular' ? ` &middot; ${dealOf(S.trip).name}` : ''}</p>`;

// A new run starts by choosing the deal it is played on.
export function newRun() {
  const deals = dealsFor(myRank().index);
  showOverlay({
    title: 'Pick your <span>deal</span>', perky: true, closable: true, onClose: startScreen,
    body: '<p>A run costs nothing. Chips you win go in your <b>pocket</b> to spend in the shop; a quarter of what is left at the end joins your <b>bankroll</b>.</p>',
    items: deals.map((d, i) => [`${i === 0 ? glyph('A') : ''}<span>${d.name}<small>${d.locked ? `Unlocks at the rank of ${LADDER[d.rank][1]}` : d.text}</small></span>`,
      () => { if (d.locked) { toast(`${d.name} unlocks at the rank of ${LADDER[d.rank][1]}`); return newRun(); } setNextTrip(newTrip(d.key)); startTable(1); }, false, d.locked]).concat([[`${glyph('B')}Back`, startScreen]]),
  });
  $('overlay').querySelector('.dialog').classList.add('tight');
}

// Between tables: spend what you banked. `saved` is the run as saved, with the next table in it.
export function shop(n, saved, visit = { offer: null, rerolls: 0 }) {
  const t = S.trip, boss = !!saved.boss;
  const draw = () => { const pool = Object.keys(PERKS).filter((k) => PERKS[k].stack || !S.perks[k]), out = []; while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]); return out; };
  if (!visit.offer) visit.offer = draw();
  const held = Object.values(S.perks).reduce((a, b) => a + b, 0);
  const perk = PRICES.perk(t, held), reroll = PRICES.reroll(t, visit.rerolls), boost = PRICES.boost(t), bribe = PRICES.bribe(t);
  const again = () => { writeSave({ ...saved, perks: S.perks, trip: S.trip }); shop(n, saved, visit); };
  const buy = (cost, then) => () => { if (!spend(t, cost)) { toast('Not enough in your pocket'); return shop(n, saved, visit); } then(); again(); };
  const canBribe = !boss && t.bribe !== n && tableConfig(n).names.length > 2;
  // Leaving the shop is also choosing the way on: the next table as it comes, or the hard way for a bigger cash-out.
  const go = (risky) => () => { t.risky = risky ? n : 0; writeSave({ ...saved, perks: S.perks, trip: t }); startTable(n, { ...saved, perks: S.perks, trip: t, owed: false }); };
  const cfg = tableConfig(n, boss), usual = Math.round(cfg.names.length * cfg.chips * (dealOf(t).cash || 1) / 10) * 10; // roughly what winning it banks
  const sets = Object.keys(FAMILIES).map((f) => ({ f, n: familyCount(S.perks, f) })).filter((x) => x.n > 0);
  showOverlay({
    title: 'The <span>shop</span>', wide: true, compact: true,
    body: `${pocketHtml()}${perkSummary() ? `<p class="who">You hold: ${perkSummary()}</p>` : ''}
      <div class="wares">${visit.offer.map((k) => `<p><b>${PERKS[k].name}</b>${perkTag(k)} ${PERKS[k].text}${S.perks[k] ? ` <i>You hold ${S.perks[k]}; another adds to it.</i>` : ''}</p>`).join('') || '<p>The shelf is empty. Reroll for more.</p>'}</div>
      <p class="note"><b>Sets:</b> two different perks of one family pay &times;1.5, all three &times;2${sets.length ? ` (you have ${sets.map((x) => `${x.n}/3 ${FAMILIES[x.f].name}`).join(', ')})` : ''}. Each perk costs more than the last. <b>Reroll</b> changes the offer; the stack and one-fewer deals are for the next table only.${boss ? '' : ` <b>The hard way:</b> sharper opponents with ${Math.round((RISKY.oppStack - 1) * 100)}% more chips.`}</p>`,
    items: [
      ...visit.offer.map((k, i) => [`${i === 0 ? glyph('A') : ''}${PERKS[k].name} \u00b7 ${money(perk)}`, buy(perk, () => {
        S.perks[k] = (S.perks[k] || 0) + 1; visit.offer = visit.offer.filter((x) => x !== k); audio.win(1);
        if (Object.values(S.perks).reduce((x, y) => x + y, 0) >= 3) award('loaded');
      }), false, perk > t.pocket]),
      [`Reroll \u00b7 ${money(reroll)}`, buy(reroll, () => { visit.offer = draw(); visit.rerolls++; audio.shuffle(); }), false, reroll > t.pocket],
      ...(t.boost === n ? [] : [[`+25% stack \u00b7 ${money(boost)}`, buy(boost, () => { t.boost = n; audio.chips(5, 0, 4); }), false, boost > t.pocket]]),
      ...(canBribe ? [[`One fewer opponent \u00b7 ${money(bribe)}`, buy(bribe, () => { t.bribe = n; audio.confirm(); }), false, bribe > t.pocket]] : []),
      [boss ? 'On to the boss' : `Next table \u00b7 banks about ${money(usual)}`, go(false)],
      ...(boss ? [] : [[`The hard way \u00b7 about ${money(Math.round(usual * RISKY.cash / 10) * 10)}`, go(true)]]),
    ],
  });
}

// Walking away: once half your opponents are out you may stand up with what you have won so far.
// It pays no speed bonus and the table does not count as cleared; a boss must be beaten.
export const walkOffer = () => (S.mode === 'run' && S.game && S.trip && canWalk(S.game.players, S.ME, S.bossMode) ? cashOut(S.trip, S.table, S.game.players[S.ME].chips) : -1);
let toldAt = -1; // the table at which the player was last told they may walk
export function walkHint() {
  if (walkOffer() < 0 || toldAt === S.table) return;
  toldAt = S.table;
  toast('Half the table is out: you may walk away with your winnings from the menu');
}
export function walkAway() {
  const g = S.game, me = g.players[S.ME], bank = walkOffer();
  if (bank < 0) return;
  const left = g.players.reduce((sum, p, seat) => sum + (seat === S.ME ? 0 : p.chips + p.total), 0);
  const mid = ['betting', 'streetEnd'].includes(g.stage) && me.total > 0 && !me.folded;
  showOverlay({
    title: 'Walk <span>away?</span>', closable: true, onClose: pauseMenu,
    body: `<p>Stand up now and bank <b>${money(bank)}</b>. You go on to the shop and the next table, but with no bonus, and Table ${S.table} will not count towards your best run.</p><p>Stay and win it all for the ${money(left)} still on the table, at the risk of the run.${mid ? ' The hand in progress counts as folded.' : ''}</p>`,
    items: [['Stay', pauseMenu], [`Walk away \u00b7 bank ${money(bank)}`, () => {
      const t = S.trip;
      S.runId++; // stops the game loop
      t.pocket += bank; t.banked += bank; t.walked++;
      for (const k of ['boost', 'bribe', 'risky']) if (t[k] === S.table) t[k] = 0;
      const bossNext = S.table % 3 === 0;
      writeSave({ table: bossNext ? S.table : S.table + 1, boss: bossNext, habits: S.habits, run: S.runStats, perks: S.perks, heat: S.heat, trip: t, mem: S.memory, owed: true });
      audio.musicLevel(0); audio.chips(8, 0, 6);
      showOverlay({
        title: 'Walked <span>away</span>',
        body: `<p>On to the next table. You left Table ${S.table} with ${g.players.filter((p, seat) => seat !== S.ME && p.chips > 0).length} still sitting. It does not count as cleared.</p><p class="gain">Cashed out +${money(bank)}</p>${pocketHtml()}`,
        items: [[`${glyph('A')}To the shop`, () => { const sv = loadSave(); startTable(sv.table, sv); }]],
      });
    }]],
  });
}
