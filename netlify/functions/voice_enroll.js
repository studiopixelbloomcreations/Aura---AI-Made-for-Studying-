const { env, allowedOrigin } = require("../../core/env");
const logger = require("../../core/logger");

function json(statusCode, obj) {
  const success = statusCode < 400 && obj && obj.success !== false;
  return { statusCode, headers: { "content-type": "application/json", "access-control-allow-origin": allowedOrigin(), "access-control-allow-methods": "POST,OPTIONS", "access-control-allow-headers": "content-type,authorization,x-aevra-csrf" }, body: JSON.stringify(obj && Object.prototype.hasOwnProperty.call(obj, "success") ? obj : { success, data: success ? obj : null, error: success ? null : (obj && obj.error || "Request failed") }) };
}
exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  try {
    const payload = JSON.parse(event.body || "{}");
    const userId = String(payload.userId || payload.user_id || "").trim();
    const audio = String(payload.audio || payload.audio_base64 || "").trim();
    const embedding = Array.isArray(payload.embedding) ? payload.embedding.map(Number) : null;
    if (!userId || (!audio && !embedding)) return json(422, { success: false, data: null, error: "userId and voice audio are required." });
    const backend = String(env("FASTAPI_BASE_URL", "")).replace(/\/$/, "");
    if (backend) {
      const res = await fetch(`${backend}/voice/enroll`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId, displayName: payload.profile && payload.profile.displayName || "Student", audio, embedding }) });
      const data = await res.json().catch(() => ({}));
      return json(res.ok ? 200 : 502, data.success !== undefined ? data : { success: res.ok, data, error: res.ok ? null : "Voice backend enrollment failed." });
    }
    const base = String(env("SUPABASE_URL", "")).replace(/\/$/, "");
    const key = env("SUPABASE_SERVICE_KEY") || env("SUPABASE_ANON_KEY");
    if (!base || !key || !embedding || embedding.length !== 26) return json(500, { success: false, data: null, error: "Voice backend is not configured." });
    const headers = { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", Prefer: "return=representation" };
    await fetch(`${base}/rest/v1/user_profiles?on_conflict=id`, { method: "POST", headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ id: userId, display_name: payload.profile && payload.profile.displayName || "Student", grade: 9, updated_at: new Date().toISOString() }) });
    const res = await fetch(`${base}/rest/v1/voice_signatures`, { method: "POST", headers, body: JSON.stringify({ user_id: userId, embedding }) });
    if (!res.ok) throw new Error(await res.text());
    return json(200, { success: true, data: { userId }, error: null, ok: true, userId });
  } catch (error) {
    logger.error("voice_enroll", { error: String(error && error.stack || error) });
    return json(500, { success: false, data: null, error: "Voice enrollment could not be saved." });
  }
};
