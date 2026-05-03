const { env, allowedOrigin } = require("../../core/env");
const logger = require("../../core/logger");

function json(statusCode, obj) {
  const normalized = Object.prototype.hasOwnProperty.call(obj || {}, "success") ? obj : { success: statusCode < 400, data: statusCode < 400 ? obj : null, error: statusCode < 400 ? null : (obj && obj.error || "Request failed") };
  return { statusCode, headers: { "content-type": "application/json", "access-control-allow-origin": allowedOrigin(), "access-control-allow-methods": "POST,OPTIONS", "access-control-allow-headers": "content-type,authorization,x-aevra-csrf", "cache-control": "no-store" }, body: JSON.stringify(normalized) };
}
function cosine(a, b) {
  const len = Math.min(a.length, b.length);
  let dot = 0, ma = 0, mb = 0;
  for (let i = 0; i < len; i++) { dot += a[i] * b[i]; ma += a[i] * a[i]; mb += b[i] * b[i]; }
  return ma && mb ? dot / (Math.sqrt(ma) * Math.sqrt(mb)) : 0;
}
async function forwardAudio(payload) {
  const base = String(env("FASTAPI_BASE_URL", "") || env("BACKEND_URL", "")).replace(/\/$/, "");
  if (!base) throw new Error("FASTAPI_BASE_URL is not configured");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(`${base}/voice/recognize`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: controller.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Backend HTTP ${res.status}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}
exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  try {
    const contentType = String(event.headers && (event.headers["content-type"] || event.headers["Content-Type"]) || "");
    if (contentType.includes("multipart/form-data") || contentType.includes("audio/")) {
      const audio = event.isBase64Encoded ? String(event.body || "") : Buffer.from(String(event.body || ""), "binary").toString("base64");
      const data = await forwardAudio({ audio_base64: audio });
      const normalized = data.data || data;
      return json(200, { success: true, data: { matched: !!normalized.matched, userId: normalized.userId || normalized.user_id || null, confidence: Number(normalized.confidence || 0), text: normalized.text }, error: null });
    }
    const payload = JSON.parse(event.body || "{}");
    if (payload.audio || payload.audio_base64) {
      const data = await forwardAudio(payload);
      const normalized = data.data || data;
      return json(200, { success: true, data: { matched: !!normalized.matched, userId: normalized.userId || normalized.user_id || null, confidence: Number(normalized.confidence || 0), text: normalized.text }, error: null });
    }
    const embedding = Array.isArray(payload.embedding) ? payload.embedding.map(Number) : [];
    if (embedding.length !== 26) return json(422, { error: "audio or 26-dimensional embedding is required" });
    const base = String(env("SUPABASE_URL", "")).replace(/\/$/, "");
    const key = env("SUPABASE_SERVICE_KEY") || env("SUPABASE_ANON_KEY");
    if (!base || !key) return json(500, { error: "Supabase is not configured" });
    const res = await fetch(`${base}/rest/v1/voice_signatures?select=user_id,embedding`, { headers: { apikey: key, authorization: `Bearer ${key}` } });
    const rows = await res.json().catch(() => []);
    let best = { userId: null, confidence: 0 };
    rows.forEach((row) => {
      const score = cosine(embedding, Array.isArray(row.embedding) ? row.embedding.map(Number) : []);
      if (score > best.confidence) best = { userId: row.user_id, confidence: score };
    });
    return json(200, { success: true, data: { matched: best.confidence >= 0.85, userId: best.confidence >= 0.85 ? best.userId : null, confidence: best.confidence }, error: null });
  } catch (error) {
    logger.error("voice_recognize", { error: String(error && error.stack || error) });
    return json(500, { success: false, data: null, error: "Voice recognition is unavailable right now." });
  }
};
