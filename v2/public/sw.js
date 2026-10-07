const CACHE_NAME = "walk-up-announcer-v136";
const APP_SHELL_URLS = [
  "/walk-up-announcer/",
  "/walk-up-announcer/index.html",
  "/walk-up-announcer/assets/fonts/Lobster-Regular.ttf",
];

async function trimOldCaches() {
  const names = await caches.keys();
  await Promise.all(names.filter((name) => name.startsWith("walk-up-announcer-") && name !== CACHE_NAME)
    .map((name) => caches.delete(name)));
}

async function cacheUrls(urls = [], port = null) {
  const cache = await caches.open(CACHE_NAME);
  const uniqueUrls = [...new Set(urls.filter(Boolean))];
  let cachedCount = 0;
  let failedCount = 0;
  let nextIndex = 0;
  const progress = () => port?.postMessage({ type: "CACHE_URLS_PROGRESS",
    cachedCount, failedCount, totalCount: uniqueUrls.length });
  progress();
  // Avoid saturating Safari with the entire library at once.
  await Promise.all(Array.from({ length: Math.min(4, uniqueUrls.length) }, async () => {
    while (nextIndex < uniqueUrls.length) {
      const url = uniqueUrls[nextIndex++];
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const request = new Request(url, { cache: "reload", signal: controller.signal });
        const cached = await cache.match(request);
        // Offline walkups must not re-fetch clips already stored in full.
        if (cached?.status !== 200) {
          const response = await fetch(request);
          if (response.status !== 200) throw new Error(`Unable to cache ${url}`);
          await cache.put(request, response);
        }
        cachedCount += 1;
      } catch {
        failedCount += 1;
      } finally {
        clearTimeout(timeout);
        progress();
      }
    }
  }));
  return { cachedCount, failedCount, totalCount: uniqueUrls.length };
}

async function rangeResponse(request, response) {
  const range = request.headers.get("Range");
  if (!range) return response;
  const blob = await response.blob();
  const match = /^bytes=(\d*)-(\d*)$/i.exec(range.trim());
  let start;
  let end;
  if (match && (match[1] || match[2])) {
    if (!match[1]) {
      const suffix = Number(match[2]);
      start = Math.max(0, blob.size - suffix);
      end = blob.size - 1;
      if (suffix === 0) start = blob.size;
    } else {
      start = Number(match[1]);
      end = match[2] ? Math.min(Number(match[2]), blob.size - 1) : blob.size - 1;
    }
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
      start < 0 || start >= blob.size || end < start) {
    return new Response(null, { status: 416, headers: {
      "Content-Range": `bytes */${blob.size}`, "Accept-Ranges": "bytes",
    } });
  }
  const headers = new Headers(response.headers);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Content-Range", `bytes ${start}-${end}/${blob.size}`);
  headers.set("Content-Length", String(end - start + 1));
  headers.delete("Content-Encoding");
  return new Response(blob.slice(start, end + 1), {
    status: 206, statusText: "Partial Content", headers,
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME)
    .then((cache) => cache.addAll(APP_SHELL_URLS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(trimOldCaches().then(() => self.clients.claim()));
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "CACHE_URLS") return;
  event.waitUntil(cacheUrls(event.data.urls, event.ports?.[0]).then((result) => {
    event.ports?.[0]?.postMessage({ type: "CACHE_URLS_COMPLETE", ...result });
  }).catch(() => {
    event.ports?.[0]?.postMessage({ type: "CACHE_URLS_COMPLETE", cachedCount: 0,
      failedCount: event.data.urls?.length ?? 1, totalCount: event.data.urls?.length ?? 1 });
  }));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin ||
      !url.pathname.startsWith("/walk-up-announcer/")) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    if (request.mode === "navigate") {
      try {
        const response = await fetch(request);
        if (response.ok) {
          try { await cache.put("/walk-up-announcer/index.html", response.clone()); }
          catch { /* A storage failure must not block the online app. */ }
        }
        return response;
      } catch {
        return await cache.match("/walk-up-announcer/index.html") || Response.error();
      }
    }
    const cached = await cache.match(request);
    if (cached?.status === 200) return rangeResponse(request, cached);
    const response = await fetch(request);
    // Safari streams 206 responses. Cache Storage cannot store partial bodies.
    if (response.status === 200) {
      try { await cache.put(request, response.clone()); }
      catch { /* Keep playing even if the device's cache is full. */ }
    }
    return response;
  })());
});
