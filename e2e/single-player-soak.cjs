// Plays N hands with the keyboard (always check/call, sometimes raise), reports errors, grabs screenshots on a condition.
const { chromium } = require('playwright');
(async () => {
  const out = process.argv[2], hands = +process.argv[3] || 8, shotSel = process.argv[4] || '.say.show', pre = process.argv[5];
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => m.type() === 'error' && !/404/.test(m.text()) && errs.push(m.text()));
  await p.goto('http://localhost:8080/');
  if (pre) { await p.evaluate(pre); await p.reload(); await p.waitForTimeout(400); }
  await p.keyboard.press('Enter');
  const st = () => p.evaluate((sel) => ({ mode: window.__poker.ui.mode, hand: window.__poker.game?.handNo, ov: !document.getElementById('overlay').hidden, hit: !!document.querySelector(sel) }), shotSel);
  let shots = 0, t0 = Date.now(), turns = 0;
  while (Date.now() - t0 < 150000) {
    const s = await st();
    if (s.hit && shots < 2) { await p.waitForTimeout(350); await p.screenshot({ path: `${out}/soak${++shots}.png` }); await p.waitForTimeout(2500); }
    if (s.ov) { if (s.hand >= hands) break; await p.keyboard.press('Enter'); await p.waitForTimeout(300); continue; }
    if (s.mode === 'actions') { await p.keyboard.press(++turns % 5 === 0 ? 'r' : 'c'); if (turns % 5 === 0) await p.keyboard.press('Enter'); }
    else if (s.mode === 'continue') { if (s.hand >= hands) break; await p.keyboard.press('Enter'); }
    else if (s.mode === 'squeeze' || s.mode === 'skip') await p.keyboard.press('Enter');
    await p.waitForTimeout(120);
  }
  const fin = await p.evaluate(() => ({ hand: window.__poker.game.handNo, chips: window.__poker.game.players.map((q) => q.chips) }));
  console.log('hands', fin.hand, 'chips', fin.chips.join(), 'shots', shots, 'errors', errs);
  await b.close();
})();
