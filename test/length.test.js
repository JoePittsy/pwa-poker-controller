import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../js/engine.js';
import { decide } from '../js/ai.js';
import { tableTarget, FAST, QUICK, speedBonus } from '../js/trip.js';

// How long does a table last? A competent human (decide() with an ordinary style) against the opponents as the game
// builds them. A normal table ends when the human has reached the chip target after a hand, or is out, or has knocked
// everyone out. config.js pulls in the DOM, so the opponents' styles and the hands per level are read out of its source.
const SRC = readFileSync(new URL('../js/config.js', import.meta.url), 'utf8');
const STYLE = {};
for (const m of SRC.matchAll(/^ {2}(\w+): \{ tag: '[^']*'.*?style: \{ loose: ([\d.]+), aggr: ([\d.]+)/gm)) STYLE[m[1]] = { loose: +m[2], aggr: +m[3] };
const hpl = SRC.match(/handsPerLevel: twist\?\.key === 'turbo' \? \d+ : (\d+)/);
assert.ok(hpl, 'could not find the hands per level in tableConfig');
const HANDS_PER_LEVEL = +hpl[1];
const skillAt = (n) => 0.3 + (n - 1) * 0.175; // tableConfig, standard difficulty

const mulberry32 = (a) => () => {
  a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const HUMAN = { loose: 0.45, aggr: 0.5, skill: 0.8 };
const CHIPS = 1000, TARGET_CHIPS = tableTarget(CHIPS);
const at = (xs, f) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * f))];

export function simulate(table, names, tables, seed) {
  const rng = mulberry32(seed), lengths = [], blinds = [], wins = [];
  for (let i = 0; i < tables; i++) {
    const players = [{ name: 'You', isHuman: true, style: HUMAN }, ...names.map((n) => ({ name: n, style: { ...STYLE[n], skill: skillAt(table) } }))];
    const g = new Game({ players, chips: CHIPS, handsPerLevel: HANDS_PER_LEVEL, rng });
    let hands = 0, won = false, bb = g.bb;
    while (hands < 200 && g.startHand()) {
      hands++; bb = g.bb;
      while (g.stage !== 'handOver') {
        if (g.stage === 'streetEnd') { g.nextStreet(); continue; }
        const a = decide(g, g.toAct, rng, {});
        g.act(a.type, a.amount);
      }
      if (g.players[0].chips <= 0) break;
      if (g.players[0].chips >= TARGET_CHIPS) { won = true; break; }
    }
    if (!won && g.players[0].chips > 0 && g.players.every((p, k) => k === 0 || p.chips <= 0)) won = true; // everyone else is out
    lengths.push(hands); blinds.push(bb);
    if (won) wins.push(hands);
  }
  return { median: at(lengths, 0.5), p90: at(lengths, 0.9), bb: at(blinds, 0.5), won: wins.length / tables, wins };
}

// Targets, each widened by 3 hands on both sides: the opponents' AI (js/ai.js) is being retuned at the same time as
// the blind schedule, and 150 tables per seed is a small sample, so the test must not flake on a small drift.
const SLACK = 3, TABLES = 150;
const CASES = [
  { table: 1, names: ['Dot', 'Ivy', 'Gus'] },
  { table: 2, names: ['Mav', 'Dot', 'Ivy', 'Gus'] },
];
const MEDIAN = [10, 22], P90 = 40, BB_SHARE = 0.04;
for (const c of CASES) {
  test(`Table ${c.table} lasts about ${MEDIAN[0]}-${MEDIAN[1]} hands (90% of tables within ${P90}) with the blinds still small`, () => {
    const r = simulate(c.table, c.names, TABLES, 20240611 + c.table);
    const share = (f) => r.wins.filter((h) => speedBonus(h) >= f).length / Math.max(1, r.wins.length);
    console.log(`Table ${c.table}: median ${r.median} hands, 90th percentile ${r.p90}, big blind at the median finish ${r.bb}, proxy reaches the target in ${Math.round(r.won * 100)}%; of its wins ${Math.round(share(0.3) * 100)}% fast (<= ${FAST} hands), ${Math.round(share(0.15) * 100)}% quick (<= ${QUICK})`);
    assert.ok(r.median >= MEDIAN[0] - SLACK && r.median <= MEDIAN[1] + SLACK, `median ${r.median} hands, want ${MEDIAN} (+-${SLACK})`);
    assert.ok(r.p90 <= P90 + SLACK, `90th percentile ${r.p90} hands, want <= ${P90} (+${SLACK})`);
    assert.ok(r.bb <= CHIPS * BB_SHARE, `the big blind at the median finish is ${r.bb}, want at most ${CHIPS * BB_SHARE}`);
    if (c.table === 1 && (r.won < 0.3 || r.won > 0.5)) console.log(`  note: the proxy reaches the target in ${Math.round(r.won * 100)}% of Table 1s, outside the 30-50% aimed for`);
    assert.ok(r.wins.length > 0, 'the proxy never reaches the target');
  });
}
