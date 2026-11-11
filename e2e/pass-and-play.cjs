const { chromium } = require('playwright');
(async () => {
  const out = process.argv[2];
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 750, height: 369 }, deviceScaleFactor: 2 });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:8080/');
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('padpoker.seen', '1'); localStorage.setItem('padpoker.prefs', JSON.stringify({ speed: 'Fast' })); });
  await p.reload(); await p.waitForTimeout(300);
  await p.evaluate(() => [...document.querySelectorAll('#overlay .btn')].find((x) => x.textContent.includes('Pass & play')).click()); await p.waitForTimeout(300);
  console.log('menu:', await p.evaluate(() => [...document.querySelectorAll('#overlay .btn')].map((x) => x.textContent)));
  await p.keyboard.press('Enter');
  const view = () => p.evaluate(() => ({ t: document.getElementById('overlay').hidden ? '' : document.querySelector('#overlay h1').textContent, m: window.__poker.ui.mode,
    bottom: document.querySelector('.seat.me .name')?.textContent.trim(), bottomFaces: document.querySelectorAll('.seat.me .card .in.face').length, topFaces: document.querySelectorAll('.seat.ai .card .in.face').length,
    stage: window.__poker.game.stage, hand: window.__poker.game.handNo, shown: window.__poker.game.showCards }));
  const log = []; let leaks = 0, shots = 0; const t0 = Date.now(); let end = '';
  while (Date.now() - t0 < 200000 && !end) {
    const s = await view();
    if (/Pass to/.test(s.t)) {
      if (s.bottomFaces || (s.topFaces && !s.shown)) leaks++;
      const who = s.t.replace('Pass to ', '');
      if (shots === 0) { await p.screenshot({ path: out + '/pass-hand.png' }); }
      await p.keyboard.press('Enter'); await p.waitForTimeout(450);
      const v = await view();
      if (log.length < 6) log.push(`${who}: bottom=${v.bottom} faces=${v.bottomFaces} others'faces=${v.topFaces}`);
      if (shots++ === 1) await p.screenshot({ path: out + '/pass-turn.png' });
      if (v.topFaces && !v.shown) leaks++;
      continue;
    }
    if (/wins/.test(s.t)) { end = s.t; break; }
    if (s.m === 'actions') { await p.keyboard.press(Math.random() < 0.35 ? 'r' : 'c'); const m2 = (await view()).m; if (m2 === 'raise') { for (let i = 0; i < 4; i++) await p.keyboard.press('e'); await p.keyboard.press('Enter'); }
      await p.waitForTimeout(120); const after = await view(); if (after.m !== 'actions' && after.m !== 'raise' && !after.shown && after.bottomFaces) { leaks++; console.log('LEAK after action', JSON.stringify(after)); } }
    if (s.m === 'continue' || s.m === 'skip' || s.m === 'squeeze') await p.keyboard.press('Enter');
    await p.waitForTimeout(60);
  }
  console.log(log.join('\n')); console.log('card leaks seen:', leaks, '| finished:', end, '| hands:', (await view()).hand, 'errors', errs);
  await b.close();
})();
