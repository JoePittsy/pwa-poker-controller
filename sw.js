// Network-first with cache fallback: always fresh when online, fully playable offline.
// 'no-cache' makes the browser revalidate with the server instead of trusting its own HTTP cache.
const CACHE = 'pad-poker-v56';
const ASSETS = ['./', 'index.html', 'css/style.css', 'manifest.webmanifest',
  'js/main.js', 'js/engine.js', 'js/cards.js', 'js/ai.js', 'js/input.js', 'js/audio.js', 'js/music.js', 'js/fx.js', 'js/banter.js', 'js/faces.js', 'js/stickers.js', 'js/share.js', 'js/net.js',
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
