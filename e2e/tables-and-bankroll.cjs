const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 750, height: 369 } });
  let p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message));
  await ctx.addInitScript(() => { if (localStorage.getItem('padpoker.seen')) return; localStorage.setItem('padpoker.seen', '1'); localStorage.setItem('padpoker.prefs', JSON.stringify({ speed: 'Fast', squeeze: false })); });
  await p.goto('http://localhost:8080/'); await p.waitForTimeout(600);
  const click = (label) => p.evaluate((label) => [...document.querySelectorAll('#overlay .btn')].find((x) => x.textContent.includes(label)).click(), label);
  const bank = () => p.evaluate(() => localStorage.getItem('padpoker.bank'));
  const st = () => p.evaluate(async () => { const { S } = await import('/js/state.js'); const { ui } = await import('/js/prefs.js'); const g = S.game; return { m: ui.mode, mode: S.mode, hand: g?.handNo, bb: g?.bb, me: g?.players[0].chips, chips: g?.players.map((q) => q.chips).join(), hud: document.getElementById('hud').innerText.replace(/\n/g, ' '), ov: document.getElementById('overlay').hidden ? '' : document.querySelector('#overlay h1').textContent }; });
  const play = async (until, ms = 60000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await st(); if (await until(v)) return v; if (v.ov) return v; if (v.m === 'actions') await p.keyboard.press('c'); else if (v.m === 'continue') await p.keyboard.press('Enter'); await p.waitForTimeout(60); } return st(); };
  console.log('menu:', await p.evaluate(() => [...document.querySelectorAll('#overlay .btn')].map((x) => x.textContent).join(' | ')), '|', await p.evaluate(() => document.querySelector('.bank')?.innerText), '| dialog', await p.evaluate(() => { const d = document.querySelector('#overlay .dialog').getBoundingClientRect(); return `${Math.round(d.top)}..${Math.round(d.bottom)}`; }));
  await p.screenshot({ path: 'menu_bank.png' });
  await click('Tables'); await p.waitForTimeout(250); await p.screenshot({ path: 'tables.png' });
  await click('Cash game'); await p.waitForTimeout(250);
  console.log('stakes:', await p.evaluate(() => [...document.querySelectorAll('#overlay .btn')].map((x) => x.textContent + (x.classList.contains('off') ? ' (off)' : '')).join(' | ')));
  await click('5/10'); await p.waitForTimeout(800);
  console.log('sat:', await bank());
  let v = await play((x) => x.hand >= 6);
  console.log('cash after 6 hands:', JSON.stringify(v), '| bank', await bank());
  await p.screenshot({ path: 'cash.png' });
  // closing the app mid-session must not lose the chips
  await p.close(); p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message)); await p.goto('http://localhost:8080/'); await p.waitForTimeout(700);
  console.log('after reopening:', await bank(), '| toast:', await p.evaluate(() => document.getElementById('toast')?.textContent));
  // sit again and cash out by the menu
  await click('Tables'); await p.waitForTimeout(200); await click('Cash game'); await p.waitForTimeout(200); await click('5/10'); await p.waitForTimeout(800);
  v = await play((x) => x.hand >= 3);
  await p.evaluate(() => document.getElementById('menu-btn').click()); await p.waitForTimeout(300);
  console.log('pause buttons:', await p.evaluate(() => [...document.querySelectorAll('#overlay .btn')].map((x) => x.textContent).join(' | ')));
  await click('Cash out'); await p.waitForTimeout(700);
  console.log('cashed out: table stack was', v.me, '| bank', await bank(), '| toast:', await p.evaluate(() => document.getElementById('toast')?.textContent));
  // sit and go
  await click('Tables'); await p.waitForTimeout(200); await click('Sit & go'); await p.waitForTimeout(200); const before = await bank(); await click("Hold'em"); await p.waitForTimeout(800);
  console.log('sng entered: bank', before, '->', await bank());
  v = await play(() => false, 90000);
  console.log('sng end:', v.ov, '|', await p.evaluate(() => document.querySelector('#overlay .dialog > div')?.innerText.replace(/\n+/g, ' / ')), '| bank', await bank());
  await click('Done'); await p.waitForTimeout(300);
  // ladder
  await click('Tables'); await p.waitForTimeout(200); await click('Heads-up'); await p.waitForTimeout(250); await p.screenshot({ path: 'ladder.png' });
  await click('Play'); await p.waitForTimeout(800);
  v = await play(() => false, 90000);
  console.log('ladder end:', v.ov, '|', await p.evaluate(() => document.querySelector('#overlay .dialog > div')?.innerText.replace(/\n+/g, ' / ')), '| bank', await bank(), errs);
  await b.close();
})();
