import { newTrip, readTrip, tableMods } from './trip.js';
import { shop, targetChoice, targetNow, walkHint } from './tripui.js';
import { coachTip } from './tip.js';
import { kindOf, setTable } from './venue.js';
import { keepAwake } from './awake.js';
import { facingBet, worstOf } from './coach.js';
import { adjust, noteGaveUp, notePushed, noteShowdownWon } from './reads.js';
import { nextHeat, payout, stackFactor } from './build.js';
import { rankCheck } from './rank.js';
import { award, checkHandStickers, feats } from './achievements.js';
import { decide, equity } from './ai.js';
import * as audio from './audio.js';
import { bluffers, humanProfile, noteHumanAction, say, setMood, showThinking, thinkTime } from './character.js';
import { BOUNTY, CHARACTERS, YOU, setVariantLook, tableConfig } from './config.js';
import { DEAL_GAP, REVEAL_GAP, SHUFFLE_MS, mine, rawSleep, sleep } from './core.js';
import { DAILY_HANDS, dailyData, dailyDone, dailySeed, saveDaily, today } from './daily.js';
import { actionFx, collectBets, handOverFx } from './effects.js';
import { Game } from './engine.js';
import * as fx from './fx.js';
import { best } from './menus.js';
import { noteDecision, noteHand } from './notebook.js';
import { leaveOnline, netBroadcast, netDone, netEffect, netOn, remoteAction, startClock, netBetweenHands } from './online.js';
import { passDone, takeSeat } from './pass.js';
import { grudge } from './perks.js';
import { DIFFICULTY, prefs, ui, PACE } from './prefs.js';
import { cashBust, cashHand, quickDone } from './tables.js';
import { BURN_MS, buildSeats, dealOrder, render, seenBoard, coachOdds } from './render.js';
import { busted, tableCleared, tableIntro } from './replay.js';
import { finishSqueeze, oddsFor, renderActions, waitForSqueeze } from './squeeze.js';
import { S } from './state.js';
import { RUN0, logAction, logStart, logStreet, recordHand, saveStats, stats } from './stats.js';
import { handOverBanter } from './talk.js';
import { finish, prompt, speedUp } from './turn.js';
import { $, mulberry, tick } from './util.js';

// ---------- game loop ----------
// Progress is saved between hands so a reload (new version, or iOS evicting the app) is harmless.
export const SAVE_KEY = 'padpoker.save';
export function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!s || !(s.table >= 1)) return null;
    if (s.chips && (s.chips.length !== tableConfig(s.table, !!s.boss).names.length + 1 || !(s.chips[S.ME] > 0))) return null;
    return s;
  } catch { return null; }
}
let lastCoach = null;
// What has happened between you and each opponent in the hand being played (see reads.js).
let duel = { hand: -1, bet: false, called: new Set() };
function readAct(g, p, a) {
  if (duel.hand !== g.handNo) duel = { hand: g.handNo, bet: false, called: new Set() };
  const by = g.aggressor, facing = g.legal(p.seat).toCall > 0;
  let said = '', who = null;
  if (p.seat === S.ME) {
    if (a.type === 'raise') duel.bet = true;
    if (facing && by >= 0 && by !== S.ME) {
      if (a.type === 'fold') { who = g.players[by]; said = notePushed(S.memory, who.name); }
      else if (a.type === 'call') duel.called.add(by);
    }
  } else if (a.type === 'fold' && facing && by === S.ME) { who = p; said = noteGaveUp(S.memory, p.name); }
  if (said) setTimeout(() => { if (S.game === g) say(who, said); }, 900);
}
// Resolves once the pause after a hand is over and nothing is waiting to be read.
async function autoNext(ms) {
  const t0 = performance.now(), wait = ms * PACE[prefs.speed];
  while (performance.now() - t0 < wait || S.overlay || !$('coachtip').hidden) await tick(150);
}
export function writeSave(s) {
  if (S.mode === 'quick' || S.mode === 'cash' || S.mode === 'pass' || S.mode === 'net') return;
  if (S.mode === 'daily') { // the daily deal keeps its own progress and never touches the run
    const d = dailyData();
    if (s) d.game = { date: today(), chips: s.chips, dealer: s.dealer, handNo: s.handNo }; else delete d.game;
    return saveDaily(d);
  }
  try { s ? localStorage.setItem(SAVE_KEY, JSON.stringify(s)) : localStorage.removeItem(SAVE_KEY); } catch { /* private mode */ }
}

