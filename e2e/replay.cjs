const { chromium } = require('playwright');
(async () => {
  const out = process.argv[2];
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 750, height: 369 }, deviceScaleFactor: 2 });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:8080/');
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('padpoker.seen', '1'); localStorage.setItem('padpoker.prefs', JSON.stringify({ speed: 'Fast', squeeze: false })); });
  await p.reload(); await p.waitForTimeout(300); await p.keyboard.press('Enter'); await p.waitForTimeout(300); await p.keyboard.press('Enter');
  const results = []; const t0 = Date.now();
  while (Date.now() - t0 < 100000 && results.length < 3) { const s = await p.evaluate(() => ({ m: window.__poker.ui.mode, r: window.__poker.game.result?.text, bd: window.__poker.game.board.join() })); if (s.m === 'actions') { await p.keyboard.press(Math.random() < 0.3 ? 'r' : 'c'); if ((await p.evaluate(() => window.__poker.ui.mode)) === 'raise') await p.keyboard.press('Enter'); } if (s.m === 'continue') { results.push(`${s.r} [${s.bd}]`); if (results.length < 3) await p.keyboard.press('Enter'); } if (s.m === 'skip') await p.keyboard.press('Enter'); await p.waitForTimeout(60); }
  const liveBefore = await p.evaluate(() => JSON.stringify({ chips: window.__poker.game.players.map((q) => q.chips), hand: window.__poker.game.handNo, mode: window.__poker.ui.mode, board: window.__poker.game.board }));
  const click = (label) => p.evaluate((label) => [...document.querySelectorAll('#overlay .btn')].find((x) => x.textContent.includes(label)).click(), label);
  await p.keyboard.press('p'); await p.waitForTimeout(300); await click('Hands'); await p.waitForTimeout(300);
  console.log('hands screen:', await p.evaluate(() => document.querySelector('#overlay p').textContent.trim().slice(0, 90)), '|', await p.evaluate(() => [...document.querySelectorAll('#overlay .btn')].map((x) => x.textContent)));
  await p.screenshot({ path: out + '/hands.png' });
  await click('Older'); await p.waitForTimeout(300); await click('Older'); await p.waitForTimeout(300);
  console.log('oldest:', await p.evaluate(() => document.querySelector('#overlay p b')?.textContent));
  await click('Replay');
  let rep = null; const t1 = Date.now(); let shot = false;
  while (Date.now() - t1 < 60000) { const s = await p.evaluate(() => ({ m: window.__poker.ui.mode, r: window.__poker.game.result?.text, bd: window.__poker.game.board.join(), hud: document.getElementById('hud').textContent })); if (!shot && s.bd) { shot = true; await p.screenshot({ path: out + '/replay.png' }); } if (s.m === 'replayEnd') { rep = `${s.r} [${s.bd}]`; break; } await p.waitForTimeout(100); }
  console.log('recorded hand 1:', results[0]); console.log('replayed  hand 1:', rep, '| identical:', rep === results[0]);
  await p.keyboard.press('Enter'); for (let i = 0; i < 50 && await p.evaluate(() => document.getElementById('overlay').hidden); i++) await p.waitForTimeout(100);
  console.log('back on:', await p.evaluate(() => document.getElementById('overlay').hidden ? '(no overlay)' : document.querySelector('#overlay h1').textContent));
  await p.keyboard.press('Escape'); await p.waitForTimeout(200); await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  const liveAfter = await p.evaluate(() => JSON.stringify({ chips: window.__poker.game.players.map((q) => q.chips), hand: window.__poker.game.handNo, mode: window.__poker.ui.mode, board: window.__poker.game.board }));
  console.log('live game restored exactly:', liveBefore === liveAfter, liveAfter);
  await p.keyboard.press('Enter'); await p.waitForTimeout(4000);
  console.log('live game carries on: hand', await p.evaluate(() => window.__poker.game.handNo), 'errors', errs);
  await b.close();
})();
