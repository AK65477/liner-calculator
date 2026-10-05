// Offline: every app file is stored on the phone at first visit, then served from there.
// A new release installs in the background and waits; the page applies it only from the
// first screen (never in the middle of a measurement). Bump VERSION with the ?v= numbers.
const VERSION = 'v14';
const CACHE = `field-app-${VERSION}`;
const FILES = [
  './', './index.html', './method.html', './manifest.webmanifest',
  './style.css?v=14', './app.js?v=14', './calc.js?v=14', './store.js?v=14',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('field-app-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('message', event => { if (event.data === 'apply-update') self.skipWaiting(); });

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
  // Pages (with any ?query) open from the stored copy, so the app starts without signal.
  if (request.mode === 'navigate') {
    const page = new URL(request.url).pathname.endsWith('method.html') ? './method.html' : './index.html';
    event.respondWith(caches.match(page, { cacheName: CACHE }).then(hit => hit || fetch(request)));
    return;
  }
  event.respondWith(caches.match(request, { cacheName: CACHE }).then(hit => hit || fetch(request)));
});
