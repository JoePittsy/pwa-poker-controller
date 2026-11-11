const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const errs = [];
  const open = async (tag, name, url = 'http://localhost:8080/', ver) => { const ctx = await b.newContext({ viewport: { width: 750, height: 369 } }); const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(`${tag}: ${e.message}`));
    if (ver) await p.route('**/version.txt', (r) => r.fulfill({ body: ver }));
    await p.addInitScript((name) => { localStorage.setItem('padpoker.seen', '1'); localStorage.setItem('padpoker.relay', 'ws://localhost:1884'); localStorage.setItem('padpoker.prefs', JSON.stringify({ speed: 'Fast', squeeze: false, name, nameAsked: true })); }, name); await p.goto(url); await p.waitForTimeout(500); return p; };
  const click = (p, label) => p.evaluate((label) => [...document.querySelectorAll('#overlay .btn')].find((x) => x.textContent.includes(label)).click(), label);
  const title = (p) => p.evaluate(() => (document.getElementById('overlay').hidden ? '' : document.querySelector('#overlay h1').textContent));
  const host = await open('host', 'Joe', undefined, 'aaaaaaa1111');
  await click(host, 'Online'); await host.waitForTimeout(200);
  console.log('online menu:', await host.evaluate(() => document.querySelector('#overlay .ver')?.textContent));
  await click(host, 'Host a game');
  for (let i = 0; i < 40 && !/^Room/.test(await title(host)); i++) await host.waitForTimeout(100);
  const code = (await title(host)).replace(/\D/g, '');
  // the snooper: knows the room code, listens to everything in the room
  const spy = await open('spy', 'Spy');
  await spy.evaluate(async (code) => { const { connectAny } = await import('/js/net.js'); const c = await connectAny(0); window.heard = []; c.relay.onMessage = (t, text) => window.heard.push([t, text]); c.relay.subscribe(`padpoker2/${code}/#`); window.spy = c.relay; }, code);
  const old = await open('old', 'Old', `http://localhost:8080/?join=${code}`, 'bbbbbbb2222'); await old.waitForTimeout(2500);
  console.log('wrong-version guest sees:', await old.evaluate(() => document.querySelector('#overlay .dialog')?.innerText.replace(/\n+/g, ' / ').slice(0, 150)));
  const g = await open('g', 'Sam', `http://localhost:8080/?join=${code}`, 'aaaaaaa1111');
  for (let i = 0; i < 50 && !/Sam/.test(await host.evaluate(() => document.querySelector('#overlay .who')?.textContent || '')); i++) await host.waitForTimeout(100);
  console.log('host lobby:', await host.evaluate(() => document.querySelector('#overlay .who')?.textContent), '|', await host.evaluate(() => document.querySelector('#overlay .ver')?.textContent), '| guest:', await g.evaluate(() => document.querySelector('#overlay .ver')?.textContent));
  await host.screenshot({ path: 'lobby3.png' });
  await click(host, 'Start game'); await host.waitForTimeout(3000);
  const st = (p) => p.evaluate(() => { const g = window.__poker.game; return { m: window.__poker.ui.mode, toAct: g.toAct, chips: g.players.map((q) => q.chips).join() }; });
  for (let i = 0; i < 40; i++) { if ((await st(host)).m === 'actions') await host.keyboard.press('c'); if ((await st(g)).toAct === 1) break; await host.waitForTimeout(150); }
  // the spy forges an action for the guest, in the clear and by replaying the guest's own traffic
  const before = await st(host);
  await spy.evaluate((code) => { const pid = JSON.parse(window.heard.find(([t]) => t.endsWith('/up'))[1]).pid; window.spy.publish(`padpoker2/${code}/up`, JSON.stringify({ t: 'act', pid, a: { type: 'fold' }, stamp: 'x' })); for (const [t, text] of window.heard.filter(([t]) => t.endsWith('/up'))) window.spy.publish(t, text); }, code);
  await host.waitForTimeout(1500);
  const after = await st(host);
  console.log('forged/replayed actions ignored:', before.toAct === after.toAct && before.chips === after.chips, JSON.stringify(after));
  const heard = await spy.evaluate(() => window.heard.map(([t, x]) => x));
  const leaks = heard.filter((x) => /cards|"chips"|"board"|"t":/.test(x)).length;
  console.log(`spy heard ${heard.length} messages; readable game data in ${leaks}; sample: ${heard[heard.length - 1].slice(0, 110)}`);
  if ((await st(g)).m === 'actions') await g.keyboard.press('c'); await host.waitForTimeout(1500);
  console.log('real guest action accepted:', (await st(host)).toAct !== 1, errs);
  await b.close();
})();
