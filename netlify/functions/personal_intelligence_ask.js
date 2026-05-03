function json(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": process.env.ALLOWED_ORIGINS || "http://localhost:5500",
      "access-control-allow-methods": "POST,OPTIONS",
      "access-control-allow-headers": "content-type,authorization,x-aevra-csrf",
      "cache-control": "no-store",
    },
    body: JSON.stringify(obj),
  };
}

const AEVRA_SYSTEM_PROMPT = "You are Aevra, a warm and intelligent AI study companion designed for students. You explain concepts clearly, adapt to each student's learning style, and make studying feel engaging rather than overwhelming. You are encouraging, patient, and always focused on helping the student genuinely understand - not just memorize. Your name is Aevra.";

function sbHeaders() {
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  return { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" };
}

async function supabase(path, options) {
  const base = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  if (!base) throw new Error("SUPABASE_URL is not configured");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(`${base}/rest/v1/${path}`, { ...(options || {}), headers: { ...sbHeaders(), ...(options && options.headers || {}) }, signal: controller.signal });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error(data && data.message ? data.message : `Supabase HTTP ${res.status}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function buildSystemPrompt(profile, config) {
  const name = profile && (profile.display_name || profile.displayName) || "Student";
  const grade = profile && profile.grade || 9;
  return `${AEVRA_SYSTEM_PROMPT}\n\nPersonalization: The user's name is ${name}. Use a ${config.tone || "friendly"} tone. Humor level: ${config.humor_level || 5}/10. Be ${config.verbosity || "medium"} in your responses. Teaching style: ${config.teaching_style || "socratic"}. The user is a Grade ${grade} student.`;
}

async function groq(messages) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY is not configured");
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "llama-3.1-70b-versatile", messages, temperature: 0.7 }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error && data.error.message || `Groq HTTP ${res.status}`);
  return { text: data.choices[0].message.content, tokens: data.usage && data.usage.total_tokens || 0 };
}

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (error) {
    return json(400, { error: "Invalid JSON body" });
  }

  const userId = String(payload.userId || payload.user_id || "guest@student.com").trim();
  const message = String(payload.message || "").trim();
  let sessionId = String(payload.sessionId || payload.session_id || "").trim();
  if (!userId || !message) return json(422, { error: "userId and message are required" });

  try {
    const profiles = await supabase(`user_profiles?id=eq.${encodeURIComponent(userId)}&select=*&limit=1`, { method: "GET" }).catch(() => []);
    const configs = await supabase(`personalization_configs?user_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`, { method: "GET" }).catch(() => []);
    const profile = profiles && profiles[0] || { id: userId, display_name: "Student", grade: 9 };
    const config = configs && configs[0] || {};

    let session = null;
    if (sessionId) {
      const rows = await supabase(`conversation_sessions?id=eq.${encodeURIComponent(sessionId)}&select=*&limit=1`, { method: "GET" }).catch(() => []);
      session = rows && rows[0] || null;
    }
    if (!session) {
      const rows = await supabase("conversation_sessions", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ user_id: userId, session_type: "chat", messages: [] }) });
      session = rows && rows[0];
      sessionId = session.id;
    }

    const history = Array.isArray(session.messages) ? session.messages.slice(-12) : [];
    const messages = [{ role: "system", content: buildSystemPrompt(profile, config) }]
      .concat(history.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "") })))
      .concat([{ role: "user", content: message }]);
    const result = await groq(messages);
    const updated = history.concat([{ role: "user", content: message, at: new Date().toISOString() }, { role: "assistant", content: result.text, at: new Date().toISOString() }]);
    await supabase(`conversation_sessions?id=eq.${encodeURIComponent(sessionId)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ messages: updated, updated_at: new Date().toISOString() }) }).catch(() => null);

    return json(200, { response: result.text, answer: result.text, sessionId, tokensUsed: result.tokens });
  } catch (error) {
    console.error(JSON.stringify({ at: new Date().toISOString(), fn: "personal_intelligence_ask", userId, error: String(error && error.stack || error) }));
    return json(500, { error: "Aevra could not answer right now. Please try again." });
  }
};
