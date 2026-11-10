// Visual "juice": pops, shakes, flying chips, particles, rolling numbers, rumble.
const SPRING = 'cubic-bezier(.2, 1.8, .4, 1)';
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const rnd = (a, b) => a + Math.random() * (b - a);
const layer = () => document.getElementById('fx');
const mid = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize);

export function pop(el, s = 1.3, dur = 340) {
  el?.animate([{ scale: s }, { scale: 1 }], { duration: dur, easing: SPRING });
}

export function shake(px = 6, dur = 380) {
  if (calm) return;
  const u = rem() / 10;
  const frames = Array.from({ length: 9 }, (_, i) => {
    const k = (1 - i / 8) * px * u;
    return { translate: `${rnd(-k, k)}px ${rnd(-k, k)}px` };
  });
  document.getElementById('app').animate(frames, { duration: dur, easing: 'linear' });
}

function spawn(cls, html = '') {
  const e = document.createElement('div');
  e.className = cls; e.innerHTML = html;
  layer().append(e);
  return e;
}

export function flyChips(fromEl, toEl, n = 1, { stagger = 45, onLand } = {}) {
  const a = mid(fromEl), b = mid(toEl), u = rem();
  for (let i = 0; i < n; i++) {
    const c = spawn('chipfx c' + (i % 3));
    const x0 = a.x + rnd(-u, u), y0 = a.y + rnd(-u, u) * 0.5, x1 = b.x + rnd(-u, u) * 0.6, y1 = b.y + rnd(-u, u) * 0.4;
    const mx = (x0 + x1) / 2 + rnd(-2, 2) * u, my = Math.min(y0, y1) - rnd(1, 4) * u;
    c.animate([
      { transform: `translate(${x0}px, ${y0}px) scale(.5)`, opacity: 0 },
      { transform: `translate(${(x0 * 3 + mx) / 4}px, ${(y0 * 3 + my) / 4}px) scale(1)`, opacity: 1, offset: 0.15 },
      { transform: `translate(${mx}px, ${my}px) scale(1.15)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${x1}px, ${y1}px) scale(.8)`, opacity: 1 },
    ], { duration: rnd(380, 520), delay: i * stagger, easing: 'cubic-bezier(.4, 0, .3, 1)', fill: 'both' })
      .onfinish = () => { c.remove(); onLand?.(i); };
  }
}

export function floatText(el, text, cls = '') {
  const p = mid(el), u = rem();
  const e = spawn('floatfx ' + cls, text);
  e.animate([
    { transform: `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) scale(.4)`, opacity: 0 },
    { transform: `translate(${p.x}px, ${p.y - 3 * u}px) translate(-50%, -50%) scale(1.25)`, opacity: 1, offset: 0.2 },
    { transform: `translate(${p.x}px, ${p.y - 4 * u}px) translate(-50%, -50%) scale(1)`, opacity: 1, offset: 0.7 },
    { transform: `translate(${p.x}px, ${p.y - 6 * u}px) translate(-50%, -50%) scale(1)`, opacity: 0 },
  ], { duration: 1500, easing: 'ease-out' }).onfinish = () => e.remove();
}

const BITS = ['♠︎', '♥︎', '♦︎', '♣︎', '', '', ''];
export function burst(el, n = 34) {
  if (calm) return;
  const p = mid(el), u = rem();
  for (let i = 0; i < n; i++) {
    const g = BITS[i % BITS.length];
    const e = spawn(`bitfx b${i % 4}${g ? ' suit' : ''}`, g);
    const ang = rnd(-Math.PI, 0) * 1.1 + 0.15, dist = rnd(6, 20) * u;
    const dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist;
    e.animate([
      { transform: `translate(${p.x}px, ${p.y}px) rotate(0deg) scale(.3)`, opacity: 1 },
      { transform: `translate(${p.x + dx}px, ${p.y + dy}px) rotate(${rnd(-300, 300)}deg) scale(1.2)`, opacity: 1, offset: 0.45, easing: 'ease-in' },
      { transform: `translate(${p.x + dx * 1.25}px, ${p.y + dy + rnd(6, 12) * u}px) rotate(${rnd(-600, 600)}deg) scale(.8)`, opacity: 0 },
    ], { duration: rnd(900, 1500), easing: 'cubic-bezier(.1, .7, .3, 1)' }).onfinish = () => e.remove();
  }
}

// Tween the number shown in el towards `to`.
export function roll(el, to, { dur = 420, onTick } = {}) {
  const from = el._cur ?? to;
  cancelAnimationFrame(el._raf);
  if (from === to || calm) { el._cur = to; el.textContent = to.toLocaleString(); return; }
  if (to > from) pop(el, 1.25);
  const t0 = performance.now();
  let lastTick = 0;
  const frame = (now) => {
    const k = Math.min(1, (now - t0) / dur);
    el._cur = Math.round(from + (to - from) * (1 - (1 - k) ** 3));
    el.textContent = el._cur.toLocaleString();
    if (onTick && now - lastTick > 55) { lastTick = now; onTick(k); }
    if (k < 1) el._raf = requestAnimationFrame(frame);
  };
  el._raf = requestAnimationFrame(frame);
}

export function rumble(strong = 0.5, weak = 0.5, ms = 120) {
  try {
    for (const gp of navigator.getGamepads?.() ?? []) {
      gp?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak })?.catch?.(() => {});
    }
  } catch { /* unsupported */ }
}

// A big sticker that punches into the middle of the screen for a moment.
export function banner(text) {
  const e = spawn('bannerfx', text);
  const at = 'translate(50vw, 42vh) translate(-50%, -50%)';
  e.animate([
    { transform: `${at} scale(3) rotate(-20deg)`, opacity: 0 },
    { transform: `${at} scale(1) rotate(-6deg)`, opacity: 1, offset: 0.16, easing: SPRING },
    { transform: `${at} scale(1.05) rotate(-5deg)`, opacity: 1, offset: 0.8 },
    { transform: `${at} scale(.6) rotate(4deg)`, opacity: 0 },
  ], { duration: calm ? 900 : 1300 }).onfinish = () => e.remove();
}
