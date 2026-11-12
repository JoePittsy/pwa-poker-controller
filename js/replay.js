import { runFee } from './bank.js';
import { clearedCount, dealOf, moveUpPay, takeHome } from './trip.js';
import { newRun, pocketHtml, targetNow } from './tripui.js';
import { addToBank, bank, takeStake } from './tables.js';
import { rankHtml } from './rank.js';
import { backupMenu } from './backupmenu.js';
import { award } from './achievements.js';
import * as audio from './audio.js';
import { RANKS } from './cards.js';
import { setMood } from './character.js';
import { BOSSES, CHARACTERS, VARIANTS, YOU, bossFor, setVariantLook, tableConfig } from './config.js';
import { DEAL_GAP, SHUFFLE_MS } from './core.js';
import { actionFx, beatLine, collectBets } from './effects.js';
import { Game } from './engine.js';
import * as fx from './fx.js';
import { loadSave, startTable, writeSave } from './loop.js';
import { best, closeOverlay, controlsHtml, showOverlay, statsScreen, tables, startScreen } from './menus.js';
import { grudge } from './perks.js';
import { BACKS, DIFFICULTY, PACE, STACKS, applyPrefs, bestRun, cycle, prefs, ui, unlockedBacks } from './prefs.js';
import { buildSeats, render } from './render.js';
import { runCard, share } from './results.js';
import { keyHands, reviewScreen } from './review.js';
import { renderActions, toast } from './squeeze.js';
import { S } from './state.js';
import { cardsText, saveStats, stats } from './stats.js';
import { toggleEmotes } from './talk.js';
import { $, glyph, tick } from './util.js';

