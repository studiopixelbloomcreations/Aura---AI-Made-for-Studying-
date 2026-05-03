function json(statusCode, obj) {
  return { statusCode, headers: { "content-type": "application/json", "access-control-allow-origin": process.env.ALLOWED_ORIGINS || "http://localhost:5500", "access-control-allow-methods": "POST,OPTIONS", "access-control-allow-headers": "content-type,authorization,x-aevra-csrf", "cache-control": "no-store" }, body: JSON.stringify(obj) };
}
function cosine(a, b) {
  const len = Math.min(a.length, b.length);
  let dot = 0, ma = 0, mb = 0;
  for (let i = 0; i < len; i++) { dot += a[i] * b[i]; ma += a[i] * a[i]; mb += b[i] * b[i]; }
  return ma && mb ? dot / (Math.sqrt(ma) * Math.sqrt(mb)) : 0;
}
async function forwardAudio(payload) {
  const base = String(process.env.FASTAPI_BASE_URL || process.env.BACKEND_URL || "").replace(/\/$/, "");
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
    const payload = JSON.parse(event.body || "{}");
    if (payload.audio || payload.audio_base64) {
      const data = await forwardAudio(payload);
      return json(200, { matched: !!data.matched, userId: data.userId || data.user_id || null, confidence: Number(data.confidence || 0), text: data.text });
    }
    const embedding = Array.isArray(payload.embedding) ? payload.embedding.map(Number) : [];
    if (embedding.length !== 26) return json(422, { error: "audio or 26-dimensional embedding is required" });
    const base = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
    const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!base || !key) return json(500, { error: "Supabase is not configured" });
    const res = await fetch(`${base}/rest/v1/voice_signatures?select=user_id,embedding`, { headers: { apikey: key, authorization: `Bearer ${key}` } });
    const rows = await res.json().catch(() => []);
    let best = { userId: null, confidence: 0 };
    rows.forEach((row) => {
      const score = cosine(embedding, Array.isArray(row.embedding) ? row.embedding.map(Number) : []);
      if (score > best.confidence) best = { userId: row.user_id, confidence: score };
    });
    return json(200, { matched: best.confidence >= 0.85, userId: best.confidence >= 0.85 ? best.userId : null, confidence: best.confidence });
  } catch (error) {
    console.error(JSON.stringify({ at: new Date().toISOString(), fn: "voice_recognize", error: String(error && error.stack || error) }));
    return json(500, { matched: false, userId: null, confidence: 0, error: "Voice recognition is unavailable right now." });
  }
};
