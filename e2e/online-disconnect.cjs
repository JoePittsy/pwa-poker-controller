const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const errs = [];
  const mk = async () => { const ctx = await b.newContext({ viewport: { width: 750, height: 369 } }); await ctx.addInitScript(() => { localStorage.setItem('padpoker.seen', '1'); localStorage.setItem('padpoker.relay', 'ws://localhost:1884'); localStorage.setItem('padpoker.prefs', JSON.stringify({ speed: 'Fast', squeeze: false, nameAsked: true })); }); return ctx; };
  const open = async (ctx, tag, url = 'http://localhost:8080/') => { const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(`${tag}: ${e.message}`)); await p.goto(url); await p.waitForTimeout(400); return p; };
  const click = (p, label) => p.evaluate((label) => [...document.querySelectorAll('#overlay .btn')].find((x) => x.textContent.includes(label)).click(), label);
  const title = (p) => p.evaluate(() => (document.getElementById('overlay').hidden ? '' : document.querySelector('#overlay h1').textContent));
  const waitTitle = async (p, re, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (re.test(await title(p))) return true; await p.waitForTimeout(150); } return false; };
  const hc = await mk(), ac = await mk(), bc = await mk();
  const host = await open(hc, 'host');
  await click(host, 'Online'); await host.waitForTimeout(200); await click(host, 'Host a game');
  await waitTitle(host, /^Room/);
  const code = (await title(host)).replace(/\D/g, '');
  const url = `http://localhost:8080/?join=${code}`;
  let ga = await open(ac, 'A', url), gb = await open(bc, 'B', url);
  for (let i = 0; i < 60; i++) { if (/P3/.test(await host.evaluate(() => document.querySelector('#overlay .who')?.textContent || ''))) break; await host.waitForTimeout(100); }
  for (let i = 0; i < 4; i++) { await click(host, 'Turn timer'); await host.waitForTimeout(60); }
  await click(host, 'Seats'); await click(host, 'Table'); await click(host, 'Table'); await click(host, 'Twist'); await click(host, 'Card back');
  await host.waitForTimeout(500);
  console.log('host buttons:', await host.evaluate(() => [...document.querySelectorAll('#overlay .btn')].map((x) => x.textContent).join(' | ')));
  await host.screenshot({ path: 'lobby.png' });
  console.log('guest lobby:', await ga.evaluate(() => document.querySelector('#overlay .dialog').innerText.replace(/\n+/g, ' / ')));
  await click(host, 'Start game');
  const st = (p) => p.evaluate(() => { const g = window.__poker.game; const c = document.querySelector('.clock.on'); return g ? { m: window.__poker.ui.mode, n: g.players.length, hand: g.handNo, stage: g.stage, toAct: g.toAct, chips: g.players.map((q) => q.chips).join(), mat: document.getElementById('app').style.getPropertyValue('--mat'), clock: c ? `${c.className}:${c.firstChild.style.width}:${c.lastChild.textContent}` : '', ov: document.getElementById('overlay').hidden ? '' : document.querySelector('#overlay h1').textContent } : null; }).catch(() => null);
  await host.waitForTimeout(3000);
  console.log('host', JSON.stringify(await st(host))); console.log('A   ', JSON.stringify(await st(ga)));
  // 1. nobody presses anything: the 15 s clock must act for people
  const t0 = Date.now(); let hot = false, humanTurn = -1, passed = false;
  while (Date.now() - t0 < 45000) {
    const h = await st(host), a = await st(ga);
    if (!hot && a.clock.includes('hot') && a.toAct === 1) { hot = true; await ga.waitForTimeout(2500); await ga.screenshot({ path: 'clock.png' }); }
    if (!hot && h.clock.includes('hot')) { hot = true; await host.waitForTimeout(2500); await host.screenshot({ path: 'clock.png' }); }
    if (h.toAct >= 0 && h.toAct <= 2) { if (humanTurn >= 0 && humanTurn !== h.toAct && hot) { passed = true; break; } humanTurn = h.toAct; }
    await host.waitForTimeout(300);
  }
  console.log(`timer expiry: clock acted for an idle player=${passed} after ${Math.round((Date.now() - t0) / 1000)}s, red countdown seen=${hot}`);
  // helper: everyone plays quickly
  const play = async (pages, ms, until) => { const t = Date.now(); while (Date.now() - t < ms) { for (const p of pages) { const v = await st(p); if (v?.m === 'actions') await p.keyboard.press('c'); } const h = await st(host); if (h.stage === 'handOver' && !h.ov) await host.keyboard.press('Enter'); if (until && await until()) return true; await host.waitForTimeout(100); } return false; };
  await play([host, ga, gb], 6000);
  // 2. B drops: the game should pause for everyone
  const before = await st(host);
  await gb.close({ runBeforeUnload: false });
  const paused = await play([host, ga], 20000, async () => /paused/.test(await title(host)));
  console.log('B closed -> host overlay:', await title(host), '| A overlay:', await title(ga), '| paused', paused);
  await host.screenshot({ path: 'paused.png' });
  const h1 = await st(host); await host.waitForTimeout(2500); const h2 = await st(host);
  console.log('frozen while paused:', h1.hand === h2.hand && h1.toAct === h2.toAct && h1.clock === h2.clock, h2.clock);
  // 3. B comes back on the same device
  gb = await open(bc, 'B2', url);
  await host.waitForTimeout(3000);
  console.log('B reopened -> host overlay:', JSON.stringify(await title(host)), '| A overlay:', JSON.stringify(await title(ga)), '| B state', JSON.stringify(await st(gb)));
  let lastLine = '';
  const moved = await play([host, ga, gb], 30000, async () => { const x = [await st(host), await st(ga), await st(gb)].map((v) => v ? `${v.m}/to${v.toAct}/${v.stage}/${v.chips}/${v.ov}` : "none").join('  '); if (x !== lastLine) { console.log('   ', x); lastLine = x; } if (!(await st(gb))) console.log("    B dialog:", await gb.evaluate(() => document.querySelector("#overlay .dialog")?.innerText.replace(/\n+/g, " / "))); return (await st(host)).hand > h2.hand; });
  const hh = await st(host), bb2 = await st(gb); console.log('  host', JSON.stringify(hh)); console.log('  A', JSON.stringify(await st(ga))); console.log('  B', JSON.stringify(bb2));
  console.log('carried on after rejoin:', moved, 'B in sync:', hh.chips === bb2.chips || `${hh.chips} vs ${bb2.chips}`);
  // 4. B drops again, host replaces them
  await gb.close();
  await play([host, ga], 20000, async () => /paused/.test(await title(host)));
  console.log('B closed again ->', await title(host), '| buttons:', await host.evaluate(() => [...document.querySelectorAll('#overlay .btn')].map((x) => x.textContent).join(' | ')));
  const h3 = await st(host);
  await click(host, 'Replace');
  await host.waitForTimeout(800);
  console.log('after replace: host overlay', JSON.stringify(await title(host)), '| A overlay', JSON.stringify(await title(ga)), '| seat 2 tag:', await host.evaluate(() => document.querySelectorAll('.seat')[2]?.innerText.replace(/\n+/g, ' ')));
  const on = await play([host, ga], 25000, async () => (await st(host)).hand > h3.hand + 1);
  const he = await st(host), ae = await st(ga);
  console.log('game continued with computer in the seat:', on, 'hand', he.hand, 'A in sync:', he.chips === ae.chips || `${he.chips} vs ${ae.chips}`);
  // B tries to come back after being replaced
  gb = await open(bc, 'B3', url); await gb.waitForTimeout(3500);
  console.log('B after being replaced sees:', await gb.evaluate(() => document.querySelector('#overlay .dialog')?.innerText.replace(/\n+/g, ' / ')));
  console.log('errors', errs);
  await b.close();
})();
