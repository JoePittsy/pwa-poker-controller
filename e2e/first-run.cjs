const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const errs = [];
  const p = await (await b.newContext({ viewport: { width: 750, height: 369 } })).newPage(); p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:8080/'); await p.waitForTimeout(700);
  const click = (label) => p.evaluate((label) => [...document.querySelectorAll('#overlay .btn, #actions .btn')].find((x) => x.getClientRects().length && x.textContent.includes(label))?.click(), label);
  const st = () => p.evaluate(async () => { const { S } = await import('/js/state.js'); const { ui } = await import('/js/prefs.js'); const g = S.game; return { m: ui.mode, hand: g?.handNo, stage: g?.stage, board: g?.board.length, shown: ui.boardShown, label: document.querySelector('.seat.me .hand')?.textContent || '', btns: [...document.querySelectorAll('#actions .btn')].map((x) => x.innerText.replace(/\n/g, ' ')).join('|'), tip: document.getElementById('coachtip').hidden ? '' : document.getElementById('coachtip').innerText.replace(/\n+/g, ' '), msg: document.getElementById('msg').textContent, ov: document.getElementById('overlay').hidden ? '' : document.querySelector('#overlay h1').textContent }; });
  let taps = 0; const tap = async (l) => { taps++; await click(l); await p.waitForTimeout(450); };
  await tap('Play'); await tap('Skip');
  let v = await st(); console.log('after Play+Skip:', v.ov, '|', await p.evaluate(() => [...document.querySelectorAll('#overlay .btn')].map((x) => x.textContent).join(' | ')));
  if (/coach/i.test(await p.evaluate(() => document.querySelector('#overlay .dialog').innerText))) { await p.evaluate(() => [...document.querySelectorAll('#overlay .btn')][0].click()); taps++; await p.waitForTimeout(400); }
  await tap('Deal me in'); await p.waitForTimeout(3200);
  v = await st(); console.log(`taps to first decision: ${taps} | mode ${v.m} | buttons ${v.btns}`);
  // play passively, watch the label against the turned cards and whether hands advance by themselves
  let early = 0, checks = 0, autoAdvanced = 0, lastHand = v.hand, pressedNext = 0, tipShot = false; const t0 = Date.now();
  while (Date.now() - t0 < 75000) {
    v = await st();
    if (v.ov) break;
    if (v.board > (v.shown ?? 0)) { checks++; const turned = v.shown ?? 0; const cat = /Pair|Two Pair|Three|Straight|Flush|Full|Four/.test(v.label); if (turned < 3 && cat) early++; }
    if (v.hand !== lastHand) { autoAdvanced++; lastHand = v.hand; }
    if (v.tip && !tipShot) { tipShot = true; await p.screenshot({ path: 'tipstrip.png' }); console.log('coach strip:', v.tip.slice(0, 120)); await click('Got it'); }
    if (v.m === 'actions') await p.keyboard.press('c');
    await p.waitForTimeout(60);
  }
  console.log(`hands advanced by themselves: ${autoAdvanced} (Next hand never pressed) | label named a hand before 3 cards had turned: ${early} of ${checks} mid-deal checks | result text: "${v.msg}"`, errs);
  await p.screenshot({ path: 'firstrun.png' });
  await b.close();
})();
