import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../js/engine.js';
import { decide } from '../js/ai.js';

// How long does a table last? A competent human (decide() with an ordinary style) against the opponents as the game
// builds them, counting hands until the human is out or every opponent is. config.js pulls in the DOM, so the
// opponents' styles and the hands per level are read out of its source.
const SRC = readFileSync(new URL('../js/config.js', import.meta.url), 'utf8');
const STYLE = {};
for (const m of SRC.matchAll(/^ {2}(\w+): \{ tag: '[^']*'.*?style: \{ loose: ([\d.]+), aggr: ([\d.]+)/gm)) STYLE[m[1]] = { loose: +m[2], aggr: +m[3] };
const hpl = SRC.match(/handsPerLevel: twist\?\.key === 'turbo' \? 2 : n === 1 \? (\d+) : (\d+)/);
assert.ok(hpl, 'could not find the hands per level in tableConfig');
const HANDS_PER_LEVEL = { 1: +hpl[1], 2: +hpl[2] };
const skillAt = (n) => 0.3 + (n - 1) * 0.175; // tableConfig, standard difficulty

const mulberry32 = (a) => () => {
  a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const HUMAN = { loose: 0.45, aggr: 0.5, skill: 0.8 };
const at = (xs, f) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * f))];

function simulate(table, names, tables, seed) {
  const rng = mulberry32(seed), lengths = [], firstOut = [];
  for (let i = 0; i < tables; i++) {
    const players = [{ name: 'You', isHuman: true, style: HUMAN }, ...names.map((n) => ({ name: n, style: { ...STYLE[n], skill: skillAt(table) } }))];
    const g = new Game({ players, chips: 1000, handsPerLevel: HANDS_PER_LEVEL[table], rng });
    let hands = 0, first = 0;
    while (hands < 200 && g.startHand()) {
      hands++;
      while (g.stage !== 'handOver') {
        if (g.stage === 'streetEnd') { g.nextStreet(); continue; }
        const a = decide(g, g.toAct, rng, {});
        g.act(a.type, a.amount);
      }
      if (!first && g.players.some((p) => !p.isHuman && p.chips <= 0)) first = hands;
      if (g.players[0].chips <= 0) break;
    }
    lengths.push(hands); firstOut.push(first || hands);
  }
  return { median: at(lengths, 0.5), p90: at(lengths, 0.9), firstOut: at(firstOut, 0.5) };
}

// Targets, each widened by 3 hands on both sides: the opponents' AI (js/ai.js) is being retuned at the same time as
// the blind schedule, and 150 tables per seed is a small sample, so the test must not flake on a small drift.
const SLACK = 3, TABLES = 150;
const CASES = [
  { table: 1, names: ['Dot', 'Ivy', 'Gus'], median: [14, 20], p90: 28, firstOut: 10 },
  { table: 2, names: ['Mav', 'Dot', 'Ivy', 'Gus'], median: [16, 24], p90: 32 },
];
for (const c of CASES) {
  test(`Table ${c.table} lasts about ${c.median[0]}-${c.median[1]} hands (90% of tables within ${c.p90})`, () => {
    const r = simulate(c.table, c.names, TABLES, 20240611 + c.table);
    assert.ok(r.median >= c.median[0] - SLACK && r.median <= c.median[1] + SLACK, `median ${r.median} hands, want ${c.median} (+-${SLACK})`);
    assert.ok(r.p90 <= c.p90 + SLACK, `90th percentile ${r.p90} hands, want <= ${c.p90} (+${SLACK})`);
    if (c.firstOut) assert.ok(r.firstOut <= c.firstOut + SLACK, `first knock-out at hand ${r.firstOut} (median), want by ${c.firstOut} (+${SLACK})`);
  });
}
