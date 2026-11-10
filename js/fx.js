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

let rumbleOn = true;
export function setRumble(on) { rumbleOn = on; }
export function rumble(strong = 0.5, weak = 0.5, ms = 120) {
  if (!rumbleOn) return;
  try {
    for (const gp of navigator.getGamepads?.() ?? []) {
      gp?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak })?.catch?.(() => {});
    }
  } catch { /* unsupported */ }
}

// A big sticker that punches into the middle of the screen for a moment.
export function banner(text, cls = '') {
  const e = spawn(`bannerfx ${cls}`, text);
  const at = 'translate(50vw, 42vh) translate(-50%, -50%)';
  e.animate([
    { transform: `${at} scale(3) rotate(-20deg)`, opacity: 0 },
    { transform: `${at} scale(1) rotate(-6deg)`, opacity: 1, offset: 0.16, easing: SPRING },
    { transform: `${at} scale(1.05) rotate(-5deg)`, opacity: 1, offset: 0.8 },
    { transform: `${at} scale(.6) rotate(4deg)`, opacity: 0 },
  ], { duration: calm ? 900 : 1300 }).onfinish = () => e.remove();
}

// Riffle shuffle: the two halves of the deck split, interleave twice, then square up.
export function shuffle(deck) {
  if (calm) return;
  [...deck.children].forEach((half, i) => {
    const d = i ? 1 : -1;
    half.animate([
      { translate: '0 0', rotate: '0deg' },
      { translate: `${d * 1.8}em -.2em`, rotate: `${d * 12}deg`, offset: 0.18 },
      { translate: `${d * 0.25}em 0`, rotate: `${d * 2}deg`, offset: 0.42 },
      { translate: `${d * 1.7}em -.2em`, rotate: `${d * 11}deg`, offset: 0.58 },
      { translate: '0 0', rotate: '0deg', offset: 0.84 },
      { translate: '0 .14em', rotate: '0deg', offset: 0.92 },
      { translate: '0 0', rotate: '0deg' },
    ], { duration: 780, easing: 'ease-in-out' });
  });
}

// Chips tumbling down the whole screen.
export function chipRain(n = 40) {
  if (calm) return;
  const w = innerWidth, hgt = innerHeight;
  for (let i = 0; i < n; i++) {
    const c = spawn('chipfx c' + (i % 3));
    const x = rnd(0, w), drift = rnd(-0.08, 0.08) * w, size = rnd(0.9, 1.7);
    c.animate([
      { transform: `translate(${x}px, ${-0.1 * hgt}px) scale(${size}) rotate(0deg)` },
      { transform: `translate(${x + drift}px, ${1.1 * hgt}px) scale(${size}) rotate(${rnd(-540, 540)}deg)` },
    ], { duration: rnd(1100, 2100), delay: rnd(0, 1100), easing: 'cubic-bezier(.4, 0, .9, .6)', fill: 'both' }).onfinish = () => c.remove();
  }
}

// Named haptic patterns, so each kind of moment feels different in the hand.
// Each step is [strong motor, weak motor, ms, pause after]. Falls back to the phone's
// vibration motor where there is no controller rumble (not available in iOS Safari).
const PATTERNS = {
  deal: [[0, 0.5, 25]],
  nudge: [[0, 0.25, 30]],
  turn: [[0.2, 0.6, 60, 60], [0.2, 0.6, 60]],
  check: [[0.5, 0, 30, 70], [0.5, 0, 30]],
  call: [[0.3, 0.5, 70]],
  raise: [[0.5, 0.7, 90, 40], [0.3, 0.9, 60]],
  fold: [[0, 0.3, 90]],
  allin: [[0.3, 0.3, 140, 40], [0.5, 0.5, 140, 40], [1, 1, 380]],
  win1: [[0.3, 0.8, 80, 60], [0.5, 1, 140]],
  win3: [[0.4, 0.8, 80, 50], [0.6, 1, 100, 50], [1, 1, 400]],
  lose: [[0.7, 0, 300]],
  slam: [[1, 1, 260]],
  blinds: [[0, 0.6, 50, 80], [0, 0.6, 50, 80], [0, 0.8, 90]],
};
export function haptic(name) {
  const steps = PATTERNS[name];
  if (!steps || !rumbleOn) return;
  const pads = [...(navigator.getGamepads?.() ?? [])].some((gp) => gp?.vibrationActuator);
  if (!pads) { try { navigator.vibrate?.(steps.flatMap(([, , ms, gap = 0]) => [ms, gap])); } catch { /* unsupported */ } return; }
  let t = 0;
  for (const [strong, weak, ms, gap = 0] of steps) {
    setTimeout(() => rumble(strong, weak, ms), t);
    t += ms + gap;
  }
}

// A sticker slapped onto the top of the screen when an achievement is earned.
export function sticker(icon, name, text, kind = 0) {
  const e = spawn('stickerfx', `<b class="k${kind}">${icon}</b><span><i>Sticker earned</i>${name}<small>${text}</small></span>`);
  const at = 'translate(50vw, 1.2rem) translateX(-50%)';
  e.animate([
    { transform: `${at} translateY(-140%) rotate(-6deg)`, opacity: 0 },
    { transform: `${at} translateY(0) rotate(-1.5deg)`, opacity: 1, offset: 0.1, easing: SPRING },
    { transform: `${at} translateY(0) rotate(-1.5deg)`, opacity: 1, offset: 0.88 },
    { transform: `${at} translateY(-140%) rotate(3deg)`, opacity: 0 },
  ], { duration: 3400 }).onfinish = () => e.remove();
}
