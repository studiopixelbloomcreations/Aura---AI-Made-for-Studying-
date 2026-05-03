const { env, allowedOrigin } = require("../../core/env");

function json(statusCode, obj) {
  const normalized = Object.prototype.hasOwnProperty.call(obj || {}, "success") ? obj : { success: statusCode < 400, data: statusCode < 400 ? obj : null, error: statusCode < 400 ? null : (obj && obj.error || "Request failed") };
  return { statusCode, headers: { "content-type": "application/json", "access-control-allow-origin": allowedOrigin(), "access-control-allow-methods": "GET,OPTIONS", "access-control-allow-headers": "content-type,authorization,x-aevra-csrf", "cache-control": "no-store" }, body: JSON.stringify(normalized) };
}

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") return json(200, { success: true, data: {}, error: null });
  if (event.httpMethod !== "GET") return json(405, { success: false, data: null, error: "Method not allowed" });
  const firebaseConfig = env("FIREBASE_CONFIG", {});
  return json(200, {
    ok: true,
    firebase: firebaseConfig && typeof firebaseConfig === "object" ? firebaseConfig : {},
    success: true,
    data: {
      firebase: firebaseConfig && typeof firebaseConfig === "object" ? firebaseConfig : {},
      supabase: {
        url: env("SUPABASE_URL", ""),
        anonKey: env("SUPABASE_ANON_KEY", ""),
      },
    },
    error: null,
  });
};
