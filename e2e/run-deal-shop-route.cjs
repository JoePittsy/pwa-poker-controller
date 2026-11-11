const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const errs = [];
  const p = await (await b.newContext({ viewport: { width: 750, height: 369 } })).newPage(); p.on('pageerror', (e) => errs.push(e.message));
  await p.addInitScript(() => { if (localStorage.getItem('padpoker.seen')) return; localStorage.setItem('padpoker.seen', '1'); localStorage.setItem('padpoker.prefs', JSON.stringify({ speed: 'Fast', squeeze: false })); localStorage.setItem('padpoker.stats', JSON.stringify({ hands: 300, won: 90, tables: 4 })); localStorage.setItem('padpoker.rank', '2'); });
  await p.goto('http://localhost:8080/'); await p.waitForTimeout(600);
  const click = (label) => p.evaluate((label) => [...document.querySelectorAll('#overlay .btn')].find((x) => x.textContent.includes(label)).click(), label);
  const dlg = (n = 420) => p.evaluate((n) => document.querySelector('#overlay .dialog > div')?.innerText.replace(/\n+/g, ' / ').slice(0, n), n);
  const btns = () => p.evaluate(() => [...document.querySelectorAll('#overlay .btn')].map((x) => x.innerText.replace(/\n+/g, ' ') + (x.classList.contains('off') ? ' (off)' : '')).join(' | '));
  const box = () => p.evaluate(() => { const d = document.querySelector('#overlay .dialog').getBoundingClientRect(); return `${Math.round(d.top)}..${Math.round(d.bottom)}`; });
  const S = (f) => p.evaluate(async (f) => { const { S } = await import('/js/state.js'); return new Function('S', `return ${f}`)(S); }, f);
  await click('Play'); await p.waitForTimeout(300);
  console.log('deals:', await btns(), '| dialog', await box()); await p.screenshot({ path: 'deals.png' });
  await click('Short Stack'); await p.waitForTimeout(500);
  console.log('intro:', await dlg(500));
  await click('Deal me in'); await p.waitForTimeout(3000);
  console.log('table 1: me', await S('S.game.players[0].chips'), 'trip', JSON.stringify(await S('S.trip')));
  const clear = async () => { await p.evaluate(async () => { const { S } = await import('/js/state.js'); const r = await import('/js/replay.js'); const g = S.game; const all = g.players.reduce((a, q) => a + q.chips + q.total, 0); g.players.forEach((q, i) => { q.chips = i ? 0 : all; q.total = 0; }); S.runId++; r.showCleared(); }); await p.waitForTimeout(400); };
  await clear();
  console.log('cleared:', await dlg(330));
  await click('To the shop'); await p.waitForTimeout(400);
  console.log('shop:', await dlg(700)); console.log('  buttons:', await btns(), '| dialog', await box()); await p.screenshot({ path: 'shop.png' });
  await p.evaluate(() => [...document.querySelectorAll('#overlay .btn')][0].click()); await p.waitForTimeout(300);
  await click('Reroll'); await p.waitForTimeout(300); await click('+25% stack'); await p.waitForTimeout(300);
  console.log('after buying a perk, a reroll and a boost:', JSON.stringify(await S('({ perks: S.perks, trip: S.trip })'))); console.log('  buttons:', await btns());
  await p.waitForTimeout(100);
  
  await click('The hard way'); await p.waitForTimeout(500);
  console.log('intro 2:', await dlg(900));
  await click('Deal me in'); await p.waitForTimeout(3000);
  console.log('table 2:', await S('S.game.players.map((q) => q.name + ":" + q.chips + (q.style ? "/" + q.style.skill.toFixed(2) : "")).join(" ")'), '| blinds every', await S('S.game.handsPerLevel'));
  // reload mid-run: the trip must come back
  await p.reload(); await p.waitForTimeout(600); await click('Continue'); await p.waitForTimeout(2500);
  console.log('after reload: trip', JSON.stringify(await S('S.trip')));
  const bank0 = await p.evaluate(() => localStorage.getItem('padpoker.bank'));
  await p.evaluate(async () => { const { S } = await import('/js/state.js'); const r = await import('/js/replay.js'); S.runId++; r.busted(); }); await p.waitForTimeout(400);
  console.log('busted:', await dlg(330)); console.log('bank', bank0, '->', await p.evaluate(() => localStorage.getItem('padpoker.bank')), errs);
  await b.close();
})();
