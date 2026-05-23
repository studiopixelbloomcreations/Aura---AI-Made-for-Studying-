function json(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type,authorization",
    },
    body: JSON.stringify(obj),
  };
}

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  const apiKey = (process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    return json(200, { ok: false, error: "OPENAI_API_KEY is missing on Netlify environment" });
  }

  const model = (process.env.OPENAI_REALTIME_MODEL || "gpt-realtime").trim();
  const voice = (process.env.OPENAI_REALTIME_VOICE || "alloy").trim();

  const payload = {
    model,
    voice,
    modalities: ["text", "audio"],
    instructions:
      "You are Aura AI, a warm personal assistant. Keep replies natural, short, and helpful for daily tasks and study support.",
  };

  try {
    const res = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data && data.error && data.error.message ? data.error.message : `Realtime session failed (HTTP ${res.status})`;
      return json(200, { ok: false, error: msg, status_code: res.status });
    }

    return json(200, {
      ok: true,
      model,
      voice,
      client_secret: data.client_secret || null,
      session: data,
    });
  } catch (e) {
    return json(200, { ok: false, error: `Failed to create realtime session: ${String(e.message || e)}` });
  }
};
