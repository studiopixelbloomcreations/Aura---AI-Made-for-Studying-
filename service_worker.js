const CACHE = "aevra-static-v1";
const ASSETS = ["./", "index.html", "app.html", "login.html", "signup.html", "styles/main.css", "styles/chat.css", "styles/sidebar.css", "styles/mobile.css", "styles/animations.css", "js/app_controller.js", "js/ui_chat.js", "js/ui_sidebar.js", "js/ui_voice.js", "js/ui_exam.js", "js/ui_gamification.js", "js/ui_settings.js", "js/theme.js", "assets/logo_aevra.svg"];
self.addEventListener("install", (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS))));
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match("app.html"))));
});
