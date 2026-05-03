function json(statusCode, obj) {
  return { statusCode, headers: { "content-type": "application/json", "access-control-allow-origin": process.env.ALLOWED_ORIGINS || "http://localhost:5500", "access-control-allow-methods": "POST,OPTIONS", "access-control-allow-headers": "content-type,authorization,x-aevra-csrf" }, body: JSON.stringify(obj) };
}
function headers() { const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY; return { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", Prefer: "return=representation" }; }
exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  try {
    const payload = JSON.parse(event.body || "{}");
    const userId = String(payload.userId || payload.user_id || "").trim();
    const embedding = Array.isArray(payload.embedding) ? payload.embedding.map(Number) : [];
    if (!userId || embedding.length !== 26) return json(422, { error: "userId and 26-dimensional embedding are required" });
    const base = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
    if (!base) return json(500, { error: "Supabase is not configured" });
    await fetch(`${base}/rest/v1/user_profiles?on_conflict=id`, { method: "POST", headers: { ...headers(), Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ id: userId, display_name: payload.profile && payload.profile.displayName || "Student", grade: 9, updated_at: new Date().toISOString() }) });
    const res = await fetch(`${base}/rest/v1/voice_signatures`, { method: "POST", headers: headers(), body: JSON.stringify({ user_id: userId, embedding }) });
    if (!res.ok) throw new Error(await res.text());
    return json(200, { ok: true, userId });
  } catch (error) {
    console.error(JSON.stringify({ at: new Date().toISOString(), fn: "voice_enroll", error: String(error && error.stack || error) }));
    return json(500, { error: "Voice enrollment could not be saved." });
  }
};
