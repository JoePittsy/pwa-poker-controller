import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// The service worker keeps a list of files to store for offline play. A script missing from it
// would work online and break offline, so the list is checked against what is actually there.
test('every script is in the offline list', () => {
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const missing = readdirSync(new URL('../js/', import.meta.url)).filter((f) => f.endsWith('.js') && !sw.includes(`'js/${f}'`));
  assert.deepEqual(missing, []);
});

test('the offline list names no file that is gone', () => {
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const listed = [...sw.matchAll(/'js\/([\w-]+\.js)'/g)].map((m) => m[1]);
  const have = new Set(readdirSync(new URL('../js/', import.meta.url)));
  assert.deepEqual(listed.filter((f) => !have.has(f)), []);
});
