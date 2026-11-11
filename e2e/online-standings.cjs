const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const errs = [];
  const open = async (tag, name, url = 'http://localhost:8080/') => { const ctx = await b.newContext({ viewport: { width: 750, height: 369 } }); const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(`${tag}: ${e.message}`));
    await p.addInitScript((name) => { localStorage.setItem('padpoker.seen', '1'); localStorage.setItem('padpoker.relay', 'ws://localhost:1884'); if (!localStorage.getItem('padpoker.prefs')) localStorage.setItem('padpoker.prefs', JSON.stringify({ speed: 'Fast', squeeze: false, name, nameAsked: true })); }, name); await p.goto(url); await p.waitForTimeout(500); return p; };
  const click = (p, label) => p.evaluate((label) => [...document.querySelectorAll('#overlay .btn')].find((x) => x.textContent.includes(label)).click(), label);
  const title = (p) => p.evaluate(() => (document.getElementById('overlay').hidden ? '' : document.querySelector('#overlay h1').textContent));
  const dlg = (p) => p.evaluate(() => document.querySelector('#overlay .dialog > div')?.innerText.replace(/\n+/g, ' / ').slice(0, 330));
  const host = await open('host', 'Joe');
  await click(host, 'Online'); await host.waitForTimeout(200); await click(host, 'Host a game');
  for (let i = 0; i < 40 && !/^Room/.test(await title(host)); i++) await host.waitForTimeout(100);
  const code = (await title(host)).replace(/\D/g, ''); const url = `http://localhost:8080/?join=${code}`;
  const a = await open('A', 'Sam', url), c = await open('C', 'Al', url);
  for (let i = 0; i < 60 && !/Al/.test(await host.evaluate(() => document.querySelector('#overlay .who')?.textContent || '')); i++) await host.waitForTimeout(100);
  await click(host, 'Seats'); await click(host, 'Seats'); await click(host, 'Seats'); await host.waitForTimeout(200); // 4 -> 5 -> 6 -> back to 3: people only
  console.log(await host.evaluate(() => [...document.querySelectorAll('#overlay .btn')].map((x) => x.textContent).find((t) => /Seats/.test(t))));
  const st = (p) => p.evaluate(async () => { const { S } = await import('/js/state.js'); const { ui } = await import('/js/prefs.js'); const g = S.game; return { m: ui.mode, hand: g?.handNo, stage: g?.stage, chips: g?.players.map((q) => q.chips).join() }; });
  const game = async (rig) => {
    await click(host, 'Start game'); await host.waitForTimeout(2500);
    await host.evaluate(async (rig) => { const { S } = await import('/js/state.js'); rig.forEach((c, i) => { if (c) S.game.players[i].chips = c; }); }, rig);
    const t0 = Date.now();
    while (Date.now() - t0 < 120000) { for (const p of [host, a, c]) { const v = await st(p); if (v.m === 'actions') await p.keyboard.press('c'); } const h = await st(host); if (/wins/.test(await title(host))) return; if (h.stage === 'handOver' && h.m === 'continue') await host.keyboard.press('Enter'); await host.waitForTimeout(70); }
  };
  await game([0, 15, 25]); await host.waitForTimeout(800);
  console.log('host end 1:', await dlg(host)); console.log('guest end 1:', await dlg(a));
  await host.screenshot({ path: 'stand1.png' });
  await click(host, 'Back to the room'); await host.waitForTimeout(1000);
  console.log('host lobby:', (await dlg(host)).slice(120)); console.log('guest lobby:', (await dlg(c)).slice(60, 330));
  await game([20, 0, 30]); await host.waitForTimeout(800);
  console.log('host end 2:', await dlg(host));
  await click(a, 'Leave'); await a.waitForTimeout(400); await click(a, 'Online'); await a.waitForTimeout(200); await click(a, 'History'); await a.waitForTimeout(300);
  console.log('guest history:', await dlg(a)); await a.screenshot({ path: 'history.png' });
  console.log(errs); await b.close();
})();
