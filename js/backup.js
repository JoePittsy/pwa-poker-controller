// Backup and restore. Everything the game remembers lives in this browser's storage, so clearing
// site data or reinstalling loses it. A backup is all of it as one line of text that can be copied,
// shared as a file, and pasted back in on this or another device.
const KEYS = ['prefs', 'audio', 'stats', 'stickers', 'notes', 'best', 'daily', 'save', 'seen']; // not the online seat or relay: those belong to one device and one game
const TAG = 'POKERPAD1:';
const enc = (s) => { const b = new TextEncoder().encode(s); let t = ''; for (const x of b) t += String.fromCharCode(x); return btoa(t); };
const dec = (s) => new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));

/** The backup text for whatever is in `store` (anything with getItem). */
export function makeBackup(store, now = Date.now()) {
  const data = {};
  for (const k of KEYS) { const v = store.getItem(`padpoker.${k}`); if (v !== null && v !== undefined) data[k] = v; }
  return TAG + enc(JSON.stringify({ at: now, data }));
}
/** Reads a backup. Returns { at, data } or throws with a message fit to show the player. */
export function readBackup(text) {
  const t = String(text || '').replace(/\s+/g, '');
  if (!t.startsWith(TAG)) throw new Error('That is not a PokerPad backup.');
  let got;
  try { got = JSON.parse(dec(t.slice(TAG.length))); } catch { throw new Error('That backup is damaged or incomplete.'); }
  if (!got || typeof got.data !== 'object' || !got.data) throw new Error('That backup is damaged or incomplete.');
  const data = {};
  for (const k of KEYS) {
    const v = got.data[k];
    if (v === undefined) continue;
    if (typeof v !== 'string' || v.length > 400000) throw new Error('That backup is damaged or incomplete.');
    if (k !== 'best' && k !== 'seen') { try { JSON.parse(v); } catch { throw new Error('That backup is damaged or incomplete.'); } }
    data[k] = v;
  }
  if (!Object.keys(data).length) throw new Error('That backup is empty.');
  return { at: Number(got.at) || 0, data };
}
/** Replaces what `store` holds with the backup's contents. Anything the backup lacks is removed. */
export function applyBackup(store, backup) {
  for (const k of KEYS) { if (k in backup.data) store.setItem(`padpoker.${k}`, backup.data[k]); else store.removeItem(`padpoker.${k}`); }
}
