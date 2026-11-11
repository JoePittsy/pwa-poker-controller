// No-limit Texas Hold'em engine. Pure state, no DOM, no timers: the UI drives it.
//   startHand() -> stage 'betting' (toAct set) | 'streetEnd' | 'handOver'
//   act(type, amount) while 'betting'; nextStreet() while 'streetEnd'.
import { newDeck, scoreHand, describe } from './cards.js';

// Cash games sit at one of these (bank.js STAKES point into it by index) and never rise.
export const BLIND_LEVELS = [[5, 10], [10, 20], [15, 30], [25, 50], [50, 100], [75, 150], [100, 200], [150, 300], [200, 400]];
// Tables that do rise (runs, sit & go, ladder, daily): the big blind at most doubles per step, and the
// opening 5/10 against 1000 chips is the same as in a cash game. Steep enough that a table lasts about 15-25 hands.
export const RISING_LEVELS = [[5, 10], [10, 20], [20, 40], [30, 60], [60, 120], [120, 240], [240, 480], [400, 800], [800, 1600]];

export class Game {
  constructor({ players, chips = 1000, handsPerLevel = 8, rng = Math.random, variant = 'holdem', startLevel = 0 }) {
    this.startLevel = startLevel; // a cash game starts at its stake and stays there
    this.variant = variant; // 'holdem' | 'omaha' | 'short'
    this.rng = rng;
    this.handsPerLevel = handsPerLevel;
    this.players = players.map((p, seat) => ({
      seat, name: p.name, isHuman: !!p.isHuman, style: p.style, chips,
      cards: [], bet: 0, total: 0, folded: false, allIn: false, acted: false,
      out: false, lastAction: '', won: 0, handName: '',
    }));
    this.dealer = -1;
    this.handNo = 0;
    this.board = [];
    this.stage = 'idle';
    this.toAct = -1;
    this.sb = BLIND_LEVELS[0][0];
    this.bb = BLIND_LEVELS[0][1];
  }

  get pot() { return this.players.reduce((s, p) => s + p.total, 0); }

  nextSeat(from, pred) {
    const n = this.players.length;
    for (let i = 1; i <= n; i++) {
      const p = this.players[(from + i + n) % n];
      if (pred(p)) return p.seat;
    }
    return -1;
  }

  startHand() {
    for (const p of this.players) p.out = p.chips <= 0;
    const alive = this.players.filter((p) => !p.out);
    if (alive.length < 2) return false;
    this.handNo++;
    const levels = this.startLevel > 0 ? BLIND_LEVELS : RISING_LEVELS;
    const lvl = Math.min(this.startLevel + Math.floor((this.handNo - 1) / this.handsPerLevel), levels.length - 1);
    [this.sb, this.bb] = levels[lvl];
    this.dealer = this.nextSeat(this.dealer, (p) => !p.out);
    this.deck = this.nextDeck || newDeck(this.rng, this.variant); // nextDeck: replay a recorded hand
    this.nextDeck = null;
    this.dealt = [...this.deck]; // the full shuffled deck, kept so the hand can be replayed
    this.board = [];
    this.street = 'preflop';
    this.result = null;
    this.showCards = false;
    this.runout = false;
    for (const p of this.players) {
      Object.assign(p, { cards: [], bet: 0, total: 0, folded: p.out, allIn: false, acted: false, lastAction: '', won: 0, handName: '' });
    }
    const sbSeat = alive.length === 2 ? this.dealer : this.nextSeat(this.dealer, (p) => !p.out);
    const bbSeat = this.nextSeat(sbSeat, (p) => !p.out);
    this._put(this.players[sbSeat], this.sb); this.players[sbSeat].lastAction = 'SB';
    this._put(this.players[bbSeat], this.bb); this.players[bbSeat].lastAction = 'BB';
    const hole = this.variant === 'omaha' ? 4 : 2;
    for (const p of alive) p.cards = Array.from({ length: hole }, () => this.deck.pop());
    this.currentBet = this.bb;
    this.lastRaise = this.bb;
    this.aggressor = -1; // seat of the last bet or raise this street
    this.toAct = bbSeat;
    this._advance();
    return true;
  }

  _put(p, amt) {
    amt = Math.min(amt, p.chips);
    p.chips -= amt; p.bet += amt; p.total += amt;
    if (p.chips === 0) p.allIn = true;
    return amt;
  }

  legal(seat = this.toAct) {
    const p = this.players[seat];
    const toCall = Math.min(Math.max(this.currentBet - p.bet, 0), p.chips);
    const maxTo = p.bet + p.chips;
    const minTo = Math.min(this.currentBet + this.lastRaise, maxTo);
    const others = this.players.some((q) => q !== p && !q.folded && !q.allIn);
    // p.acted is only still true here when facing a short all-in, which doesn't reopen betting.
    const canRaise = !p.acted && others && maxTo > this.currentBet;
    return { toCall, canCheck: toCall === 0, canRaise, minTo, maxTo };
  }

