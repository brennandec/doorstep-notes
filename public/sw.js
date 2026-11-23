// Service worker for the installable shell. It caches only the files on the
// allowed list below, which the build writes in. It never touches IndexedDB,
// never answers the offline probe, and ignores every other request.
const ALLOWED = /*ALLOWED_LIST*/[];
const CACHE = "doorstep-__CACHE_VERSION__";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ALLOWED)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const NAVIGATE_TIMEOUT_MS = 3000;

function cachedShell() {
  return caches
    .match("/index.html")
    .then((hit) => hit || caches.match("/"))
    .then((hit) => hit || Response.error());
}

function isShellRequestPath(url) {
  const scopePath = new URL(self.registration?.scope || "/", self.location.origin).pathname;
  const base = scopePath.endsWith("/") ? scopePath : `${scopePath}/`;
  if (!url.pathname.startsWith(base)) return false;
  const rel = url.pathname.slice(base.length);
  return rel === "" || rel === "index.html";
}

function isCacheableShellResponse(response) {
  if (!response || response.ok !== true || response.redirected !== false) return false;
  const contentType = response.headers?.get("content-type") ?? "";
  return contentType.split(";")[0].trim().toLowerCase() === "text/html";
}

function fetchWithTimeout(request, ms) {
  const controller = new AbortController();
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      controller.abort();
      resolve(null);
    }, ms);
    Promise.resolve()
      .then(() => fetch(request, { signal: controller.signal }))
      .then(
        (response) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(response);
        },
        (err) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(err);
        },
      );
  });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Other origins (including Firebase and Google domains) are never handled here.
  if (url.origin !== self.location.origin) return;
  // The offline probe always goes to the network.
  if (url.pathname === "/probe.txt") return;
  // The notices file is a page of its own: a link to it must not be answered with the app.
  if (request.mode === "navigate" && url.pathname === "/THIRD-PARTY-NOTICES.txt" && ALLOWED.includes(url.pathname)) {
    event.respondWith(caches.match(request).then((hit) => hit || fetch(request)));
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(
      fetchWithTimeout(request, NAVIGATE_TIMEOUT_MS)
        .then((response) => {
          if (!response) return cachedShell();
          if (isShellRequestPath(url) && isCacheableShellResponse(response)) {
            const copy = response.clone();
            event.waitUntil(caches.open(CACHE).then((cache) => cache.put("/index.html", copy)));
          }
          return response;
        })
        .catch(() => cachedShell()),
    );
    return;
  }
  if (!ALLOWED.includes(url.pathname)) return;
  event.respondWith(caches.match(request).then((hit) => hit || fetch(request)));
});
