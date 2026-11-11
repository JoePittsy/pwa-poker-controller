import * as audio from './audio.js';
import { onButton } from './controls.js';
import { startInput } from './input.js';
import { pauseMenu, startScreen } from './menus.js';
import { joinOnline, netOn, sendUp } from './online.js';
import { applyPrefs, ui } from './prefs.js';
import { dailyCard, runCard } from './results.js';
import { toast } from './squeeze.js';
import { S } from './state.js';
import { toggleEmotes } from './talk.js';
import { $ } from './util.js';
import './config.js';
import './perks.js';
import './util.js';
import './daily.js';
import './quick.js';
import './pass.js';
import './online.js';
import './menus.js';
import './core.js';
import './prefs.js';
import './render.js';
import './throw.js';
import './squeeze.js';
import './turn.js';
import './review.js';
import './replay.js';
import './controls.js';
import './effects.js';
import './results.js';
import './notebook.js';
import './achievements.js';
import './stats.js';
import './character.js';
import './talk.js';
import './loop.js';
import './version.js';

// ---------- boot ----------
$('talk-btn').onclick = () => { audio.unlock(); if (!S.overlay) toggleEmotes(); };
$('menu-btn').onclick = () => { audio.unlock(); if (!S.overlay && S.game) pauseMenu(); };
for (const ev of ['pointerdown', 'touchend', 'keydown']) addEventListener(ev, () => audio.unlock(), { capture: true, passive: true });
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault()); // iOS pinch-zoom
startInput(onButton, (on) => {
  document.body.classList.toggle('gp', on);
  toast(on ? 'Controller connected' : 'Controller disconnected');
});
addEventListener('pagehide', () => { if (netOn('guest')) sendUp({ t: 'leave' }); }); // closing the tab frees your seat's clock
applyPrefs();
startScreen();
{ // opened from a shared link: go straight to that room
  const join = new URLSearchParams(location.search).get('join');
  if (join) { window.history.replaceState(null, '', location.pathname); joinOnline(join); } // window.history: plain 'history' is the hand list here
}
if (['localhost', '127.0.0.1'].includes(location.hostname)) /** @type {any} */ (window).__poker = { get game() { return S.game; }, ui, runCard, dailyCard }; // a handle for tests only: not on the live site, where it would let a host read the table from the console

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
