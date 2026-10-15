/**
 * Service Worker for Helha Store (حِلها) PWA - v3
 * Fast, intelligent caching strategy:
 * - Cache-First with background revalidation for static assets (CSS, JS, Fonts, Images) => Zero Latency page switches.
 * - Network-First with cache fallback for HTML pages => Always fresh content with reliable offline fallback.
 */

const CACHE_NAME = "helha-pwa-v3";

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
  "./js/reviews.js",
  "./js/firebase-config.js",
  "./js/telegram.js",
  "./manifest.json",
  "./assets/logo.jpg",
  "./assets/banner.jpg",
  "./assets/banners/banner-main.jpg",
  "./assets/banners/banner-shipping.jpg",
  "./assets/banners/banner-cod.jpg",
  "./assets/banners/banner-support.jpg",
  "./assets/icon-192.png",
  "./assets/icon-512.png"
];

// Install: Pre-cache core shell assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn("Some assets failed to pre-cache:", err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate: Flush previous cache versions
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Smart Strategy based on request type
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Exclude Firebase Realtime DB, Cloudflare Workers, and external APIs
  if (
    url.hostname.includes("firebaseio.com") ||
    url.hostname.includes("workers.dev") ||
    url.hostname.includes("telegram.org") ||
    url.hostname.includes("r2.dev")
  ) {
    return;
  }

  const isHtml = event.request.headers.get("accept")?.includes("text/html");
  const isStatic = (
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".jpg") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".webp") ||
    url.pathname.endsWith(".ico") ||
    url.pathname.includes("/assets/") ||
    url.hostname.includes("fonts.gstatic.com") ||
    url.hostname.includes("fonts.googleapis.com")
  );

  // 1. Static Assets: Cache-First with Stale-While-Revalidate (Instant loading)
  if (isStatic) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        }).catch(() => null);

        return cached || fetchPromise;
      })
    );
    return;
  }

  // 2. HTML & Navigation: Network-First with Cache fallback (Freshness guaranteed)
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === "basic") {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          if (isHtml) return caches.match("./index.html");
        });
      })
  );
});
