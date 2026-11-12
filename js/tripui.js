// The screens of a run's trip: picking a deal, the shop between tables, and choosing the way on.
// (The rules and prices are in trip.js.)
import { award } from './achievements.js';
import * as audio from './audio.js';
import { FAMILIES, PERKS, familyCount } from './build.js';
import { FREE_RUNS, runFee } from './bank.js';
import { LADDER } from './career.js';
import { tableConfig } from './config.js';
import { loadSave, setNextTrip, startTable, writeSave } from './loop.js';
import { overlayFocus, pauseMenu, showOverlay, startScreen } from './menus.js';
import { perkSummary, perkTag } from './perks.js';
import { myRank } from './rank.js';
import { toast } from './squeeze.js';
import { bank, payRunFee, settleBank } from './tables.js';
import { S } from './state.js';
import { stats } from './stats.js';
import { PRICES, RISKY, SWEEP, canWalk, cashOut, dealOf, dealsFor, moveUpPay, newTrip, spend, tableTarget } from './trip.js';
import { tableCleared } from './replay.js';
import { $, glyph } from './util.js';

const money = (n) => n.toLocaleString();
// explain: say in a few words what the pocket is, for screens where a new player first meets it
export const pocketHtml = (explain = false) => `<p class="bank">Pocket <b>${money(S.trip?.pocket || 0)}</b>${explain ? ' <small>this run\u2019s winnings so far, to spend in the shop between tables</small>' : ''}${S.trip && S.trip.deal !== 'regular' ? ` &middot; ${dealOf(S.trip).name}` : ''}</p>`;

