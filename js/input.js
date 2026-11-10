// Unifies gamepad (standard mapping, polled — works in iOS Safari once a button
// has been pressed) and keyboard into semantic button events.
const PAD = { 0: 'a', 1: 'b', 2: 'x', 3: 'y', 4: 'lb', 5: 'rb', 9: 'start', 12: 'up', 13: 'down', 14: 'left', 15: 'right' };
const KEYS = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  Enter: 'a', ' ': 'a', Escape: 'b', Backspace: 'b', f: 'b', c: 'x', x: 'x', r: 'y', y: 'y',
  q: 'lb', e: 'rb', p: 'start', m: 'start',
};
const REPEATS = new Set(['up', 'down', 'left', 'right']);
const FIRST = 380, NEXT = 90;

// How hard "up" is being held right now, 0..1: either stick, the D-pad, or the up arrow.
// Used for analogue gestures such as squeezing your cards.
let upKey = false;
addEventListener('keydown', (e) => { if (e.key === 'ArrowUp') upKey = true; });
addEventListener('keyup', (e) => { if (e.key === 'ArrowUp') upKey = false; });
addEventListener('blur', () => { upKey = false; });
export function upAmount() {
  let v = upKey ? 1 : 0;
  for (const gp of navigator.getGamepads?.() ?? []) {
    if (!gp) continue;
    if (gp.buttons[12]?.pressed) v = 1;
    for (const ax of [gp.axes[1], gp.axes[3]]) if (ax < -0.15) v = Math.max(v, Math.min(1, (-ax - 0.15) / 0.75));
  }
  return v;
}

export function startInput(onButton, onConnection) {
  const held = new Map(); // button -> time of next auto-repeat
  let connected = false;

  function poll(now) {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    if ((pads.length > 0) !== connected) { connected = pads.length > 0; onConnection?.(connected); }
    const down = new Set();
    for (const gp of pads) {
      gp.buttons.forEach((b, i) => { if (PAD[i] && (b.pressed || b.value > 0.5)) down.add(PAD[i]); });
      const [ax = 0, ay = 0] = gp.axes;
      if (ax < -0.6) down.add('left'); else if (ax > 0.6) down.add('right');
      if (ay < -0.6) down.add('up'); else if (ay > 0.6) down.add('down');
    }
    for (const b of down) {
      if (!held.has(b)) { held.set(b, now + FIRST); onButton(b); }
      else if (REPEATS.has(b) && now >= held.get(b)) { held.set(b, now + NEXT); onButton(b); }
    }
    for (const b of [...held.keys()]) if (!down.has(b)) held.delete(b);
    requestAnimationFrame(poll);
  }
  requestAnimationFrame(poll);
  addEventListener('gamepadconnected', () => {}); // some browsers only expose pads once a listener exists

  addEventListener('keydown', (ev) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const b = KEYS[ev.key.length === 1 ? ev.key.toLowerCase() : ev.key];
    if (!b) return;
    ev.preventDefault();
    if (ev.repeat && !REPEATS.has(b)) return;
    onButton(b);
  });
}
