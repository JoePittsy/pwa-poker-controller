import { ui } from './prefs.js';
import { S } from './state.js';

// ---------- new-version check ----------
// The deploy writes the commit id to version.txt. If it changes while we're open,
// reload at the next safe moment (title screen, or between hands).
/* version: see state.js */
/* stale: see state.js */
export async function checkVersion() {
  try {
    const r = await fetch('version.txt', { cache: 'no-store' });
    if (!r.ok) return;
    const v = (await r.text()).trim();
    if (S.version === null) S.version = v;
    else if (v !== S.version) {
      S.stale = true;
      if (!S.game || ui.mode === 'continue' || (S.overlay && !S.overlay.closable)) location.reload();
    }
  } catch { /* offline */ }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkVersion(); });
addEventListener('pageshow', (e) => { if (e.persisted) checkVersion(); });
checkVersion();
