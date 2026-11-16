// Работа без интернета: сначала свежая версия из сети, если сети нет — сохранённая копия.
const CACHE = 'sprint-v4';
const FILES = ['./', 'index.html', 'sync.js', 'manifest.json', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil(caches.keys()
  .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
  .then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith('http')) return;
  const own = new URL(e.request.url).origin === self.location.origin;
  e.respondWith(fetch(own ? new Request(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }) : e.request)
    .then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {}); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
