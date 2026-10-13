/**
 * Service Worker for Helha Store (حِلها) PWA
 * Caches essential shell assets and enables WebAPK installation on Android
 */

const CACHE_NAME = "helha-pwa-v2";

const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./product.html",
  "./deals.html",
  "./track.html",
  "./support.html",
  "./contact.html",
  "./return-policy.html",
  "./shipping.html",
  "./admin.html",
  "./css/style.css",
  "./css/pages.css",
  "./css/product.css",
  "./css/admin.css",
  "./js/app.js",
  "./js/product.js",
  "./js/firebase-config.js",
  "./js/telegram.js",
  "./manifest.json",
  "./assets/logo.jpg",
  "./assets/banner.jpg",
  "./assets/icon-192.png",
  "./assets/icon-512.png"
];

// Install: Cache core assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn("Some assets failed to cache:", err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate: Clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Network First with cache fallback
self.addEventListener("fetch", (event) => {
  // Only handle GET requests
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Skip Firebase Realtime Database and Cloudflare Worker / external APIs
  if (
    url.hostname.includes("firebaseio.com") ||
    url.hostname.includes("workers.dev") ||
    url.hostname.includes("telegram.org") ||
    url.hostname.includes("r2.dev")
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // If valid response, update cache for static assets
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === "basic") {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Offline fallback to cache
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // If HTML request failed, return index.html
          if (event.request.headers.get("accept")?.includes("text/html")) {
            return caches.match("./index.html");
          }
        });
      })
  );
});
