const CACHE = "voxelpad-shell-v1.0.1";
const SHELL = [
  "./index.html", "./app.css", "./app.js", "./client.js", "./app.webmanifest",
  "./assets/rift.webp", "./assets/rift-small.webp", "./assets/chakra.woff2", "./assets/manrope.woff2",
  "./assets/icon.svg", "./assets/icon-192.png", "./assets/icon-512.png",
];
const urls = new Set(SHELL.map(path => new URL(path, self.registration.scope).href));

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith("voxelpad-shell-") && key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  url.search = "";
  url.hash = "";
  if (!urls.has(url.href) && !(request.mode === "navigate" && url.href === self.registration.scope)) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.open(CACHE).then(cache => cache.match(new URL("./index.html", self.registration.scope)))));
  } else {
    event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(url.href)) || fetch(request)));
  }
});
