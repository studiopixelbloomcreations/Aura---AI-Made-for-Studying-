const STATIC_CACHE = "aevra-static-glass-v1";
const API_CACHE = "aevra-api-v1";
const STATIC_ASSETS = [
  "./",
  "index.html",
  "app.html",
  "login.html",
  "signup.html",
  "styles.css",
  "auth.css",
  "landing.css",
  "api.js",
  "auth.js",
  "chat.js",
  "script.js",
  "voice_multimodal_ui.js",
  "personal_intelligence_ui.js",
  "public/vais/session_manager.js",
  "public/vais/audio_engine.js",
  "public/vais/voice_embedding_engine.js",
  "public/vais/voice_match_engine.js",
  "public/vais/confidence_engine.js",
  "public/vais/onboarding_engine.js",
  "public/vais/wakeword_engine.js",
  "public/vais/identity_engine.js",
  "public/vais/ai_router.js",
  "public/vais/vais_controller.js",
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
