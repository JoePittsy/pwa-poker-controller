// The screens for backing up and restoring (see backup.js for what a backup is).
import { applyBackup, makeBackup, readBackup } from './backup.js';
import { showOverlay } from './menus.js';
import { toast } from './squeeze.js';
import { $, glyph } from './util.js';

export function backupMenu(back) {
  const again = () => backupMenu(back);
  showOverlay({
    title: 'Back <span>up</span>', closable: true, onClose: back,
    body: '<p>Your runs, stats, stickers, notebook and settings are kept only on this device. A backup is a line of text holding all of it.</p><p>Keep it somewhere safe, or use it to move to another phone: restore it there and carry on.</p>',
    items: [
      [`${glyph('A')}Copy backup`, async () => {
        try { await navigator.clipboard.writeText(makeBackup(localStorage)); toast('Backup copied. Paste it somewhere safe.'); } catch { showCode(again); }
      }, true],
      ['Share as a file', async () => {
        const file = new File([makeBackup(localStorage)], `pokerpad-backup-${new Date().toISOString().slice(0, 10)}.txt`, { type: 'text/plain' });
        try {
          if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'PokerPad backup' });
          else { const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }
        } catch { /* the share sheet was closed */ }
      }, true],
      ['Restore', () => restoreEntry(again)],
      [`${glyph('B')}Back`, back],
    ],
  });
}
// Copying can be refused by the browser: show the text to select by hand instead.
function showCode(back) {
  showOverlay({
    title: 'Your <span>backup</span>', closable: true, onClose: back,
    body: '<p>Select all of this and copy it.</p><textarea id="backup-out" class="namein backupbox" readonly></textarea>',
    items: [[`${glyph('B')}Back`, back]],
  });
  const el = $('backup-out');
  el.value = makeBackup(localStorage);
  el.onkeydown = (e) => e.stopPropagation();
  el.onfocus = () => el.select();
}
function restoreEntry(back) {
  showOverlay({
    title: 'Restore', closable: true, onClose: back,
    body: '<p>Paste a backup here. It <b>replaces</b> everything on this device: runs, stats, stickers, notebook and settings.</p><textarea id="backup-in" class="namein backupbox" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Paste your backup"></textarea>',
    items: [
      [`${glyph('A')}Restore`, () => {
        let b;
        try { b = readBackup($('backup-in').value); } catch (e) { toast(e.message); return; }
        const when = b.at ? new Date(b.at).toLocaleDateString() : 'an unknown date';
        showOverlay({
          title: 'Replace <span>everything?</span>',
          body: `<p>This backup is from <b>${when}</b>. Restoring it replaces what is on this device now and cannot be undone.</p>`,
          items: [['Cancel', back], ['Replace and restart', () => { applyBackup(localStorage, b); location.reload(); }]],
        });
      }, true],
      [`${glyph('B')}Back`, back],
    ],
  });
  const el = $('backup-in');
  el.onkeydown = (e) => e.stopPropagation(); // typing must not drive the menu
  setTimeout(() => el.focus(), 50);
}
