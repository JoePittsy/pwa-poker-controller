const { chromium } = require('playwright');
const DROP = +process.argv[2] || 0;
(async () => {
  const b = await chromium.launch(); const errs = [];
  const open = async (tag, name, url = 'http://localhost:8080/') => { const ctx = await b.newContext({ viewport: { width: 750, height: 369 } }); const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(`${tag}: ${e.message}`));
    await p.addInitScript(([name, DROP]) => { localStorage.setItem('padpoker.seen', '1'); localStorage.setItem('padpoker.relay', 'ws://localhost:1884'); localStorage.setItem('padpoker.prefs', JSON.stringify({ speed: 'Fast', squeeze: false, name }));
      const send = WebSocket.prototype.send; let hold = [];
      WebSocket.prototype.send = function (d) { const u = new Uint8Array(d.buffer || d); if ((u[0] >> 4) === 3) { const r = Math.random(); if (r < DROP) return; if (r < DROP * 2) { hold.push(d); return setTimeout(() => { try { send.call(this, hold.shift()); } catch {} }, 300 + Math.random() * 900); } } return send.call(this, d); };
    }, [name, DROP]); await p.goto(url); await p.waitForTimeout(400); return p; };
  const click = (p, label) => p.evaluate((label) => [...document.querySelectorAll('#overlay .btn')].find((x) => x.textContent.includes(label)).click(), label);
  const title = (p) => p.evaluate(() => (document.getElementById('overlay').hidden ? '' : document.querySelector('#overlay h1').textContent));
  const host = await open('host', 'Joe');
  await click(host, 'Online'); await host.waitForTimeout(200);
  await host.screenshot({ path: 'onlinemenu.png' });
  await click(host, 'Host a game');
  for (let i = 0; i < 40 && !/^Room/.test(await title(host)); i++) await host.waitForTimeout(100);
  const code = (await title(host)).replace(/\D/g, '');
  const names = ['Sam', 'Joe', '<b>Al</b>', '', 'Priya'];
  const guests = []; for (let i = 0; i < 5; i++) guests.push(await open('g' + i, names[i], `http://localhost:8080/?join=${code}`));
  for (let i = 0; i < 150; i++) { if ((await host.evaluate(() => document.querySelector('#overlay .who')?.textContent || '')).split(',').length >= 6) break; await host.waitForTimeout(200); }
  console.log('lobby:', await host.evaluate(() => document.querySelector('#overlay .who')?.textContent));
  for (let i = 0; i < 3; i++) { await click(host, 'Turn timer'); await host.waitForTimeout(60); }
  console.log(await host.evaluate(() => [...document.querySelectorAll('#overlay .btn')].map((x) => x.textContent).slice(2, 4).join(' | ')));
  await click(host, 'Start game');
  const st = (p) => p.evaluate(() => { const g = window.__poker.game; return g ? { m: window.__poker.ui.mode, hand: g.handNo, stage: g.stage, toAct: g.toAct, chips: g.players.map((q) => q.chips).join(), ov: document.getElementById('overlay').hidden ? '' : document.querySelector('#overlay h1').textContent } : null; }).catch(() => null);
  const pages = [host, ...guests]; const t0 = Date.now(); let acts = 0, lastAct = Date.now(), worst = 0, stuckSeat = -1;
  while (Date.now() - t0 < 150000) {
    const h = await st(host);
    for (const p of pages) { const v = await st(p); if (v?.m === 'actions') { await p.keyboard.press('c'); acts++; } }
    if (h?.ov) { console.log('host overlay:', h.ov); if (/paused/.test(h.ov)) await click(host, 'Keep waiting'); }
    if (h?.stage === 'handOver' && !h.ov) await host.keyboard.press('Enter');
    if (h?.hand >= 6) break;
    await host.waitForTimeout(60);
  }
  await host.waitForTimeout(4500);
  const h = await st(host); const gs = []; for (const g of guests) gs.push(await st(g));
  console.log(`drop=${DROP}: reached hand ${h.hand} in ${Math.round((Date.now() - t0) / 1000)}s with ${acts} actions; guests in sync: ${gs.map((g) => g && g.chips === h.chips && g.hand === h.hand)}`);
  console.log('names at table:', await guests[0].evaluate(() => window.__poker.game.players.map((p) => p.name).join(', ')));
  await guests[0].screenshot({ path: 'six.png' });
  console.log('errors', errs); await b.close();
})();
