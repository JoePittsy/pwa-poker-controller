// Cards are ints 0..51: rank = c >> 2 (0 = Two .. 12 = Ace), suit = c & 3.
export const RANKS = '23456789TJQKA';
export const SUITS = ['♠︎', '♥︎', '♦︎', '♣︎']; // text-style glyphs (no emoji on iOS)
const RANK_NAMES = ['Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King', 'Ace'];
const plural = (r) => RANK_NAMES[r] + (r === 4 ? 'es' : 's');

export function newDeck(rng = Math.random) {
  const d = Array.from({ length: 52 }, (_, i) => i);
  for (let i = 51; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function straightHigh(mask) {
  for (let hi = 12; hi >= 4; hi--) if (((mask >> (hi - 4)) & 31) === 31) return hi;
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
export function evaluate(cards) {
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
    const sh = straightHigh(sm[fs]);
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
  if (trips.length && (trips.length > 1 || pairs.length)) {
    return score(6, [trips[0], Math.max(trips[1] ?? -1, pairs[0] ?? -1)]);
  }
  if (fs >= 0) return score(5, topRanks(sm[fs], 5));
  const sh = straightHigh(mask);
  if (sh >= 0) return score(4, [sh]);
  if (trips.length) return score(3, [trips[0], ...topRanks(mask & ~(1 << trips[0]), 2)]);
  if (pairs.length >= 2) {
    const [a, b] = pairs;
    return score(2, [a, b, topRanks(mask & ~(1 << a) & ~(1 << b), 1)[0]]);
  }
  if (pairs.length) return score(1, [pairs[0], ...topRanks(mask & ~(1 << pairs[0]), 3)]);
  return score(0, topRanks(mask, 5));
}

export function describe(v) {
  const ks = [];
  for (let i = 0; i < 5; i++) { ks.unshift(v % 13); v = Math.floor(v / 13); }
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