  act(type, amount = 0) {
    if (this.stage !== 'betting') throw new Error('not in a betting round');
    const p = this.players[this.toAct];
    const L = this.legal();
    if (type === 'raise' && !L.canRaise) type = 'call';
    if (type === 'check' && !L.canCheck) type = 'fold';
    if (type === 'call' && L.canCheck) type = 'check';
    if (type === 'fold') {
      p.folded = true; p.lastAction = 'Fold';
    } else if (type === 'check') {
      p.lastAction = 'Check';
    } else if (type === 'call') {
      this._put(p, L.toCall);
      p.lastAction = p.allIn ? 'All-in' : `Call ${L.toCall}`;
    } else if (type === 'raise') {
      const to = Math.max(L.minTo, Math.min(Math.round(amount), L.maxTo));
      const inc = to - this.currentBet;
      const opening = this.currentBet === 0;
      this._put(p, to - p.bet);
      if (inc >= this.lastRaise) {
        this.lastRaise = inc;
        for (const q of this.players) q.acted = false;
      }
      this.currentBet = to;
      this.aggressor = p.seat;
      p.lastAction = p.allIn ? `All-in ${to}` : `${opening ? 'Bet' : 'Raise'} ${to}`;
    } else throw new Error('unknown action ' + type);
    p.acted = true;
    this._advance();
  }

  _advance() {
    const live = this.players.filter((p) => !p.folded);
    if (live.length === 1) return this._finishFold(live[0]);
    const canAct = live.filter((p) => !p.allIn).length;
    const needs = (p) => !p.folded && !p.allIn &&
      (p.bet < this.currentBet || (!p.acted && canAct > 1));
    const next = this.nextSeat(this.toAct, needs);
    if (next >= 0) { this.toAct = next; this.stage = 'betting'; return; }
    this._returnUncalled();
    this.toAct = -1;
    this.stage = 'streetEnd';
    if (live.filter((p) => !p.allIn).length <= 1) { this.runout = true; this.showCards = true; }
  }

  _returnUncalled() {
    const s = [...this.players].sort((a, b) => b.bet - a.bet);
    const diff = s[0].bet - s[1].bet;
    if (diff > 0) {
      const p = s[0];
      p.chips += diff; p.bet -= diff; p.total -= diff; p.allIn = false;
    }
  }

  nextStreet() {
    if (this.stage !== 'streetEnd') throw new Error('street not finished');
    for (const p of this.players) { p.bet = 0; p.acted = false; if (!p.folded) p.lastAction = p.allIn ? 'All-in' : ''; }
    this.currentBet = 0;
    this.lastRaise = this.bb;
    this.aggressor = -1;
    if (this.street === 'river') return this._showdown();
    const n = this.street === 'preflop' ? 3 : 1;
    this.deck.pop(); // burn a card before each street, as a real dealer does
    for (let i = 0; i < n; i++) this.board.push(this.deck.pop());
    this.street = { preflop: 'flop', flop: 'turn', turn: 'river' }[this.street];
    if (this.runout) return; // everyone all-in: stay in 'streetEnd', UI keeps dealing
    this.toAct = this.dealer;
    this._advance();
  }

  _finishFold(w) {
    this._returnUncalled();
    const amt = this.pot;
    w.chips += amt; w.won = amt;
    for (const p of this.players) p.bet = 0;
    this.toAct = -1;
    this.stage = 'handOver';
    this.result = { winners: [w.seat], showdown: false, text: `${w.name} ${w.isHuman ? 'win' : 'wins'} the ${amt} pot` };
  }

  _showdown() {
    this.showCards = true;
    const live = this.players.filter((p) => !p.folded);
    for (const p of live) {
      p.score = scoreHand(p.cards, this.board, this.variant);
      p.handName = describe(p.score, this.variant === 'short');
    }
    const levels = [...new Set(live.map((p) => p.total))].sort((a, b) => a - b);
    const pots = [];
    let prev = 0, dealt = 0;
    for (const lv of levels) {
      const amt = this.players.reduce((s, p) => s + Math.min(p.total, lv) - Math.min(p.total, prev), 0);
      pots.push({ amt, elig: live.filter((p) => p.total >= lv) });
      dealt += amt; prev = lv;
    }
    pots[pots.length - 1].amt += this.pot - dealt; // dead money above the top live stake
    const n = this.players.length;
    const order = (p) => (p.seat - this.dealer - 1 + n) % n; // odd chips go left of the button first
    for (const { amt, elig } of pots) {
      const best = Math.max(...elig.map((p) => p.score));
      const ws = elig.filter((p) => p.score === best).sort((a, b) => order(a) - order(b));
      const share = Math.floor(amt / ws.length);
      let rem = amt - share * ws.length;
      for (const w of ws) { const x = share + (rem-- > 0 ? 1 : 0); w.chips += x; w.won += x; }
    }
    const winners = live.filter((p) => p.won > 0).sort((a, b) => b.won - a.won);
    this.toAct = -1;
    this.stage = 'handOver';
    this.result = {
      winners: winners.map((p) => p.seat), showdown: true,
      text: (winners.length === 1 ? `${winners[0].name} ${winners[0].isHuman ? 'win' : 'wins'} the ${winners[0].won} pot` : winners.map((p) => `${p.name} ${p.isHuman ? 'take' : 'takes'} ${p.won}`).join(' · ')) + ` — ${winners[0].handName}`,
    };
  }
}
