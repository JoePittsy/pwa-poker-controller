const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const errs = [];
  const p = await (await b.newContext({ viewport: { width: 750, height: 369 } })).newPage(); p.on('pageerror', (e) => errs.push(e.message));
  await p.addInitScript(() => { if (localStorage.getItem('padpoker.seen')) return; localStorage.setItem('padpoker.seen', '1'); localStorage.setItem('padpoker.prefs', JSON.stringify({ speed: 'Fast', squeeze: false })); });
  await p.goto('http://localhost:8080/'); await p.waitForTimeout(600);
  const click = (label) => p.evaluate((label) => [...document.querySelectorAll('#overlay .btn')].find((x) => x.textContent.includes(label)).click(), label);
  const dlg = (n = 420) => p.evaluate((n) => document.querySelector('#overlay .dialog > div')?.innerText.replace(/\n+/g, ' / ').slice(0, n), n);
  const btns = () => p.evaluate(() => [...document.querySelectorAll('#overlay .btn')].map((x) => x.innerText.replace(/\n+/g, ' ')).join(' | '));
  const S = (f) => p.evaluate(async (f) => { const { S } = await import('/js/state.js'); return new Function('S', `return ${f}`)(S); }, f);
  await click('Play'); await p.waitForTimeout(300); await click('Regular'); await p.waitForTimeout(500);
  console.log('intro:', (await dlg(700)).slice(150));
  await click('Deal me in'); await p.waitForTimeout(3200);
  await p.evaluate(() => document.getElementById('menu-btn').click()); await p.waitForTimeout(300);
  console.log('pause, nobody out:', await btns()); await click('Resume');
  // two of three opponents out, hero up
  await p.evaluate(async () => { const { S } = await import('/js/state.js'); const g = S.game; g.players[1].chips = 0; g.players[2].chips = 0; g.players[0].chips = 2600; g.players[3].chips = 1400 - g.players[3].total; });
  await p.evaluate(() => document.getElementById('menu-btn').click()); await p.waitForTimeout(300);
  console.log('pause, two out:', await btns());
  await click('Walk away'); await p.waitForTimeout(300);
  console.log('confirm:', await dlg(500), '||', await btns()); await p.screenshot({ path: 'walk.png' });
  await click('Walk away'); await p.waitForTimeout(400);
  console.log('walked:', await dlg(300)); console.log('trip:', JSON.stringify(await S('S.trip')), '| best stored:', await p.evaluate(() => localStorage.getItem('padpoker.best')), '| tables stat:', await p.evaluate(() => JSON.parse(localStorage.getItem('padpoker.stats') || '{}').tables));
  await click('To the shop'); await p.waitForTimeout(300); await click('Leave the shop'); await p.waitForTimeout(300); await click('The usual'); await p.waitForTimeout(500);
  console.log('next:', (await dlg(120)));
  await click('Deal me in'); await p.waitForTimeout(3000);
  // clear table 2 quickly: speed bonus
  await p.evaluate(async () => { const { S } = await import('/js/state.js'); const r = await import('/js/replay.js'); const g = S.game; const all = g.players.reduce((a, q) => a + q.chips + q.total, 0); g.players.forEach((q, i) => { q.chips = i ? 0 : all; q.total = 0; }); S.runId++; r.showCleared(); }); await p.waitForTimeout(400);
  console.log('table 2 cleared fast:', (await dlg(400)).match(/Cashed out[^/]*/)?.[0], '| best stored:', await p.evaluate(() => localStorage.getItem('padpoker.best')), errs);
  await b.close();
})();