// ---------- replay: play a recorded hand back on the table ----------
// The live game is frozen (see rawSleep) while a throwaway game is fed the recorded deck and
// actions through the normal renderer, then everything is put back exactly as it was.
export function castFor(name) {
  if (name === 'You') return YOU;
  const b = BOSSES.find((x) => x.name === name);
  return { name, ...(b || CHARACTERS[name] || {}) };
}
export async function replayHand(log, done) {
  const live = { game: S.game, cast: S.cast, ME: S.ME, mode: ui.mode, resolve: ui.resolve, squeezed: ui.squeezed, peek: S.peekSeat, settled: S.settled, hidden: ui.hidden, mat: getComputedStyle($('app')).getPropertyValue('--mat') };
  S.replaying = true; S.replayStop = false;
  closeOverlay();
  toggleEmotes(false);
  S.cast = log.cast.map(castFor);
  S.game = new Game({ players: S.cast, handsPerLevel: log.before.per, variant: log.variant || 'holdem' });
  setVariantLook(S.game.variant);
  S.game.players.forEach((p, i) => { p.chips = log.before.chips[i]; });
  S.game.dealer = log.before.dealer; S.game.handNo = log.before.handNo;
  S.game.nextDeck = [...log.deck];
  S.ME = 0; S.peekSeat = -1; S.settled = false;
  Object.assign(ui, { squeezed: true, hidden: false, mode: 'replay', resolve: null, slowRiver: false, scatter: 0 });
  $('app').style.setProperty('--mat', log.mat);
  buildSeats();
  $('msg').textContent = ''; $('msg').classList.remove('show');
  const g = S.game;
  g.startHand();
  fx.shuffle($('deck')); audio.shuffle();
  render();
  await tick(SHUFFLE_MS + (g.variant === 'omaha' ? 4 : 2) * g.players.length * DEAL_GAP + 700);
  const streets = async () => {
    while (!S.replayStop && g.stage === 'streetEnd') { await collectBets(tick); await tick(300); g.nextStreet(); render(); await tick(g.stage === 'handOver' ? 300 : 900); }
  };
  for (const a of log.actions) {
    await streets();
    if (S.replayStop || g.stage !== 'betting') break;
    await tick(650);
    if (S.replayStop) break;
    const p = g.players[g.toAct], pot = g.pot;
    g.act(a.type, a.amount);
    render();
    actionFx(p, pot);
  }
  await streets();
  if (!S.replayStop) {
    S.settled = true;
    render();
    await new Promise((res) => { ui.mode = 'replayEnd'; ui.resolve = res; renderActions(); });
  }
  // put the live game back
  ({ game: S.game, cast: S.cast, ME: S.ME } = live);
  S.peekSeat = live.peek; S.settled = live.settled;
  Object.assign(ui, { mode: live.mode, resolve: live.resolve, squeezed: live.squeezed, hidden: live.hidden });
  $('app').style.setProperty('--mat', live.mat);
  setVariantLook(S.game.variant);
  ui.noAnim = true; buildSeats(); render(); ui.noAnim = false;
  S.replaying = false;
  done();
}
export function stopReplay() {
  if (!S.replaying) return;
  audio.back();
  S.replayStop = true; // the replay loop sees this, unwinds and puts the live table back
  if (ui.mode === 'replayEnd') ui.resolve?.();
}
export const RANKS_REF = [
  ['Royal Flush', 'As Ks Qs Js Ts'], ['Straight Flush', '9h 8h 7h 6h 5h'], ['Four of a Kind', 'Qs Qh Qd Qc 4s'],
  ['Full House', 'Ks Kh Kd 7c 7s'], ['Flush', 'Ad Jd 8d 5d 2d'], ['Straight', 'Ts 9d 8c 7h 6s'],
  ['Three of a Kind', '8s 8h 8d Kc 3s'], ['Two Pair', 'Js Jd 5c 5h As'], ['Pair', '9s 9h Ad 7c 4s'], ['High Card', 'As Jd 8c 6h 3s'],
];
// A three-step primer for people new to poker. Shown before the first game and from Help.
export const HOWTO = [
  ['The <span>goal</span>', `<p>Everyone gets two cards of their own. Five more are dealt face up in the middle for all to share: three (the flop), then one (the turn), then one (the river).</p>
    <p>Win the pot by holding the best five-card hand at the end, or by betting so that everyone else folds.</p>`],
  ['Your <span>turn</span>', `<table>
    <tr><td>${glyph('B')} Fold</td><td>Give up this hand. You lose what you've already put in.</td></tr>
    <tr><td>${glyph('X')} Check</td><td>Pass, when nobody has bet yet.</td></tr>
    <tr><td>${glyph('X')} Call</td><td>Match the current bet to stay in.</td></tr>
    <tr><td>${glyph('Y')} Bet / Raise</td><td>Put more in, then choose how much.</td></tr></table>
    <p>Two players post small forced bets (the blinds) each hand, so there is always something to win. The blinds grow over time.</p>`],
  ['The <span>run</span>', `<p>Knock out every opponent to clear a table and move up to a tougher one. Lose all your chips and the run is over.</p>
    <p>Not sure what beats what? Hand ranks is in the menu under Help. Coach, in Settings, shows your chance of winning as you play.</p>`],
];
export function howTo(step, done, firstRun = false) {
  const last = step === HOWTO.length - 1;
  const finish = () => { try { localStorage.setItem('padpoker.seen', '1'); } catch { /* private mode */ } done(); };
  const items = last
    ? [[`${glyph('A')}${firstRun ? "Let's play" : 'Got it'}`, finish]]
    : [[`${glyph('A')}Next`, () => howTo(step + 1, done, firstRun)], ['Skip', finish]];
  if (last && firstRun) items.push(['Play with Coach on', () => { prefs.coach = true; applyPrefs(); finish(); }]);
  showOverlay({ title: HOWTO[step][0], body: `<p class="venue">How to play &middot; ${step + 1} of ${HOWTO.length}</p>${HOWTO[step][1]}`, wide: true, items });
}
export function helpMenu(back) {
  showOverlay({
    title: 'Help', closable: true, onClose: back, body: controlsHtml(),
    items: [
      ['How to play', () => howTo(0, () => helpMenu(back))],
      ['Hand ranks', () => ranksScreen(() => helpMenu(back))],
      [`${glyph('B')}Back`, back],
    ],
  });
}
export function ranksScreen(back) {
  const parse = (str) => str.split(' ').map((x) => RANKS.indexOf(x[0]) * 4 + 'shdc'.indexOf(x[1]));
  const rows = RANKS_REF.map(([name, ex], i) => `<div><i>${i + 1}</i><b>${name}</b><span>${cardsText(parse(ex))}</span></div>`).join('');
  showOverlay({
    title: 'Hand ranks', closable: true, onClose: back, wide: true,
    body: `<p>Best at the top. Your hand is the best five cards from your two plus the board. At short-deck tables a flush beats a full house; in Omaha you must use exactly two of your four.</p><div class="ranks">${rows}</div>`,
    items: [[`${glyph('B')}Back`, back]],
  });
}
export function settingsMenu(back) {
  const onOff = (v) => (v ? 'On' : 'Off');
  const set = (fn) => () => { fn(); applyPrefs(); };
  showOverlay({
    title: 'Settings', compact: true, closable: true, onClose: back,
    body: `<p>Difficulty changes how well opponents play (Shark also gives them bigger stacks) and applies from the next table, as does stack size. Speed changes how long opponents and deals take. Left-handed moves the buttons to the left. Coach shows your rough chance of winning and the odds a call needs.</p>`,
    items: [
      [() => `Difficulty: ${prefs.difficulty}`, set(() => { prefs.difficulty = cycle(DIFFICULTY, prefs.difficulty); }), true],
      [() => `Speed: ${prefs.speed}`, set(() => { prefs.speed = cycle(PACE, prefs.speed); }), true],
      [() => `Stacks: ${prefs.stack}`, set(() => { prefs.stack = cycle(STACKS, prefs.stack); }), true],
      [() => `Left-handed: ${onOff(prefs.lefty)}`, set(() => { prefs.lefty = !prefs.lefty; }), true],
      [() => `Sound: ${audio.volText(audio.sfxLevel())}`, () => { audio.setSfxVolume(audio.nextVolume(audio.sfxLevel())); audio.chips(3, 0, 2); }, true],
      [() => `Music: ${audio.volText(audio.musicVolume())}`, () => audio.setMusicVolume(audio.nextVolume(audio.musicVolume())), true],
      fx.hapticSupport() === 'none' && fx.isIOS
        ? ['Rumble: not on iPhone', () => toast('iPhone and iPad don\u2019t let web apps vibrate or rumble a controller'), true, true]
        : [() => `Rumble: ${onOff(prefs.rumble)}`, set(() => {
          prefs.rumble = !prefs.rumble;
          if (!prefs.rumble) return;
          setTimeout(() => fx.haptic('win1'), 30); // a test buzz, from wherever this device can make one
          const how = fx.hapticSupport();
          toast(how === 'controller' ? 'Rumbling the controller' : how === 'phone' ? 'No controller rumble: using the phone\u2019s vibration' : 'Nothing here can vibrate: connect a controller with rumble');
        }), true],
      [() => `Table talk: ${onOff(prefs.chatter)}`, set(() => { prefs.chatter = !prefs.chatter; }), true],
      [() => `Card back: ${prefs.back}`, set(() => {
        const mine = unlockedBacks();
        prefs.back = mine[(mine.indexOf(prefs.back) + 1) % mine.length];
        const next = Object.keys(BACKS).find((k) => BACKS[k] > bestRun());
        if (mine.length === 1 && next) toast(`Clear ${tables(BACKS[next])} in a run to unlock ${next}`);
      }), true],
      [() => `Deck: ${prefs.fourColour ? '4-colour' : '2-colour'}`, set(() => { prefs.fourColour = !prefs.fourColour; }), true],
      [() => `Squeeze cards: ${onOff(prefs.squeeze)}`, set(() => { prefs.squeeze = !prefs.squeeze; toast(prefs.squeeze ? 'Your cards arrive face down: flip them, or drag them up to peek slowly' : 'Your cards are shown as soon as they are dealt'); }), true],
      [() => `Auto next hand: ${onOff(prefs.autoNext)}`, set(() => { prefs.autoNext = !prefs.autoNext; }), true],
      [() => `Coach: ${onOff(prefs.coach)}`, set(() => { prefs.coach = !prefs.coach; if (S.game && S.game.stage !== 'idle') render(); }), true],
      ['Back up \u00b7 restore', () => backupMenu(() => settingsMenu(back))],
      [`${glyph('B')}Back`, back],
    ],
  });
}
// Who starts with what, read from the table as it has actually been dealt.
function stacksEqual() {
  const me = S.game.players[S.ME].chips;
  return S.game.players.every((p) => p.chips === me);
}
function stacksLine() {
  const me = S.game.players[S.ME].chips, them = [...new Set(S.game.players.filter((p, seat) => seat !== S.ME).map((p) => p.chips))];
  if (them.length === 1 && them[0] === me) return `Everyone starts with ${me.toLocaleString()} chips.`;
  return `You start with ${me.toLocaleString()} chips; ${them.length === 1 ? `they start with ${them[0].toLocaleString()}` : `they start with ${Math.min(...them).toLocaleString()} to ${Math.max(...them).toLocaleString()}`}.`;
}
// What this run's deal, route and shopping change about the table you are sitting down at.
function tripLine() {
  const t = S.trip, n = S.table, bits = [];
  if (!t) return '';
  if (t.deal !== 'regular') bits.push(`<b>${dealOf(t).name}:</b> ${dealOf(t).text}`);
  if (t.risky === n) bits.push('<b>The hard way:</b> sharper opponents with more chips, and a bigger cash-out.');
  if (t.boost === n) bits.push('<b>Boosted:</b> you start with 25% more.');
  if (t.bribe === n && !S.bossMode) bits.push('<b>Paid off:</b> one opponent stayed away.');
  return bits.map((b) => `<p class="who">${b}</p>`).join('');
}
export function tableIntro(start) {
  const cfg = tableConfig(S.table, S.bossMode);
  if (S.bossMode) {
    return showOverlay({
      title: 'Boss <span>fight</span>',
      body: `<p class="venue">${cfg.venue}</p><p>One on one. Beat ${cfg.boss.name} to carry on; lose and the run is over.</p><p class="who"><b>${cfg.boss.tag}:</b> ${cfg.boss.trick}</p>${tripLine()}`,
      items: [[`${glyph('A')}Sit down`, start]],
    });
  }
  const who = cfg.names.map((n) => `<b>${n}</b> <i>${CHARACTERS[n].tag}</i>`).join(' &middot; ');
  showOverlay({
    title: `Table <span>${S.table}</span>`,
    body: `<p class="venue">${cfg.venue}</p><p>Turn your ${S.game.players[S.ME].chips.toLocaleString()} into ${targetNow().toLocaleString()} to move up.${stacksEqual() ? '' : ` ${stacksLine()}`}${S.table === 1 ? ' What you win goes in your pocket, to spend at the shop on the way to the next table.' : ''}</p>${cfg.variant !== 'holdem' ? `<p class="who">This table plays <b>${VARIANTS[cfg.variant].name}</b>. ${VARIANTS[cfg.variant].rules}</p>` : ''}${cfg.twist ? `<p class="who">Twist: <b>${cfg.twist.name}</b> &ndash; ${cfg.twist.text}</p>` : ''}<p class="who">${who}</p>${cfg.names.some(grudge) ? `<p>${cfg.names.filter(grudge).join(' and ')} ${cfg.names.filter(grudge).length > 1 ? 'remember' : 'remembers'} you knocked them out, and will come after you.</p>` : ''}${tripLine()}`,
    items: [[`${glyph('A')}Deal me in`, start]],
  });
}
// The moment you take the last chip: the losers' tiles topple, chips rain, a fanfare plays,
// and only then does the result screen come up.
export async function tableCleared() {
  const id = S.runId, g = S.game, boss = S.bossMode;
  audio.musicLevel(0);
  ui.mode = 'wait'; renderActions();
  // The best moment in the game: everything stops, the room falls over, and the title is stamped on.
  S.seatEls.forEach((el, i) => { if (i !== S.ME) setTimeout(() => { el.classList.add('toppled'); setMood(i, i % 2 ? 'shock' : 'sad'); }, 150 + i * 130); });
  setMood(S.ME, 'happy');
  audio.victory(boss);
  fx.flash(boss ? '#ffd23f' : '#ffffff'); fx.shake(boss ? 14 : 10, 450); fx.haptic('slam');
  const kos = S.runStats.knockouts || 0;
  fx.stamp(boss ? 'Boss beaten' : 'Table cleared', `${boss ? bossFor(S.table).name : `Table ${S.table}`} \u00b7 ${g.handNo} hand${g.handNo === 1 ? '' : 's'}${kos ? ` \u00b7 ${kos} knock-out${kos === 1 ? '' : 's'} this run` : ''}`, boss ? 'boss' : '', boss ? 3600 : 2900);
  fx.confetti(boss ? 150 : 90);
  fx.chipRain(boss ? 80 : 46);
  fx.burst(S.seatEls[S.ME].querySelector('.cards'), 50);
  for (const [at, px] of boss ? [[700, 8], [1050, 8], [1400, 9], [1750, 10], [2150, 14]] : [[700, 7], [1050, 7], [1400, 8], [1800, 12]]) { // in time with the hits of the fanfare
    setTimeout(() => { if (id !== S.runId) return; fx.shake(px, 260); fx.rumble(1, 1, 180); fx.burst($('center'), 26); }, at);
  }
  if (boss) setTimeout(() => { if (id === S.runId) { fx.confetti(120); fx.chipRain(60); } }, 2200);
  await tick(boss ? 4300 : 3500);
  if (id !== S.runId) return;
  showCleared();
}
// What the win was worth towards your rank, with the bar as it now stands.
const gainHtml = (xp) => `<p class="gain">+${xp} XP</p>${rankHtml()}`;
// Clearing a table banks what you won there, and the one-table extras you bought for it are used up.
function bankTable() {
  const t = S.trip, g = S.game, { bonus, gain } = moveUpPay(t, S.table, g.players[S.ME].chips, g.handNo, S.bossMode); // the same sum as the offer to move up
  t.pocket += gain; t.banked += gain;
  for (const k of ['boost', 'bribe', 'risky', 'stayed']) if (t[k] === S.table) t[k] = 0;
  return `<p class="gain">Cashed out +${gain.toLocaleString()}${bonus ? ` &middot; includes ${Math.round(bonus * 100)}% for winning in ${g.handNo} hand${g.handNo === 1 ? '' : 's'}` : ''}</p>${pocketHtml()}`;
}
export function showCleared() {
  const remain = S.game.players.some((p, seat) => seat !== S.ME && p.chips + p.total > 0); // moved up at the target, with opponents still sitting
  const banked = bankTable();
  if (S.bossMode) { // beat the boss: on to the next table
    award({ Vera: 'house_loses', Otto: 'harpooned', Stone: 'rock_breaker' }[bossFor(S.table).name]);
    stats.bosses = (stats.bosses || 0) + 1; saveStats();
    writeSave({ table: S.table + 1, habits: S.habits, run: S.runStats, perks: S.perks, heat: S.heat, trip: S.trip, mem: S.memory, owed: true });
    const b = bossFor(S.table);
    return showOverlay({
      title: 'Boss <span>beaten!</span>',
      body: `<p>${b.name} is out of chips after ${S.game.handNo} hands. Next up: ${tableConfig(S.table + 1).venue}.</p>${banked}${gainHtml(80)}`,
      items: [[`${glyph('A')}To the shop`, () => startTable(S.table + 1, loadSave())]],
    });
  }
  if (S.table >= 1) award('regular');
  if (S.table >= 3) award('made_it');
  if (S.table >= 5) award('vault');
  if (S.game.handNo <= 15) award('speedrun');
  const before = best(); // tables walked away from do not count towards it
  try { localStorage.setItem('padpoker.best', String(Math.max(before, clearedCount(S.trip, S.table)))); } catch { /* private mode */ }
  const prize = Object.keys(BACKS).find((k) => BACKS[k] > before && BACKS[k] <= clearedCount(S.trip, S.table));
  const bossNext = S.table % 3 === 0;
  writeSave({ table: bossNext ? S.table : S.table + 1, boss: bossNext, habits: S.habits, run: S.runStats, perks: S.perks, heat: S.heat, trip: S.trip, mem: S.memory, owed: true });
  stats.tables++; saveStats();
  const next = bossNext ? `a boss: ${bossFor(S.table).name}, ${bossFor(S.table).tag}` : `${tableConfig(S.table + 1).venue}, and it's tougher`;
  showOverlay({
    title: 'Table <span>cleared!</span>',
    body: `<p>${remain ? `You hit the target at Table ${S.table} in ${S.game.handNo} hands.` : `You took every chip at Table ${S.table} in ${S.game.handNo} hands.`} Next up: ${next}.</p>${prize ? `<p class="who">New card back unlocked: <b>${prize}</b>. Switch to it in Settings.</p>` : ''}${banked}${gainHtml(40)}`,
    items: [[`${glyph('A')}To the shop`, () => { const sv = loadSave(); startTable(sv.table, sv); }]],
  });
}
let home = 0, paid = 0; // what the run that just ended sent to the bankroll, and what it cost to start
export function busted() {
  audio.musicLevel(0);
  audio.lose();
  writeSave(null);
  paid = takeStake(); // the fee this run cost, now settled
  home = takeHome(S.trip); // a share of what is left in your pocket goes to your bankroll
  if (home) addToBank(home);
  bustSummary();
}
export function bustSummary() {
  const cleared = clearedCount(S.trip, S.bossMode ? S.table : S.table - 1);
  const r = S.runStats;
  const tile = (v, label) => `<div><b>${v}</b>${label}</div>`;
  const beat = beatLine(S.game);
  const net = home - paid, now = bank().chips, left = S.trip?.pocket || 0;
  const account = `${paid ? `This run cost ${paid.toLocaleString()}.` : 'This run was free.'} ${home ? `Half of the ${left.toLocaleString()} left in your pocket, ${home.toLocaleString()}, comes home.` : 'Nothing left in your pocket to bring home.'} <span class="${net < 0 ? 'loss' : ''}">Bankroll: ${(now - home + paid).toLocaleString()} \u2192 ${now.toLocaleString()} (${net < 0 ? '\u2212' : '+'}${Math.abs(net).toLocaleString()}).</span>`;
  const record = cleared > r.startBest ? '<p class="venue">New best run!</p>' : `<p>Best run: ${tables(best())} cleared.</p>`;
  showOverlay({
    title: 'Busted', wide: true,
    body: `${beat ? `<p class="who">${beat}</p>` : ''}<p>${S.bossMode ? `Beaten by ${bossFor(S.table).name}, ${bossFor(S.table).tag}, after Table ${S.table}.` : `Out at Table ${S.table}, ${tableConfig(S.table).venue}.`}</p>${record}<p class="gain">${S.trip?.banked ? `Banked ${S.trip.banked.toLocaleString()} this run, spent ${S.trip.spent.toLocaleString()}. ` : ''}${account}</p><div class="stats">
      ${tile(cleared, 'tables cleared')}${tile(r.knockouts, 'knock-outs')}${tile(r.hands, 'hands played')}
      ${tile(r.showdowns ? `${r.showdownsWon} of ${r.showdowns}` : '\u2013', 'showdowns won')}${tile(r.biggest.toLocaleString(), 'biggest pot won')}${tile(r.bestHand || '\u2013', 'best hand')}
    </div>`,
    items: [[`${glyph('A')}Again, same deal \u00b7 ${runFee(stats.runs) ? runFee(stats.runs).toLocaleString() : 'free'}`, () => newRun(S.trip?.deal)], ['Change deal', () => newRun()], ['Main menu', startScreen], ...(keyHands(r.seed).length ? [['Review key hands', () => reviewScreen(keyHands(r.seed), 0, bustSummary)]] : []), ['Stats', () => statsScreen(bustSummary)], ['Share', () => share(runCard(), 'pad-poker-run.png'), true]],
  });
}