// Start (or resume) a table. `saved` may carry mid-table chip stacks.
let nextTrip = null; // the trip a new run will start on, set by the deal picker
export const setNextTrip = (t) => { nextTrip = t; };
export function startTable(n, saved, quick = false) {
  leaveOnline();
  S.mode = 'run'; S.aiRng = Math.random; S.ME = 0; ui.hidden = false;
  S.trip = saved ? readTrip(saved.trip) : n === 1 ? nextTrip || newTrip() : S.trip || newTrip(); // the deal, pocket and route of this run
  nextTrip = null;
  if (n === 1 && !saved) S.memory = {};
  if (saved?.mem) S.memory = saved.mem;
  if (n === 1 && !saved) { S.perks = {}; S.heat = 0; }
  if (saved?.perks) { S.perks = saved.perks; S.heat = saved.heat || 0; }
  if (saved?.owed) return shop(n, saved); // between tables: the shop, then the way on
  if (n === 1 && !saved) { S.habits = { facing: 0, folds: 0, acts: 0, raises: 0 }; stats.runs++; saveStats(); S.runStats = { ...RUN0, startBest: best(), seed: Math.floor(Math.random() * 1e9) + 1 }; }
  if (saved?.run) S.runStats = { ...RUN0, ...saved.run };
  S.table = n;
  S.bossMode = !!saved?.boss;
  const cfg = tableConfig(n, S.bossMode), mods = tableMods(S.trip, n);
  const info = (name) => (cfg.boss ? cfg.boss : CHARACTERS[name]);
  S.cast = [YOU, ...cfg.names.map((name) => {
    const st = { ...info(name).style, skill: Math.min(1, cfg.skill + mods.skill) };
    if (grudge(name)) st.aggr = Math.min(0.95, st.aggr + 0.12 * grudge(name)); // out for revenge
    return { name, ...info(name), style: st };
  })];
  S.game = new Game({ players: S.cast, handsPerLevel: Math.max(2, Math.round((cfg.handsPerLevel + 2 * (S.perks.slowblinds || 0)) * mods.blinds)), chips: cfg.chips, variant: cfg.variant || 'holdem' });
  setVariantLook(S.game.variant);
  S.game.players[S.ME].chips = Math.round(cfg.chips * stackFactor(S.perks) * mods.stack);
  if (!saved?.chips) S.trip.buyin = Math.min(S.game.players[S.ME].chips, cfg.chips); // the cash-out is what you win beyond the table's ordinary stack
  if (cfg.boss?.chips) S.game.players[1].chips = cfg.chips * cfg.boss.chips;
  if (DIFFICULTY[prefs.difficulty].stack !== 1) for (const p of S.game.players) if (!p.isHuman) p.chips = Math.round(p.chips * DIFFICULTY[prefs.difficulty].stack);
  if (mods.oppStack !== 1) for (const p of S.game.players) if (!p.isHuman) p.chips = Math.round(p.chips * mods.oppStack);
  S.twist = cfg.twist?.key || '';
  if (saved?.habits) S.habits = saved.habits;
  if (saved?.chips) {
    S.game.players.forEach((p, i) => { p.chips = saved.chips[i]; p.out = p.chips <= 0; });
    S.game.dealer = saved.dealer;
    S.game.handNo = saved.handNo;
  } else writeSave({ table: n, boss: S.bossMode, habits: S.habits, run: S.runStats, perks: S.perks, heat: S.heat, trip: S.trip, mem: S.memory });
  setTable(cfg.mat, cfg.boss ? 'boss' : kindOf(n - 1), cfg.boss ? cfg.boss.name : cfg.venue);
  audio.setVenue(n - 1);
  buildSeats();
  $('msg').textContent = ''; $('msg').classList.remove('show');
  $('pot').hidden = true;
  $('hud').innerHTML = S.bossMode ? `<b>Boss</b><br>${cfg.boss.name}` : `Table <b>${S.table}</b><br>${S.game.players[S.ME].chips.toLocaleString()} / ${targetNow().toLocaleString()}`;
  ui.mode = 'wait'; ui.resolve = null;
  S.lastBB = 0; S.fast = false; audio.hush(false); S.squeeze = null; ui.squeezed = true; $('app').classList.remove('zoom');
  S.runId++; // stop any game loop still running from the previous table
  renderActions();
  if (saved?.chips || quick) run(); else tableIntro(run);
}

