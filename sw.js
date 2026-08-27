/* Arbiter Hub — service worker
   Стратегія: network-first для сторінки, cache-first для іконок.
   Firebase не кешуємо взагалі — синхронізація має йти в мережу. */

var CACHE = 'arbiter-hub-v3';
var SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(SHELL); })
      .catch(function () { /* якщо якийсь файл відсутній — не блокуємо встановлення */ })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;

  if (req.method !== 'GET') return;

  var url = new URL(req.url);

  // Firebase і будь-які сторонні API — тільки мережа, без кешу
  if (url.hostname.indexOf('firebase') !== -1 ||
      url.hostname.indexOf('gstatic') !== -1 ||
      url.hostname.indexOf('firebaseio') !== -1) {
    return;
  }

  // навігація: спершу мережа, при збої — кеш
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(function (res) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put('./index.html', copy); });
          return res;
        })
        .catch(function () {
          return caches.match('./index.html').then(function (r) {
            return r || new Response('Немає зв\'язку', { status: 503 });
          });
        })
    );
    return;
  }

  // решта своїх файлів: спершу кеш
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req).then(function (hit) {
        return hit || fetch(req).then(function (res) {
          if (res && res.status === 200) {
            var copy = res.clone();
            caches.open(CACHE).then(function (c) { c.put(req, copy); });
          }
          return res;
        });
      }).catch(function () {
        return new Response('', { status: 504 });
      })
    );
  }
});
