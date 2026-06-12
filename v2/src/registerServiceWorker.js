export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  if (import.meta.env.DEV) {
    navigator.serviceWorker.getRegistrations()
      .then((registrations) => {
        registrations
          .filter((registration) => registration.scope.includes(import.meta.env.BASE_URL))
          .forEach((registration) => registration.unregister());
      })
      .catch(() => {});

    if ("caches" in window) {
      caches.keys()
        .then((cacheNames) => {
          cacheNames
            .filter((cacheName) => cacheName.startsWith("walk-up-announcer-"))
            .forEach((cacheName) => caches.delete(cacheName));
        })
        .catch(() => {});
    }

    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}