export async function run() {
  keepAwake(true);
  const id = ++S.runId;
  const g = S.game;
  const me = g.players[S.ME];
  if (g.handNo === 0) { // a fresh table: the new venue slides in
    const app = $('app');
    app.classList.remove('arrive'); void app.offsetWidth; app.classList.add('arrive');
    audio.arrive();
    await rawSleep(750);
    if (id !== S.runId) return;
  }
  const nextHand = () => {
    if (S.mode === 'daily') { // every hand of the day is dealt, and played by the opponents, from a fixed seed
      if (g.handNo >= DAILY_HANDS) return false;
      g.rng = mulberry(dailySeed(g.handNo + 1));
      S.aiRng = mulberry(dailySeed(g.handNo + 1) ^ 0x5bd1e995);
    }
    if (S.mode === 'cash') cashHand(g);
    return g.startHand();
  };
  let before = null; // stacks and button just before each deal, for the hand history
  const snap = () => { before = { chips: g.players.map((p) => p.chips), dealer: g.dealer, handNo: g.handNo, per: g.handsPerLevel }; return true; };
  while (snap() && nextHand()) {
    audio.tension(false);
    audio.newHand();
    ui.scatter = 0; ui.throwPower = 0;
    bluffers.clear();
    g.players.forEach((p) => setMood(p.seat, 'idle'));
    audio.musicLevel(1);
    S.settled = false;
    S.handFlags = {};
    feats.startChips = me.chips + me.total; feats.turnOdds = 1; feats.lastAct = null;
    const others = g.players.filter((p) => !p.isHuman && !p.out);
    S.peekSeat = S.perks.peek && others.length ? others[Math.floor(Math.random() * others.length)].seat : -1;
    logStart(g, before);
    if (S.lastBB && g.bb !== S.lastBB) { fx.banner(`Blinds up \u2013 ${g.sb}/${g.bb}`, 'info'); audio.blindsUp(); fx.haptic('blinds'); }
    S.lastBB = g.bb;
    netEffect('deal');
    fx.shuffle($('deck')); audio.shuffle();
    if (g.handNo === 1 && S.mode === 'run') { const again = g.players.find((p) => !p.isHuman && grudge(p.name)); if (again) setTimeout(() => say(again, 'again'), 1600); }
    render();
    const n = g.players.length;
    const holeCards = g.variant === 'omaha' ? [0, 1, 2, 3] : [0, 1];
    for (const p of g.players) if (!p.out) for (const k of holeCards) audio.card((SHUFFLE_MS + (dealOrder(p.seat) + k * n) * DEAL_GAP) / 1000);
    audio.chips(2, 0.1, 0);
    if (!me.out) for (const k of holeCards) setTimeout(() => fx.haptic('deal'), SHUFFLE_MS + (dealOrder(S.ME) + k * n) * DEAL_GAP + 450); // feel your cards land
    await rawSleep(SHUFFLE_MS + holeCards.length * n * DEAL_GAP + 500); // the shuffle and deal play at their own speed
    await sleep(350);
    while (g.stage !== 'handOver') {
      if (id !== S.runId) return;
      if (g.stage === 'streetEnd') {
        await collectBets();
        ui.slowRiver = false;
        if (g.runout) {
          audio.tension(true);
          if (g.street !== 'river') { audio.heartbeat(); fx.rumble(0.8, 0.2, 120); }
          // the river of a live all-in gets the full treatment
          const o = g.street === 'turn' ? Object.values(oddsFor(g)) : [];
          if (g.street === 'turn' && !me.folded) feats.turnOdds = oddsFor(g)[S.ME] ?? 1;
          ui.slowRiver = o.some((x) => x > 0.02 && x < 0.98);
          await sleep(g.street === 'river' ? 900 : ui.slowRiver ? 1700 : 1300);
          if (ui.slowRiver) { audio.heartbeat(); fx.rumble(0.8, 0.2, 120); }
        } else await sleep(250);
        if (id !== S.runId) return;
        g.nextStreet();
        logStreet(g);
        audio.musicLevel(2);
        render();
        if (ui.slowRiver && g.board.length === 5) {
          await rawSleep(BURN_MS);
          audio.riverSlam();
          await rawSleep(1000); // matches the slam animation and sound, whatever the speed setting
          fx.shake(8, 400); fx.haptic('slam');
          await sleep(500);
        }
        continue;
      }
      const p = g.players[g.toAct];
      let a;
      if (netOn('host')) { S.net.turn++; if (p.isHuman) startClock(p.seat); else S.clock = null; netBroadcast(); } // tells whoever is next that it is their move, and starts their clock
      if (p.isHuman && S.mode === 'net' && p.seat !== S.ME) { // someone else's device decides
        a = await remoteAction(p);
        if (id !== S.runId) return;
      } else if (p.isHuman) {
        if (S.mode === 'pass') { await takeSeat(p); if (id !== S.runId) return; }
        audio.turn(); fx.haptic('turn');
        await waitForSqueeze();
        if (id !== S.runId) return;
        lastCoach = S.mode === 'pass' ? null : coachOdds(g) / 100; // what the coach is showing for this decision: the review must agree with it
        a = await prompt('actions');
        noteHumanAction(a, g.legal(S.ME));
        if (S.handLog && S.mode !== 'pass' && a) { // what you knew when you chose: your rough chance to win and the price you were offered
          const L = g.legal(S.ME), opp = g.players.filter((q) => !mine(q) && !q.folded).length;
          S.handLog.mine.push({
            street: g.street, type: a.type === 'call' && L.canCheck ? 'check' : a.type, toCall: L.toCall, pot: g.pot,
            opp, allin: a.type === 'raise' && a.amount >= L.maxTo, // how many were still in, and whether this was for everything
            to: a.type === 'raise' ? Math.max(L.minTo, Math.min(a.amount, L.maxTo)) : 0,
            eq: lastCoach !== null ? lastCoach : facingBet(equity(g.players[S.ME].cards, seenBoard(g), Math.max(1, opp), g.variant === 'omaha' ? 120 : 250, Math.random, g.variant), L.toCall, g.pot, g.street), need: L.toCall / (g.pot + L.toCall),
          });
        }
        feats.lastAct = { type: a.type === 'call' && g.legal(S.ME).canCheck ? 'check' : a.type, street: g.street };
      } else {
        const watching = S.mode === 'net' || (S.mode === 'pass' ? g.players.some((q) => q.isHuman && !q.folded) : !me.folded);
        if (!watching && !S.fast && ui.mode === 'wait') {
          if (prefs.autoNext && ['run', 'quick', 'cash', 'daily'].includes(S.mode)) speedUp(); // folded: no waiting around, no button to tap
          else { ui.mode = 'skip'; renderActions(); }
        }
        a = decide(g, p.seat, S.aiRng, adjust(humanProfile(), S.mode === 'run' ? S.memory[p.name] : null)); // each opponent has their own read on you
        noteDecision(g, p, a, g.legal(p.seat).toCall);
        const wait = !watching ? 300 : thinkTime(p, a);
        if (wait > 1100 && !S.fast) showThinking(p.seat);
        if (wait > 2000 && !S.fast && Math.random() < 0.35) say(p, 'tank');
        await sleep(wait);
        if (a.bluff && a.type === 'raise') bluffers.add(p.seat);
      }
      if (id !== S.runId) return;
      const potBefore = g.pot;
      if (S.mode === 'run') readAct(g, p, a);
      g.act(a.type, a.amount);
      setMood(p.seat, 'idle');
      logAction(p, a);
      if (S.mode === 'pass' && p.isHuman && g.stage !== 'handOver') { // cards face down before the device moves on
        ui.hidden = true; ui.noAnim = true; render(); ui.noAnim = false;
      } else render();
      actionFx(p, potBefore);
    }
    audio.tension(false);
    if (!ui.squeezed) finishSqueeze(); // the hand ended before you looked
    if (ui.mode === 'skip') { ui.mode = 'wait'; renderActions(); }
    if (S.fast) { S.fast = false; audio.hush(false); await rawSleep(350); }
    // let everyone turn their cards over before the result lands
    if (S.mode === 'pass') { ui.hidden = true; ui.noAnim = true; } // a winner who wasn't called doesn't have to show
    // A big pot going to a showdown gets slow motion: the view pushes in, the music sinks,
    // and the hands turn over one at a time with a heartbeat before the result lands.
    const stake = g.players.reduce((sum, p) => sum + p.won, 0);
    const slowmo = g.result.showdown && !g.runout && !S.fast && stake >= 20 * g.bb && (!me.folded || stake >= 40 * g.bb);
    if (slowmo) {
      $('app').classList.add('zoom');
      audio.tension(true); audio.heartbeat(); fx.haptic('nudge');
      ui.revealGap = 900;
      await rawSleep(700);
    }
    render();
    ui.noAnim = false;
    const gap = ui.revealGap || REVEAL_GAP;
    if (slowmo) for (let k = 0; k < ui.reveals; k++) setTimeout(() => { audio.heartbeat(); fx.haptic('nudge'); }, k * gap + gap - 260);
    ui.revealGap = 0;
    if (ui.reveals) await (slowmo ? rawSleep : sleep)(ui.reveals * gap + (slowmo ? 900 : 500));
    if (slowmo) { $('app').classList.remove('zoom'); audio.tension(false); fx.shake(5, 300); }
    if (id !== S.runId) return;
    S.settled = true;
    const friendly = S.mode === 'pass' || S.mode === 'net'; // games among people: no stats, stickers or notes
    const kos = friendly ? 0 : recordHand(g);
    rankCheck();
    if (!friendly && prefs.coach && !(me.won > 0)) { // the coach has a word about the hand's worst mistake, unless you won it anyway
      const w = worstOf(S.lastHand);
      if (w) setTimeout(() => { if (S.game === g) coachTip(w.street === 'preflop' ? 'before the flop' : `on the ${w.street}`, `${w.what}. ${w.why}`); }, 700); // stays until dismissed
    }
    if (!friendly) noteHand(g);
    if (S.mode === 'run' && !S.bossMode && me.won > 0) { // they remember who took their last chip
      for (const p of g.players) if (!p.isHuman && !p.out && p.chips === 0 && p.total > 0) S.memory[p.name] = { ...S.memory[p.name], ko: grudge(p.name) + 1 };
    }
    if (!friendly) checkHandStickers(g, kos);
    if (S.mode === 'run' && g.result.showdown && me.won > 0 && !me.folded) { // a read that just cost someone chips is dropped
      for (const p of g.players) {
        if (p.isHuman || p.folded) continue;
        const said = noteShowdownWon(S.memory, p.name, { youBet: duel.hand === g.handNo && duel.bet, youCalledThem: duel.hand === g.handNo && duel.called.has(p.seat) });
        if (said) setTimeout(() => { if (S.game === g) say(p, said); }, 1700);
      }
    }
    // bonuses are paid by the house, on top of the pot
    const paid = friendly ? { total: 0, parts: [], mult: 1 } : payout(S.perks, { won: me.won, showdown: g.result.showdown, kos, riverBet: feats.lastAct?.type === 'raise' && feats.lastAct.street === 'river' }, S.heat);
    const pm = S.mode === 'run' ? tableMods(S.trip, S.table).payout : 1;
    if (pm !== 1) { paid.total = Math.round(paid.total * pm); }
    if (!friendly) S.heat = nextHeat(S.heat, { won: me.won, showdown: g.result.showdown, folded: me.folded });
    const bounty = S.twist === 'bounty' ? BOUNTY * kos : 0, bonus = bounty + paid.total;
    if (bonus > 0) {
      me.chips += bonus;
      const what = [bounty ? 'Bounty' : '', ...paid.parts.map(([name]) => name)].filter(Boolean);
      const label = `${what.length > 2 ? 'Perks' : what.join(' + ')} +${bonus}${paid.mult > 1 && paid.total ? ` \u00b7 heat \u00d7${paid.mult.toFixed(1)}` : ''}`;
      setTimeout(() => { fx.banner(label, 'info'); audio.chips(5, 0, 4); }, 900);
    }
    if (me.chips === 0 && S.perks.lifeline > 0) { // one more chance
      S.perks.lifeline--;
      award('second_wind');
      me.chips = Math.round(tableConfig(S.table, S.bossMode).chips * 0.3);
      setTimeout(() => { fx.banner('Lifeline!', 'info'); audio.win(1); }, 1200);
    }
    render();
    handOverFx();
    setTimeout(handOverBanter, 700);
    writeSave({ table: S.table, boss: S.bossMode, chips: g.players.map((p) => p.chips), dealer: g.dealer, handNo: g.handNo, habits: S.habits, run: S.runStats, perks: S.perks, heat: S.heat, trip: S.trip, mem: S.memory });
    await sleep(500);
    if (S.mode === 'net') { await Promise.race([prompt('continue'), tick(9000)]); if (ui.mode === 'continue') finish(); } // nobody should wait on the host
    else if (prefs.autoNext && me.chips > 0 && g.players.filter((p) => p.chips > 0).length > 1) { // carries on by itself; the button skips the wait
      await Promise.race([prompt('continue'), autoNext(me.folded ? 900 : g.result.showdown ? 3000 : 1400)]);
      if (ui.mode === 'continue') finish();
    } else await prompt('continue'); // the end of a table or of your chips always waits for you
    if (id !== S.runId) return;
    if (S.mode === 'pass') { ui.hidden = true; continue; }
    if (S.mode === 'net') {
      if (netOn('host')) { await netBetweenHands(g); if (id !== S.runId) return; }
      if (S.twist === 'bounty') { // whoever won the hand collects for everyone it knocked out
        const out = g.players.filter((p) => !p.out && p.chips === 0 && p.total > 0).length, w = g.players[g.result.winners[0]];
        if (out && w) { w.chips += BOUNTY * out; const text = `${w.name}: bounty +${BOUNTY * out}`; fx.banner(text, 'info'); audio.chips(5, 0, 4); netEffect('banner', { text }); render(); }
      }
      continue;
    }
    if (S.mode === 'run' && !S.bossMode && me.chips > 0 && S.trip.stayed !== S.table && me.chips >= targetNow() && g.players.some((p, seat) => seat !== S.ME && p.chips > 0)) { // the table is won: move up now, or stay and play on
      return targetChoice(run);
    }
    if (S.mode === 'run') walkHint();
    if (me.chips === 0) return S.mode === 'daily' ? dailyDone() : S.mode === 'quick' ? quickDone() : S.mode === 'cash' ? cashBust() : busted();
    if (S.stale) return location.reload(); // new version deployed: pick it up between hands
  }
  if (S.mode === 'net') { if (netOn('host')) netDone(); } else if (S.mode === 'pass') passDone(); else if (S.mode === 'daily') dailyDone(); else if (S.mode === 'quick') quickDone(); else if (me.chips > 0) tableCleared(); else busted();
}
