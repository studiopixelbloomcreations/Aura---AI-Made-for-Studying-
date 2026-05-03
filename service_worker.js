const STATIC_CACHE = "aevra-static-v2";
const API_CACHE = "aevra-api-v1";
const STATIC_ASSETS = [
  "./",
  "index.html",
  "app.html",
  "login.html",
  "signup.html",
  "styles/main.css",
  "styles/chat.css",
  "styles/sidebar.css",
  "styles/mobile.css",
  "styles/animations.css",
  "js/app_controller.js",
  "js/ui_chat.js",
  "js/ui_sidebar.js",
  "js/ui_voice.js",
  "js/ui_exam.js",
  "js/ui_gamification.js",
  "js/ui_settings.js",
  "js/theme.js",
  "core/logger.js",
  "core/state_manager.js",
  "assets/logo_aevra.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => ![STATIC_CACHE, API_CACHE].includes(key)).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin === location.origin && ["/personal-intelligence/config", "/progress", "/memory/graph"].some((path) => url.pathname.startsWith(path))) {
    event.respondWith(networkFirst(request));
    return;
  }
  event.respondWith(cacheFirst(request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    return caches.match("app.html");
  }
}

async function networkFirst(request) {
  const cache = await caches.open(API_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    return cached || new Response(JSON.stringify({ success: false, data: null, error: "Offline. Showing cached data when available." }), { headers: { "content-type": "application/json" } });
  }
}
