const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const errs = [];
  const open = async (tag, name, url = 'http://localhost:8080/') => { const ctx = await b.newContext({ viewport: { width: 750, height: 369 } }); const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(`${tag}: ${e.message}`));
    await p.addInitScript((name) => { localStorage.setItem('padpoker.seen', '1'); localStorage.setItem('padpoker.relay', 'ws://localhost:1884'); if (!localStorage.getItem('padpoker.prefs')) localStorage.setItem('padpoker.prefs', JSON.stringify({ speed: 'Fast', squeeze: false, name, nameAsked: true })); }, name); await p.goto(url); await p.waitForTimeout(500); return p; };
  const click = (p, label) => p.evaluate((label) => [...document.querySelectorAll('#overlay .btn')].find((x) => x.textContent.includes(label)).click(), label);
  const title = (p) => p.evaluate(() => (document.getElementById('overlay').hidden ? '' : document.querySelector('#overlay h1').textContent));
  const st = (p) => p.evaluate(async () => { const { S } = await import('/js/state.js'); const { ui } = await import('/js/prefs.js'); const g = S.game; return g ? { role: S.net?.role, watch: !!S.net?.watch, m: ui.mode, me: S.ME, hand: g.handNo, stage: g.stage, table: g.players.map((q) => `${q.name}${q.isHuman ? '' : '*'}:${q.chips + q.total}`).join(' ') } : {}; });
  const host = await open('host', 'Joe');
  await click(host, 'Online'); await host.waitForTimeout(200); await click(host, 'Host a game');
  for (let i = 0; i < 40 && !/^Room/.test(await title(host)); i++) await host.waitForTimeout(100);
  const code = (await title(host)).replace(/\D/g, ''); const url = `http://localhost:8080/?join=${code}`;
  const a = await open('A', 'Sam', url);
  for (let i = 0; i < 60 && !/Sam/.test(await host.evaluate(() => document.querySelector('#overlay .who')?.textContent || '')); i++) await host.waitForTimeout(100);
  await click(host, 'Seats'); await click(host, 'Seats'); await click(host, 'Seats'); await host.waitForTimeout(100); await click(host, 'Seats'); await host.waitForTimeout(100); // 4,5,6,2,3
  await click(host, 'Rebuys'); await host.waitForTimeout(200);
  console.log(await host.evaluate(() => [...document.querySelectorAll('#overlay .btn')].map((x) => x.textContent).filter((t) => /Seats|Rebuys/.test(t)).join(' | ')), '| guest sees:', await a.evaluate(() => document.querySelector('#overlay .dialog').innerText.match(/\d seats[^\n]*/)?.[0]));
  await click(host, 'Start game'); await host.waitForTimeout(2500);
  const w = await open('W', 'Wat', url); await w.waitForTimeout(2500);
  console.log('start:', (await st(host)).table, '| W watching:', (await st(w)).watch);
  const pages = [host, a, w];
  const play = async (ms, until) => { const t = Date.now(); while (Date.now() - t < ms) { for (const p of pages) { const v = await st(p); if (v.m === 'actions') await p.keyboard.press('c'); if (v.role === 'host' && v.stage === 'handOver' && v.m === 'continue') await p.keyboard.press('Enter'); } if (await until()) return true; await host.waitForTimeout(80); } return false; };
  // late seat
  await w.evaluate(() => document.getElementById('menu-btn').click()); await w.waitForTimeout(300);
  console.log('watcher pause menu:', await w.evaluate(() => [...document.querySelectorAll('#overlay .btn')].map((x) => x.textContent).join(' | ')));
  await click(w, 'Take a seat'); await w.waitForTimeout(300);
  const seated = await play(40000, async () => !(await st(w)).watch);
  console.log('W seated:', seated, '| host:', (await st(host)).table, '| W view: me', (await st(w)).me, (await st(w)).table);
  await w.screenshot({ path: 'lateseat.png' });
  // rebuy: leave Sam with almost nothing
  await host.evaluate(async () => { const { S } = await import('/js/state.js'); S.game.players[1].chips = 8; });
  const offered = await play(60000, async () => /out/i.test(await title(a)));
  console.log('Sam offered a rebuy:', offered, '|', await a.evaluate(() => document.querySelector('#overlay .dialog').innerText.replace(/\n+/g, ' / ')));
  await a.screenshot({ path: 'rebuy.png' });
  await click(a, 'Buy back in');
  const back = await play(30000, async () => / Sam:1000/.test(' ' + (await st(host)).table) && (await st(host)).stage === 'betting');
  console.log('Sam back in:', back, '|', (await st(host)).table);
  await host.evaluate(async () => { const { S } = await import('/js/state.js'); S.game.players[1].chips = 8; });
  const again = await play(40000, async () => /Sam:0/.test((await st(host)).table) && (await st(host)).stage === 'betting');
  console.log('second bust, no rebuy left -> carried on without Sam:', again, '| Sam overlay:', JSON.stringify(await title(a)), '|', (await st(host)).table);
  console.log(errs); await b.close();
})();