// A new run starts by choosing the deal it is played on, and costs a buy-in from the bankroll after the free runs.
const begin = (key, quick = false) => { if (payRunFee() < 0) return toast('Not enough in your bankroll for a run'); setNextTrip(newTrip(key)); startTable(1, undefined, quick); };
export function newRun(same = '') { // same: a deal to start on straight away, skipping the picker
  const deals = dealsFor(myRank().index);
  settleBank(); // a broke player is staked first, so the fee can always be paid
  if (same && deals.some((d) => d.key === same && !d.locked)) return begin(same, true);
  const fee = runFee(stats.runs), free = FREE_RUNS - stats.runs;
  const cost = fee ? `A run costs <b>${money(fee)}</b> from your bankroll of ${money(bank().chips)}. Chips you win go in your <b>pocket</b> to spend in the shop; half of what is left at the end comes home.`
    : `Your first ${FREE_RUNS} runs are free (${free} left). Chips you win go in your <b>pocket</b> to spend in the shop; half of what is left at the end joins your <b>bankroll</b>.`;
  showOverlay({
    title: 'Pick your <span>deal</span>', perky: true, closable: true, onClose: startScreen,
    body: `<p>${cost}</p>`,
    items: deals.map((d, i) => [`${i === 0 ? glyph('A') : ''}<span>${d.name}<small>${d.locked ? `Unlocks at the rank of ${LADDER[d.rank][1]}` : d.text}</small></span>`,
      () => { if (d.locked) { toast(`${d.name} unlocks at the rank of ${LADDER[d.rank][1]}`); return newRun(); } begin(d.key); }, false, d.locked]).concat([[`${glyph('B')}Back`, startScreen]]),
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
  const cfg = tableConfig(n, boss), usual = Math.round((boss ? cfg.names.length * cfg.chips : tableTarget(cfg.chips) - cfg.chips) * (dealOf(t).cash || 1) / 10) * 10; // roughly what winning it banks: a boss's chips, or the climb to the target
  const hard = Math.round(usual * RISKY.cash / 10) * 10;
  const can = (cost) => (cost > t.pocket ? `<i class="short">You need ${money(cost - t.pocket)} more.</i>` : '');
  const setNote = (k) => { // where buying this perk would leave its family's set
    const f = PERKS[k].family;
    if (!f) return 'It belongs to no family, so it counts towards no set.';
    const have = familyCount(S.perks, f), after = have + (S.perks[k] ? 0 : 1);
    return `<b>${FAMILIES[f].name}</b> family: ${FAMILIES[f].hint}. This would make ${after} of 3; two pay &times;1.5, all three &times;2.`;
  };
  // Each entry: [button label, what to show while it is selected, what choosing it does, greyed out?]
  const rows = [
    ...visit.offer.map((k) => [`${PERKS[k].name} \u00b7 ${money(perk)}`,
      `<b>${PERKS[k].name}</b> ${perkTag(k)}<p>${PERKS[k].text} Lasts the whole run.</p><p>${setNote(k)}</p>${S.perks[k] ? `<p>You hold ${S.perks[k]} already; another adds to it.</p>` : ''}<p>${can(perk)}</p>`,
      buy(perk, () => {
        S.perks[k] = (S.perks[k] || 0) + 1; visit.offer = visit.offer.filter((x) => x !== k); visit.focus = 0; audio.win(1);
        if (Object.values(S.perks).reduce((x, y) => x + y, 0) >= 3) award('loaded');
      }), perk > t.pocket]),
    [`Reroll \u00b7 ${money(reroll)}`, `<b>Reroll</b><p>Swap the three perks on offer for three others. It costs more each time you do it in one visit.</p><p>${can(reroll)}</p>`,
      buy(reroll, () => { visit.offer = draw(); visit.rerolls++; audio.shuffle(); }), reroll > t.pocket],
    ...(t.boost === n ? [] : [[`+25% stack \u00b7 ${money(boost)}`, `<b>Bigger stack</b><p>Start the next table with a quarter more chips. For that table only.</p><p>${can(boost)}</p>`,
      buy(boost, () => { t.boost = n; audio.chips(5, 0, 4); }), boost > t.pocket]]),
    ...(canBribe ? [[`One fewer opponent \u00b7 ${money(bribe)}`, `<b>One fewer opponent</b><p>Pay one player to stay away from the next table: ${cfg.names.length - 1} to beat, not ${cfg.names.length}. For that table only.</p><p>${can(bribe)}</p>`,
      buy(bribe, () => { t.bribe = n; audio.confirm(); }), bribe > t.pocket]] : []),
    [boss ? 'On to the boss' : 'Next table', boss ? `<b>${cfg.boss.name}, ${cfg.boss.tag}</b><p>One on one. Beat them to carry on; lose and the run is over.</p>`
      : `<b>Table ${n}: ${cfg.venue}</b><p>${cfg.names.length} opponents, as they come. ${boss ? 'Winning it' : 'Reaching the target'} banks about <b>${money(usual)}</b>${boss ? ', more if you are quick' : ', more if you stay and knock everyone out'}.</p>`, go(false), false],
    ...(boss ? [] : [['The hard way', `<b>Table ${n}, the hard way</b><p>The same table with sharper opponents holding ${Math.round((RISKY.oppStack - 1) * 100)}% more chips. Reaching the target banks about <b>${money(hard)}</b>, against ${money(usual)} the usual way.</p>`, go(true), false]]),
  ];
  const at = Math.min(visit.focus || 0, rows.length - 1);
  showOverlay({
    title: 'The <span>shop</span>', wide: true, compact: true,
    body: `${pocketHtml()}${perkSummary() ? `<p class="who">You hold: ${perkSummary()}</p>` : ''}<div id="ware" class="ware"></div><p class="note">Tap something to see what it is; tap it again to choose it. Each perk costs more than the last.</p>`,
    items: rows.map(([label, , fn, off]) => [label, fn, false, off]),
  });
  S.overlay.tapSelects = true;
  S.overlay.onFocus = (i) => { visit.focus = i; $('ware').innerHTML = rows[i][1]; };
  S.overlay.focus = at; overlayFocus(0);
}

// Reaching the chip target: a normal table in a run is won once a hand ends with your stack at or above it (see tableTarget
// in trip.js). You then choose to move up at once, or to stay and play on and move up later from the menu.
/** The chip target of the table being played: 0 at a boss table, which is played to the end, and outside a run. */
export const targetNow = () => (S.mode === 'run' && !S.bossMode && S.game ? tableTarget(tableConfig(S.table).chips) : 0);
/** What moving up would put in your pocket right now, or -1 if you may not (below the target, all-in, a boss, not a run). */
export function moveUpOffer() {
  const g = S.game, target = targetNow();
  if (!target || !S.trip) return -1;
  const me = g.players[S.ME];
  if (!(me.chips >= target) || (me.allIn && ['betting', 'streetEnd'].includes(g.stage))) return -1; // (the all-in mark lingers after the hand)
  return moveUpPay(S.trip, S.table, me.chips, g.handNo).gain;
}
/** Take the cash-out and go on: the table-cleared sequence, with the stack you hold. */
export function moveUp() {
  if (moveUpOffer() < 0) return;
  S.runId++; // stops the game loop
  tableCleared();
}
/** The choice after a hand that ends at or above the target with opponents still sitting. resume: carries on dealing. */
export function targetChoice(resume) {
  const g = S.game, chips = g.players[S.ME].chips, gain = moveUpPay(S.trip, S.table, chips, g.handNo).gain, target = targetNow();
  showOverlay({
    title: 'Target <span>reached</span>',
    body: `<p>You have ${money(chips)} of the ${money(target)} you needed.</p><p><b>Move up:</b> cash out +${money(gain)} now.</p><p><b>Stay:</b> knock everyone out and the cash-out pays ${Math.round(SWEEP * 100)}% more. You can still leave from the menu (☰) while you have ${money(target)} or more; drop below it and you must get back there.</p>`,
    items: [[`Move up · pocket +${money(gain)}`, () => { S.runId++; tableCleared(); }], ['Stay and play on', () => {
      S.trip.stayed = S.table;
      writeSave({ table: S.table, boss: S.bossMode, chips: g.players.map((p) => p.chips), dealer: g.dealer, handNo: g.handNo, habits: S.habits, run: S.runStats, perks: S.perks, heat: S.heat, trip: S.trip, mem: S.memory });
      resume();
    }]],
  });
}

// Walking away: once half your opponents are out you may stand up with what you have won so far.
// It pays no speed bonus and the table does not count as cleared; a boss must be beaten. At or above the
// chip target you may only move up, never walk away.
export function walkOffer() {
  const g = S.game;
  if (S.mode !== 'run' || !g || !S.trip) return -1;
  if (targetNow() && g.players[S.ME].chips >= targetNow()) return -1;
  // mid-hand, chips already in the pot still belong to a player who is in the hand: an all-in opponent is not out
  const live = ['betting', 'streetEnd'].includes(g.stage);
  const seats = g.players.map((p, seat) => (seat === S.ME ? p : { chips: p.chips + (live ? p.total : 0) }));
  return canWalk(seats, S.ME, S.bossMode) ? cashOut(S.trip, S.table, g.players[S.ME].chips) : -1;
}
// How the walk-away number is worked out, as cashOut() in trip.js does it, in a sentence.
export function walkWhy(short = false) {
  if (short) return 'what you have won above your starting stack';
  const t = S.trip, chips = S.game.players[S.ME].chips, mult = (dealOf(t).cash || 1) * (t.risky === S.table ? RISKY.cash : 1);
  return `What you have won above your starting stack: ${money(chips)} now, less the ${money(t.buyin || 0)} you started with${mult !== 1 ? `, times ${mult} for your deal and route` : ''}.`;
}
let toldAt = ''; // the run and table at which the player was last told they may walk
export function walkHint() {
  const offer = walkOffer(), key = `${S.runStats?.seed}:${S.table}`;
  if (offer <= 0 || toldAt === key) return; // nothing to say until there is something to take (the menu item shows whenever offer >= 0)
  toldAt = key;
  toast(`You can walk away: menu (\u2630) \u2192 Walk away (pocket +${money(offer)})`, 5000);
}
export function walkAway() {
  const g = S.game, me = g.players[S.ME], bank = walkOffer();
  if (bank < 0) return;
  const left = g.players.reduce((sum, p, seat) => sum + (seat === S.ME ? 0 : p.chips + p.total), 0);
  const mid = ['betting', 'streetEnd'].includes(g.stage) && me.total > 0 && !me.folded;
  showOverlay({
    title: 'Walk <span>away?</span>', closable: true, onClose: pauseMenu,
    body: `<p>Stand up now and put <b>+${money(bank)}</b> in your pocket. ${walkWhy()} You go on to the shop and the next table, but with no bonus, and Table ${S.table} will not count towards your best run.</p><p>Stay and win it all for the ${money(left)} still on the table, at the risk of the run.${mid ? ' The hand in progress counts as folded.' : ''}</p>`,
    items: [['Stay', pauseMenu], [`Walk away \u00b7 pocket +${money(bank)}`, () => {
      const t = S.trip;
      S.runId++; // stops the game loop
      t.pocket += bank; t.banked += bank; t.walked++;
      for (const k of ['boost', 'bribe', 'risky', 'stayed']) if (t[k] === S.table) t[k] = 0;
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
