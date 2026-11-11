// iPhone 14 landscape: 844x390 points minus 47pt notch insets each side and a 21pt home bar = 750x369 usable.
const { chromium } = require('playwright');
(async () => {
  const out = process.argv[2], W = +process.argv[3] || 750, H = +process.argv[4] || 369, tag = process.argv[5] || 'ip14';
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.addInitScript(() => { window.__pad = { buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0], mapping: 'standard' }; navigator.getGamepads = () => [window.__pad]; });
  await p.goto('http://localhost:8080/');
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('padpoker.seen', '1'); localStorage.setItem('padpoker.prefs', JSON.stringify({ coach: true, speed: 'Fast' })); localStorage.setItem('padpoker.save', JSON.stringify({ table: 3 })); });
  await p.reload(); await p.waitForTimeout(400);
  await p.screenshot({ path: `${out}/${tag}-title.png` });
  await p.keyboard.press('Enter'); await p.waitForTimeout(300); await p.screenshot({ path: `${out}/${tag}-intro.png` }); await p.keyboard.press('Enter');
  // report any overlapping pairs among the bottom-row elements and the top tiles
  const overlaps = () => p.evaluate(() => {
    const pick = (sel) => [...document.querySelectorAll(sel)].filter((e) => e.offsetParent !== null && !e.hidden);
    const items = [['menu', pick('#menu-btn')], ['hud', pick('#hud')], ['plate', pick('.seat.me .plate')], ['handlabel', pick('.seat.me .hand').filter((e) => e.textContent)], ['mycards', pick('.seat.me .cards')], ['btn', pick('#actions .btn')], ['panel', pick('.raise-panel')], ['tile', pick('.seat.ai .plate')], ['need', pick('.need')]]
      .flatMap(([n, els]) => els.map((e, i) => ({ n: n + (els.length > 1 ? i : ''), r: e.getBoundingClientRect() })));
    const bad = [];
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const a = items[i], c = items[j];
      if (a.n.startsWith('btn') && c.n === 'panel') continue; if (a.n.startsWith('btn') && c.n === 'need') continue;
      const ox = Math.min(a.r.right, c.r.right) - Math.max(a.r.left, c.r.left), oy = Math.min(a.r.bottom, c.r.bottom) - Math.max(a.r.top, c.r.top);
      if (ox > 2 && oy > 2) bad.push(`${a.n}x${c.n}(${Math.round(ox)}x${Math.round(oy)})`);
    }
    const off = items.filter((it) => it.r.left < -1 || it.r.right > innerWidth + 1 || it.r.top < -1 || it.r.bottom > innerHeight + 1).map((it) => it.n);
    return { bad, off };
  });
  const got = {}; const t0 = Date.now();
  while (Date.now() - t0 < 120000 && !(got.call && got.raise && got.over)) {
    const s = await p.evaluate(() => ({ m: window.__poker.ui.mode, toCall: window.__poker.game.stage === 'betting' && window.__poker.game.toAct === 0 ? window.__poker.game.legal(0).toCall : -1, sd: window.__poker.game.result?.showdown }));
    if (s.m === 'actions') {
      if (s.toCall > 0 && !got.call) { got.call = await overlaps(); await p.waitForTimeout(500); await p.screenshot({ path: `${out}/${tag}-call.png` }); }
      if (!got.raise && await p.evaluate(() => window.__poker.game.legal(0).canRaise)) { await p.keyboard.press('r'); await p.waitForTimeout(350); got.raise = await overlaps(); await p.screenshot({ path: `${out}/${tag}-raise.png` }); await p.keyboard.press('Escape'); }
      await p.keyboard.press('c');
    }
    if (s.m === 'continue') { if (!got.over) { await p.waitForTimeout(900); got.over = await overlaps(); await p.screenshot({ path: `${out}/${tag}-over.png` }); } await p.keyboard.press('Enter'); }
    if (s.m === 'skip' || s.m === 'squeeze') await p.keyboard.press('Enter');
    await p.waitForTimeout(80);
  }
  console.log(tag, `${W}x${H}`, JSON.stringify(got), 'errors', errs);
  await b.close();
})();
