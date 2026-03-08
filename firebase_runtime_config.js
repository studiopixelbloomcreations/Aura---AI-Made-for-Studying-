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

      const response = await fetch("/public-config", {
        method: "GET",
        headers: { Accept: "application/json" },
        credentials: "same-origin",
        cache: "no-store"
      });
      if (!response.ok) {
        throw new Error("PUBLIC_CONFIG_HTTP_" + response.status);
      }
      const payload = await response.json();
      if (!payload || !payload.ok || !payload.firebase) {
        throw new Error("PUBLIC_CONFIG_INVALID");
      }
      window.__FIREBASE_CONFIG__ = payload.firebase;
      return payload.firebase;
    })();
    return configPromise;
  }

  async function ensureInitialized() {
    if (initPromise) return initPromise;
    initPromise = (async function () {
      const config = await loadConfig();
      if (!window.firebase) throw new Error("FIREBASE_SDK_MISSING");
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
