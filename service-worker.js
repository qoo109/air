const CACHE_NAME = "bubble-island-air-hockey-v2-3";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css?v=2.3",
  "./guest.css?v=2.3",
  "./fullscreen.js?v=2.3",
  "./auth.js?v=2.1",
  "./game.js?v=2.0",
  "./manifest.json",
  "./icon.svg"
];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener("fetch", event => {
  event.respondWith(caches.match(event.request).then(response => response || fetch(event.request)));
});