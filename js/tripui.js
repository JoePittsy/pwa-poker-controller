// The screens of a run's trip: picking a deal, the shop between tables, and choosing the way on.
// (The rules and prices are in trip.js.)
import { award } from './achievements.js';
import * as audio from './audio.js';
import { PERKS } from './build.js';
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
export const pocketHtml = () => `<p class="bank">Pocket <b>${money(S.trip?.pocket || 0)}</b>${S.trip && S.trip.deal !== 'regular' ? ` &middot; ${dealOf(S.trip).name}` : ''}</p>`;

// A new run starts by choosing the deal it is played on.
export function newRun() {
  const deals = dealsFor(myRank().index);
  showOverlay({
    title: 'Pick your <span>deal</span>', perky: true, closable: true, onClose: startScreen,
    body: '<p>Bank what you win at each table, spend it in the shop, and take a quarter of what is left home when the run ends.</p><p>More deals unlock with rank.</p>',
    items: deals.map((d, i) => [`${i === 0 ? glyph('A') : ''}<span>${d.name}<small>${d.locked ? `Unlocks at ${LADDER[d.rank][1]}` : d.text}</small></span>`,
      () => { if (d.locked) { toast(`${d.name} unlocks at ${LADDER[d.rank][1]}`); return newRun(); } setNextTrip(newTrip(d.key)); startTable(1); }, false, d.locked]),
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
  const leave = () => {
    writeSave({ ...saved, perks: S.perks, trip: S.trip });
    if (boss) return startTable(n, { ...saved, perks: S.perks, trip: S.trip, owed: false });
    wayOn(n, saved);
  };
  showOverlay({
    title: 'The <span>shop</span>', wide: true, compact: true,
    body: `${pocketHtml()}${perkSummary() ? `<p class="who">You hold: ${perkSummary()}</p>` : ''}
      <div class="wares">${visit.offer.map((k) => `<p><b>${PERKS[k].name}</b>${perkTag(k)} ${PERKS[k].text}</p>`).join('') || '<p>The shelf is empty. Reroll for more.</p>'}</div>
      <p class="note">Perks last the whole run and cost more the more you hold. A boost and a pay-off are for the next table only.</p>`,
    items: [
      ...visit.offer.map((k, i) => [`${i === 0 ? glyph('A') : ''}${PERKS[k].name} \u00b7 ${money(perk)}`, buy(perk, () => {
        S.perks[k] = (S.perks[k] || 0) + 1; visit.offer = visit.offer.filter((x) => x !== k); audio.win(1);
        if (Object.values(S.perks).reduce((x, y) => x + y, 0) >= 3) award('loaded');
      }), false, perk > t.pocket]),
      [`Reroll \u00b7 ${money(reroll)}`, buy(reroll, () => { visit.offer = draw(); visit.rerolls++; audio.shuffle(); }), false, reroll > t.pocket],
      ...(t.boost === n ? [] : [[`+25% stack \u00b7 ${money(boost)}`, buy(boost, () => { t.boost = n; audio.chips(5, 0, 4); }), false, boost > t.pocket]]),
      ...(canBribe ? [[`One fewer opponent \u00b7 ${money(bribe)}`, buy(bribe, () => { t.bribe = n; audio.confirm(); }), false, bribe > t.pocket]] : []),
      ['Leave the shop', leave],
    ],
  });
}

// After the shop: the usual next table, or the same one the hard way for a bigger cash-out.
function wayOn(n, saved) {
  const cfg = tableConfig(n), go = (risky) => () => { S.trip.risky = risky ? n : 0; startTable(n, { ...saved, perks: S.perks, trip: S.trip, owed: false }); };
  showOverlay({
    title: 'Which <span>way?</span>', perky: true,
    body: `${pocketHtml()}<p>Next: Table ${n}, ${cfg.venue}.</p>`,
    items: [
      [`${glyph('A')}<span>The usual<small>${cfg.names.length} opponents, as they come.</small></span>`, go(false)],
      [`<span>The hard way<small>Sharper opponents with ${Math.round((RISKY.oppStack - 1) * 100)}% more chips. The cash-out pays ${Math.round((RISKY.cash - 1) * 100)}% more.</small></span>`, go(true)],
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
    body: `<p>Stand up now and bank <b>${money(bank)}</b>. There is no speed bonus, and Table ${S.table} will not count as cleared.</p><p>Stay and win it all for the ${money(left)} still on the table, at the risk of the run.${mid ? ' The hand in progress counts as folded.' : ''}</p>`,
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
        body: `<p>You left Table ${S.table} with ${g.players.filter((p, seat) => seat !== S.ME && p.chips > 0).length} still sitting. It does not count as cleared.</p><p class="gain">Cashed out +${money(bank)}</p>${pocketHtml()}`,
        items: [[`${glyph('A')}To the shop`, () => { const sv = loadSave(); startTable(sv.table, sv); }]],
      });
    }]],
  });
}
