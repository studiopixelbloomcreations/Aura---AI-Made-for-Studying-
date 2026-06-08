/**
 * AURA AI — Firebase Config Loader
 *
 * Initializes Firebase exactly once using config from /api/public-config.
 * All auth pages MUST call FirebaseConfig.ensureInitialized() before using auth.
 *
 * Lifecycle:
 *   1. Page loads firebase-app-compat.js and firebase-auth-compat.js (via <script> tags)
 *   2. This script loads and starts fetching config
 *   3. Login/signup/auth scripts call FirebaseConfig.ensureInitialized()
 *   4. ensureInitialized() resolves only AFTER firebase.initializeApp() succeeds
 */
(function () {
  'use strict';

  var _configPromise = null;
  var _initPromise = null;

  /**
   * Fetch Firebase config from the Vercel API route.
   * Returns the config object or null on failure.
   */
  function loadConfig() {
    if (_configPromise) return _configPromise;

    _configPromise = fetch('/api/public-config', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    })
      .then(function (res) {
        if (!res.ok) {
          console.error('[FirebaseConfig] /api/public-config returned', res.status);
          return null;
        }
        return res.json();
      })
      .then(function (payload) {
        if (!payload || !payload.firebase) {
          console.error('[FirebaseConfig] invalid response payload');
          return null;
        }
        var cfg = payload.firebase;
        // Validate required fields
        if (!cfg.apiKey || !cfg.projectId) {
          console.error('[FirebaseConfig] firebase config incomplete (missing apiKey or projectId)');
          return null;
        }
        console.log('[FirebaseConfig] loaded config for project:', cfg.projectId);
        return cfg;
      })
      .catch(function (err) {
        console.error('[FirebaseConfig] failed to fetch config:', err);
        return null;
      });

    return _configPromise;
  }

  /**
   * Ensure Firebase is initialized exactly once.
   * Returns a promise that resolves with { firebase, auth, config } or
   * { firebase: null, auth: null, config: null, skipped: true } on failure.
   */
  function ensureInitialized() {
    if (_initPromise) return _initPromise;

    _initPromise = loadConfig().then(function (config) {
      if (!config) {
        console.warn('[FirebaseConfig] no config — Firebase not initialized');
        return { firebase: null, auth: null, config: null, skipped: true };
      }

      if (!window.firebase) {
        console.error('[FirebaseConfig] firebase SDK not loaded on page');
        return { firebase: null, auth: null, config: config, skipped: true };
      }

      // Initialize only once
      if (!firebase.apps || firebase.apps.length === 0) {
        firebase.initializeApp(config);
        console.log('[FirebaseConfig] firebase.initializeApp() called');
      }

      var auth = firebase.auth ? firebase.auth() : null;
      if (auth) {
        window.auth = auth;
      }

      return { firebase: window.firebase, auth: auth, config: config };
    });

    return _initPromise;
  }

  /**
   * Get the Firebase SDK object (null if not yet initialized).
   */
  function getFirebase() {
    return window.firebase || null;
  }

  /**
   * Get the Firebase Auth instance (null if not yet initialized).
   */
  function getAuth() {
    if (window.auth) return window.auth;
    if (window.firebase && window.firebase.auth && window.firebase.apps && window.firebase.apps.length) {
      window.auth = window.firebase.auth();
      return window.auth;
    }
    return null;
  }

  window.FirebaseConfig = {
    loadConfig: loadConfig,
    ensureInitialized: ensureInitialized,
    getFirebase: getFirebase,
    getAuth: getAuth
  };

  // Backward compat alias (old name used in login.js/signup.js/auth.js)
  window.FirebaseRuntimeConfig = window.FirebaseConfig;
})();
