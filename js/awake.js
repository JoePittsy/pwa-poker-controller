// Keeps the screen on while a game is being played, where the browser allows it. A phone that
// dims and locks drops out of an online game, so this prevents most disconnections.
let lock = null, wanted = false;
async function take() {
  if (!wanted || lock || document.hidden || !('wakeLock' in navigator)) return;
  try { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); } catch { /* refused: low battery, or not allowed */ }
}
export function keepAwake(on) {
  wanted = on;
  if (on) take(); else { lock?.release().catch(() => {}); lock = null; }
}
document.addEventListener('visibilitychange', take); // the lock is dropped whenever the page is hidden
