// キャッシュするのは、ここに列挙したアプリ本体のファイルだけ。
// 旅行データ(IndexedDB)や、取り込んだJSONは一切キャッシュしない。
const CACHE = 'tabiplan-v4';
const FILES = [
  './', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './css/app.css',
  './js/main.js', './js/state.js', './js/db.js', './js/model.js', './js/views.js', './js/forms.js',
  './js/ui.js', './js/io.js', './js/nav.js', './js/transit.js', './js/color.js', './js/emoji.js', './js/backgrounds.js', './js/icons.js', './js/syncCrypto.js', './js/merge.js', './js/syncCore.js', './js/sync.js', './js/util.js',
];
const ALLOW = new Set(FILES.map((f) => new URL(f, self.location).pathname));

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

// 通信できるときは最新を取りに行き、オフラインのときだけキャッシュを使う
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin || !ALLOW.has(url.pathname)) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request)),
  );
});
