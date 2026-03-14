(function () {
  let configPromise = null;
  let initPromise = null;

  function readInlineConfig() {
    if (window.__FIREBASE_CONFIG__ && typeof window.__FIREBASE_CONFIG__ === "object") {
      return window.__FIREBASE_CONFIG__;
    }
    return null;
  }

  async function loadConfig() {
    if (configPromise) return configPromise;
    configPromise = (async function () {
      const existing = readInlineConfig();
      if (existing) return existing;
      if (window.__OFFLINE_MODE__ === true || navigator.onLine === false) {
        console.warn("[FirebaseConfig] offline mode enabled");
        return null;
      }

      try {
        const response = await fetch("/public-config", {
          method: "GET",
          headers: { Accept: "application/json" },
          credentials: "same-origin",
          cache: "no-store"
        });
        if (!response.ok) {
          console.warn("[FirebaseConfig] public-config missing:", response.status);
          const stub = { apiKey: "test", authDomain: "test", projectId: "test" };
          window.__FIREBASE_CONFIG__ = stub;
          return stub;
        }
        const payload = await response.json();
        if (!payload || !payload.ok || !payload.firebase) {
          console.warn("[FirebaseConfig] invalid payload");
          const stub = { apiKey: "test", authDomain: "test", projectId: "test" };
          window.__FIREBASE_CONFIG__ = stub;
          return stub;
        }
        window.__FIREBASE_CONFIG__ = payload.firebase;
        return payload.firebase;
      } catch (err) {
        console.warn("[FirebaseConfig] fallback to local stub");
        const stub = { apiKey: "test", authDomain: "test", projectId: "test" };
        window.__FIREBASE_CONFIG__ = stub;
        return stub;
      }
    })();
    return configPromise;
  }

  async function ensureInitialized() {
    if (initPromise) return initPromise;
    initPromise = (async function () {
      const config = await loadConfig();
      if (!config || !window.firebase) {
        return { firebase: window.firebase || null, auth: null, config: config || null, skipped: true };
      }
      if (!firebase.apps || !firebase.apps.length) {
        firebase.initializeApp(config);
      }
      const auth = firebase.auth ? firebase.auth() : null;
      if (auth) window.auth = auth;
      return { firebase: window.firebase, auth: auth, config: config };
    })();
    return initPromise;
  }

  function getFirebase() {
    return window.firebase || null;
  }

  function getAuth() {
    if (window.auth) return window.auth;
    if (window.firebase && window.firebase.auth && window.firebase.apps && window.firebase.apps.length) {
      window.auth = window.firebase.auth();
      return window.auth;
    }
    return null;
  }

  window.FirebaseRuntimeConfig = {
    loadConfig: loadConfig,
    ensureInitialized: ensureInitialized,
    getFirebase: getFirebase,
    getAuth: getAuth
  };
})();
