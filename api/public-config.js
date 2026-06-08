/**
 * AURA AI — Public Config API (Vercel Serverless)
 * Returns ONLY safe Firebase client config. Never exposes secrets.
 *
 * Supports 3 ways to provide Firebase config:
 *   1. Individual env vars: FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN, etc.
 *   2. FIREBASE_CONFIG env var: JSON string with all 6 keys
 *   3. AURA_ENV env var: JSON object containing FIREBASE_CONFIG as a nested JSON string
 */
module.exports = function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let firebase = null;

  // Strategy 1: Individual env vars
  if (process.env.FIREBASE_API_KEY && process.env.FIREBASE_PROJECT_ID) {
    firebase = {
      apiKey: process.env.FIREBASE_API_KEY,
      authDomain: process.env.FIREBASE_AUTH_DOMAIN || "",
      projectId: process.env.FIREBASE_PROJECT_ID,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "",
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "",
      appId: process.env.FIREBASE_APP_ID || "",
    };
  }

  // Strategy 2: FIREBASE_CONFIG as a JSON string
  if (!firebase && process.env.FIREBASE_CONFIG) {
    try {
      const parsed = JSON.parse(process.env.FIREBASE_CONFIG);
      if (parsed && parsed.apiKey && parsed.projectId) {
        firebase = {
          apiKey: parsed.apiKey,
          authDomain: parsed.authDomain || "",
          projectId: parsed.projectId,
          storageBucket: parsed.storageBucket || "",
          messagingSenderId: parsed.messagingSenderId || "",
          appId: parsed.appId || "",
        };
      }
    } catch (e) {
      console.error("[public-config] FIREBASE_CONFIG is not valid JSON:", e.message);
    }
  }

  // Strategy 3: AURA_ENV JSON string containing FIREBASE_CONFIG
  if (!firebase && process.env.AURA_ENV) {
    try {
      const auraEnv = JSON.parse(process.env.AURA_ENV);
      const raw = auraEnv.FIREBASE_CONFIG;
      if (raw) {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (parsed && parsed.apiKey && parsed.projectId) {
          firebase = {
            apiKey: parsed.apiKey,
            authDomain: parsed.authDomain || "",
            projectId: parsed.projectId,
            storageBucket: parsed.storageBucket || "",
            messagingSenderId: parsed.messagingSenderId || "",
            appId: parsed.appId || "",
          };
        }
      }
    } catch (e) {
      console.error("[public-config] AURA_ENV parse error:", e.message);
    }
  }

  if (!firebase) {
    console.error("[public-config] Firebase config not found in any source");
    return res.status(500).json({ error: "Firebase not configured" });
  }

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  return res.status(200).json({ firebase });
};
