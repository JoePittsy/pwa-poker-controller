// Cards are ints 0..51: rank = c >> 2 (0 = Two .. 12 = Ace), suit = c & 3.
export const RANKS = '23456789TJQKA';
export const SUITS = ['♠︎', '♥︎', '♦︎', '♣︎']; // text-style glyphs (no emoji on iOS)
const RANK_NAMES = ['Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King', 'Ace'];
const plural = (r) => RANK_NAMES[r] + (r === 4 ? 'es' : 's');

// variant: 'holdem' | 'omaha' (four hole cards, exactly two must play) | 'short' (no cards below six)
export function newDeck(rng = Math.random, variant = 'holdem') {
  let d = Array.from({ length: 52 }, (_, i) => i);
  if (variant === 'short') d = d.filter((c) => (c >> 2) >= 4);
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function straightHigh(mask, short = false) {
  for (let hi = 12; hi >= 4; hi--) if (((mask >> (hi - 4)) & 31) === 31) return hi;
  if (short) return (mask & 0x10f0) === 0x10f0 ? 7 : -1; // short deck: the ace plays low under the six, A-6-7-8-9
  return (mask & 0x100f) === 0x100f ? 3 : -1; // wheel: A-2-3-4-5
}

function topRanks(mask, n) {
  const out = [];
  for (let r = 12; r >= 0 && out.length < n; r--) if (mask & (1 << r)) out.push(r);
  return out;
}

const score = (cat, ks) => {
  let v = cat;
  for (let i = 0; i < 5; i++) v = v * 13 + (ks[i] ?? 0);
  return v;
};

// Best 5-card hand from 5-7 cards. Higher number = better hand.
// short: short-deck rules, where a flush outranks a full house (flushes are rarer with 36 cards).
export function evaluate(cards, short = false) {
  const rc = new Array(13).fill(0);
  const sc = [0, 0, 0, 0];
  const sm = [0, 0, 0, 0];
  let mask = 0;
  for (const c of cards) {
    const r = c >> 2, s = c & 3;
    rc[r]++; sc[s]++; sm[s] |= 1 << r; mask |= 1 << r;
  }
  const fs = sc.findIndex((n) => n >= 5);
  if (fs >= 0) {
    const sh = straightHigh(sm[fs], short);
    if (sh >= 0) return score(8, [sh]);
  }
  let quad = -1;
  const trips = [], pairs = [];
  for (let r = 12; r >= 0; r--) {
    if (rc[r] === 4) quad = r;
    else if (rc[r] === 3) trips.push(r);
    else if (rc[r] === 2) pairs.push(r);
  }
  if (quad >= 0) return score(7, [quad, topRanks(mask & ~(1 << quad), 1)[0]]);
  if (short && fs >= 0) return score(6, topRanks(sm[fs], 5));
  if (trips.length && (trips.length > 1 || pairs.length)) {
    return score(short ? 5 : 6, [trips[0], Math.max(trips[1] ?? -1, pairs[0] ?? -1)]);
  }
  if (fs >= 0) return score(5, topRanks(sm[fs], 5));
  const sh = straightHigh(mask, short);
  if (sh >= 0) return score(4, [sh]);
  if (trips.length) return score(3, [trips[0], ...topRanks(mask & ~(1 << trips[0]), 2)]);
  if (pairs.length >= 2) {
    const [a, b] = pairs;
    return score(2, [a, b, topRanks(mask & ~(1 << a) & ~(1 << b), 1)[0]]);
  }
  if (pairs.length) return score(1, [pairs[0], ...topRanks(mask & ~(1 << pairs[0]), 3)]);
  return score(0, topRanks(mask, 5));
}

// All the ways to pick k items from a list.
function combos(list, k, start = 0, pick = [], out = []) {
  if (pick.length === k) { out.push(pick.slice()); return out; }
  for (let i = start; i < list.length; i++) { pick.push(list[i]); combos(list, k, i + 1, pick, out); pick.pop(); }
  return out;
}
// The five cards that make a player's best hand under the variant's rules.
export function bestFiveOf(hole, board, variant = 'holdem') {
  const hands = variant === 'omaha'
    ? combos(hole, 2).flatMap((h2) => combos(board, 3).map((b3) => h2.concat(b3)))
    : combos(hole.concat(board), 5);
  let best = hands[0], top = -1;
  for (const five of hands) { const v = evaluate(five, variant === 'short'); if (v > top) { top = v; best = five; } }
  return best;
}
// A player's score under the variant's rules. Needs at least three board cards.
export function scoreHand(hole, board, variant = 'holdem') {
  if (variant !== 'omaha') return evaluate(hole.concat(board), variant === 'short');
  let top = 0;
  for (let i = 0; i < hole.length; i++) for (let j = i + 1; j < hole.length; j++) {
    for (let a = 0; a < board.length; a++) for (let b = a + 1; b < board.length; b++) for (let c = b + 1; c < board.length; c++) {
      const v = evaluate([hole[i], hole[j], board[a], board[b], board[c]]);
      if (v > top) top = v;
    }
  }
  return top;
}

/**
 * True when a pair, two pair, three of a kind, full house or four of a kind is made by the board alone,
 * so everyone still in has it. v is the hand's score; board is the shared cards on the table.
 */
export function onBoard(v, board, short = false) {
  const ks = [];
  for (let i = 0; i < 5; i++) { ks.unshift(v % 13); v = Math.floor(v / 13); }
  if (short && (v === 5 || v === 6)) v = 11 - v;
  const n = (rank) => board.filter((c) => c >> 2 === rank).length;
  const [a, b] = ks;
  if (v === 1) return n(a) >= 2;
  if (v === 2) return n(a) >= 2 && n(b) >= 2;
  if (v === 3) return n(a) >= 3;
  if (v === 6) return n(a) >= 3 && n(b) >= 2;
  if (v === 7) return n(a) >= 4;
  return false;
}
export function describe(v, short = false) {
  const ks = [];
  for (let i = 0; i < 5; i++) { ks.unshift(v % 13); v = Math.floor(v / 13); }
  if (short && (v === 5 || v === 6)) v = 11 - v; // undo the short-deck swap so the names come out right
  const [a, b] = ks;
  switch (v) {
    case 8: return a === 12 ? 'Royal Flush' : `Straight Flush, ${RANK_NAMES[a]} high`;
    case 7: return `Four ${plural(a)}`;
    case 6: return `Full House, ${plural(a)} over ${plural(b)}`;
    case 5: return `Flush, ${RANK_NAMES[a]} high`;
    case 4: return `Straight, ${RANK_NAMES[a]} high`;
    case 3: return `Three ${plural(a)}`;
    case 2: return `Two Pair, ${plural(a)} & ${plural(b)}`;
    case 1: return `Pair of ${plural(a)}`;
    default: return `${RANK_NAMES[a]} high`;
  }
}
