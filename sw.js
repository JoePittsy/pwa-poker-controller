// Network-first with cache fallback: always fresh when online, fully playable offline.
// 'no-cache' makes the browser revalidate with the server instead of trusting its own HTTP cache.
const CACHE = 'pad-poker-v92';
const ASSETS = ['./', 'index.html', 'css/style.css', 'manifest.webmanifest',
  'js/achievements.js', 'js/ai.js', 'js/audio.js', 'js/awake.js', 'js/bank.js', 'js/backup.js', 'js/backupmenu.js', 'js/banter.js', 'js/build.js', 'js/coach.js', 'js/career.js', 'js/rank.js', 'js/cards.js', 'js/character.js', 'js/config.js', 'js/controls.js', 'js/core.js', 'js/daily.js', 'js/dailystats.js', 'js/effects.js', 'js/engine.js', 'js/faces.js', 'js/fx.js', 'js/handover.js', 'js/input.js', 'js/loop.js', 'js/main.js', 'js/menus.js', 'js/music.js', 'js/net.js', 'js/notebook.js', 'js/online.js', 'js/pass.js', 'js/perks.js', 'js/prefs.js', 'js/reads.js', 'js/render.js', 'js/replay.js', 'js/results.js', 'js/review.js', 'js/share.js', 'js/squeeze.js', 'js/standings.js', 'js/state.js', 'js/stats.js', 'js/stickers.js', 'js/tables.js', 'js/talk.js', 'js/throw.js', 'js/tip.js', 'js/trip.js', 'js/tripui.js', 'js/turn.js', 'js/util.js', 'js/venue.js', 'js/version.js',
  'fonts/bricolage.woff2', 'icons/icon.svg', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
