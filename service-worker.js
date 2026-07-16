const CACHE_NAME = "pixel-air-hockey-v1-5";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css?v=1.5",
  "./auth.css?v=1.5",
  "./auth.js?v=1.5",
  "./game.js?v=1.5",
  "./manifest.json",
  "./icon.svg"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  event.respondWith(caches.match(event.request).then(response => response || fetch(event.request)));
});
