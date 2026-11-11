const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const errs = [];
  const open = async (tag, name, url = 'http://localhost:8080/') => { const ctx = await b.newContext({ viewport: { width: 750, height: 369 } }); const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(`${tag}: ${e.message}`));
    await p.addInitScript((name) => { localStorage.setItem('padpoker.seen', '1'); localStorage.setItem('padpoker.relay', 'ws://localhost:1884'); localStorage.setItem('padpoker.prefs', JSON.stringify({ speed: 'Fast', squeeze: true, coach: true, name, nameAsked: true })); }, name); await p.goto(url); await p.waitForTimeout(500); return p; };
  const click = (p, label) => p.evaluate((label) => [...document.querySelectorAll('#overlay .btn')].find((x) => x.textContent.includes(label)).click(), label);
  const title = (p) => p.evaluate(() => (document.getElementById('overlay').hidden ? '' : document.querySelector('#overlay h1').textContent));
  const dlg = (p) => p.evaluate(() => document.querySelector('#overlay .dialog')?.innerText.replace(/\n+/g, ' / ').slice(0, 220));
  const host = await open('host', 'Joe');
  await click(host, 'Online'); await host.waitForTimeout(200); await click(host, 'Host a game');
  for (let i = 0; i < 40 && !/^Room/.test(await title(host)); i++) await host.waitForTimeout(100);
  const code = (await title(host)).replace(/\D/g, ''); const url = `http://localhost:8080/?join=${code}`;
  const a = await open('A', 'Sam', url), w = await open('W', 'Wat', url);
  for (let i = 0; i < 50 && !/Wat/.test(await host.evaluate(() => document.querySelector('#overlay .who')?.textContent || '')); i++) await host.waitForTimeout(100);
  await click(w, 'Watch only'); await w.waitForTimeout(1000);
  console.log('watcher lobby:', await dlg(w)); console.log('host lobby:', (await dlg(host)).slice(0, 190));
  await click(host, 'Start game'); await host.waitForTimeout(3500);
  const late = await open('L', 'Late', url); await late.waitForTimeout(3000);
  const view = (p) => p.evaluate(() => { const g = window.__poker.game; return g ? { m: window.__poker.ui.mode, n: g.players.length, stage: g.stage, hand: g.handNo, faces: document.querySelectorAll('.seat .card .in.face').length, backs: document.querySelectorAll('.seat .card .in.back').length, known: g.players.filter((q) => q.cards.some((c) => c >= 0)).length, hud: document.getElementById('hud').innerText.replace(/\n/g, ' '), ov: document.getElementById('overlay').hidden ? '' : document.querySelector('#overlay h1').textContent } : null; });
  console.log('W   :', JSON.stringify(await view(w))); console.log('late:', JSON.stringify(await view(late))); console.log('A   :', JSON.stringify(await view(a)));
  await late.screenshot({ path: 'watch.png' });
  let sd = null, prompted = false, maxKnown = 0; const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    for (const p of [host, a]) { const v = await view(p); if (v.m === 'squeeze') await p.keyboard.press('Enter'); if (v.m === 'actions') await p.keyboard.press('c'); }
    const v = await view(w); if (['actions', 'squeeze', 'raise'].includes(v.m)) prompted = true;
    if (v.stage !== 'handOver') maxKnown = Math.max(maxKnown, v.known);
    if (v.stage === 'handOver' && v.known && !sd) { sd = v; await w.screenshot({ path: 'watchsd.png' }); }
    const h = await view(host); if (h.stage === 'handOver') { if (h.hand >= 3) break; await host.keyboard.press('Enter'); }
    await host.waitForTimeout(80);
  }
  console.log('watcher ever prompted:', prompted, '| hole cards known before showdown:', maxKnown, '| at showdown:', JSON.stringify(sd));
  await w.close(); await late.close(); await host.waitForTimeout(14000);
  console.log('after spectators left, host overlay:', JSON.stringify(await title(host)), 'hud:', (await view(host)).hud, errs);
  await b.close();
})();
