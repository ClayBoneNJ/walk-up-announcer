const CACHE_NAME = "walk-up-announcer-v70";
const APP_SHELL_URLS = [
  "/walk-up-announcer/",
  "/walk-up-announcer/index.html",
];

async function trimOldCaches() {
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames
      .filter((cacheName) => cacheName.startsWith("walk-up-announcer-") && cacheName !== CACHE_NAME)
      .map((cacheName) => caches.delete(cacheName)),
  );
}

async function cacheUrls(urls = [], progressPort = null) {
  const cache = await caches.open(CACHE_NAME);
  const uniqueUrls = [...new Set(urls.filter(Boolean))];
  let cachedCount = 0;
  let failedCount = 0;

  progressPort?.postMessage({
    type: "CACHE_URLS_PROGRESS",
    cachedCount,
    failedCount,
    totalCount: uniqueUrls.length,
  });

  await Promise.all(
    uniqueUrls.map(async (url) => {
      const request = new Request(url, { cache: "reload" });

      try {
        const response = await fetch(request);

        if (!response.ok) {
          throw new Error(`Unable to cache ${url}`);
        }

        await cache.put(request, response.clone());
        cachedCount += 1;
      } catch {
        failedCount += 1;
      }

      progressPort?.postMessage({
        type: "CACHE_URLS_PROGRESS",
        cachedCount,
        failedCount,
        totalCount: uniqueUrls.length,
      });
    }),
  );

  return {
    cachedCount,
    failedCount,
    totalCount: uniqueUrls.length,
  };
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(trimOldCaches().then(() => self.clients.claim()));
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "CACHE_URLS") {
    return;
  }

  event.waitUntil(
    cacheUrls(event.data.urls, event.ports?.[0]).then((result) => {
      event.ports?.[0]?.postMessage({
        type: "CACHE_URLS_COMPLETE",
        ...result,
      });
    }).catch(() => {
      event.ports?.[0]?.postMessage({
        type: "CACHE_URLS_COMPLETE",
        cachedCount: 0,
        failedCount: event.data.urls?.length ?? 1,
        totalCount: event.data.urls?.length ?? 1,
      });
    }),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("/walk-up-announcer/index.html", copy));
          return response;
        })
        .catch(() => caches.match("/walk-up-announcer/index.html")),
    );
    return;
  }

  if (!requestUrl.pathname.startsWith("/walk-up-announcer/")) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request).then((response) => {
        if (!response.ok) {
          return response;
        }

        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      });
    }),
  );
});
