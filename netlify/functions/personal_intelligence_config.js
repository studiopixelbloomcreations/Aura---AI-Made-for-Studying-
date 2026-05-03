const { env, allowedOrigin } = require("../../core/env");
const logger = require("../../core/logger");

function json(statusCode, obj) {
  const normalized = Object.prototype.hasOwnProperty.call(obj || {}, "success")
    ? obj
    : { success: statusCode < 400, data: statusCode < 400 ? obj : null, error: statusCode < 400 ? null : (obj && obj.error || "Request failed") };
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": allowedOrigin(),
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type,authorization,x-aevra-csrf",
      "cache-control": "no-store",
    },
    body: JSON.stringify(normalized),
  };
}

function supabaseHeaders() {
  const key = env("SUPABASE_SERVICE_KEY") || env("SUPABASE_ANON_KEY");
  return { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" };
}

async function sb(path, options) {
  const base = String(env("SUPABASE_URL", "")).replace(/\/$/, "");
  if (!base) throw new Error("SUPABASE_URL is not configured");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(`${base}/rest/v1/${path}`, { ...(options || {}), headers: { ...supabaseHeaders(), ...(options && options.headers || {}) }, signal: controller.signal });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error(data && data.message ? data.message : `Supabase HTTP ${res.status}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  try {
    if (event.httpMethod === "GET") {
      const userId = String((event.queryStringParameters && (event.queryStringParameters.userId || event.queryStringParameters.user_id)) || "").trim();
      if (!userId) return json(422, { ok: false, error: "userId is required" });
      if (!isUuid(userId)) return json(200, { success: true, data: { config: null }, error: null });
      const rows = await sb(`personalization_configs?user_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`, { method: "GET" });
      return json(200, { success: true, data: { config: rows && rows[0] || null }, error: null });
    }
    if (event.httpMethod === "POST") {
      const payload = JSON.parse(event.body || "{}");
      const userId = String(payload.userId || payload.user_id || "").trim();
      const config = payload.config || payload.ai_behavior_configuration || payload;
      if (!userId) return json(422, { ok: false, error: "userId is required" });
      if (!isUuid(userId)) return json(200, { success: true, data: { config }, error: null });
      const row = {
        user_id: userId,
        tone: String(config.tone || "friendly"),
        humor_level: Number(config.humor_level || config.humor || 5),
        verbosity: String(config.verbosity || "medium"),
        teaching_style: String(config.teaching_style || config.style || "socratic"),
        language: String(config.language || "en"),
        subjects: Array.isArray(config.subjects) ? config.subjects : [],
        raw_config: config,
        updated_at: new Date().toISOString(),
      };
      const saved = await sb("personalization_configs?on_conflict=user_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(row) });
      return json(200, { success: true, data: { config: saved && saved[0] || row }, error: null });
    }
    return json(405, { ok: false, error: "Method not allowed" });
  } catch (error) {
    logger.error("personal_intelligence_config", { error: String(error && error.stack || error) });
    return json(500, { success: false, data: null, error: "Aevra settings are unavailable right now." });
  }
};
