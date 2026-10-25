// Offline: keep the app's own files in a cache and serve them first; the API always goes to the network.
const CACHE = "jetdose-v2";
const FILES = ["/", "/index.html", "/css/style.css", "/js/app.js", "/js/planner.js", "/js/parser.js", "/js/tz.js", "/js/ics.js", "/icon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.pathname.startsWith("/api/")) return;
  if (url.origin === location.origin) {
    // Network first so updates show up, cache when offline.
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match(event.request, { ignoreSearch: true }).then((r) => r || caches.match("/index.html")))
    );
  } else if (url.hostname.endsWith("fonts.googleapis.com") || url.hostname.endsWith("fonts.gstatic.com")) {
    event.respondWith(
      caches.match(event.request).then(
        (hit) =>
          hit ||
          fetch(event.request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(event.request, copy));
            return res;
          })
      )
    );
  }
});
