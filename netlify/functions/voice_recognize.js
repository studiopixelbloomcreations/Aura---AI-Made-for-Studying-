function json(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type,authorization",
      "cache-control": "no-store",
    },
    body: JSON.stringify(obj),
  };
}

function normalizeLang(language) {
  const raw = String(language || "en-US").trim().toLowerCase();
  if (!raw) return "en";
  if (raw.startsWith("si")) return "si";
  if (raw.startsWith("en")) return "en";
  const cut = raw.split("-")[0];
  return cut || "en";
}

function decodeBase64Audio(input) {
  const raw = String(input || "").trim();
  const normalized = raw.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  const groqKey = String(process.env.GROQ_API_KEY || "").trim();
  if (!groqKey) {
    return json(500, { ok: false, error: "Missing GROQ_API_KEY in Netlify environment variables." });
  }

  let payload = {};
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return json(400, { ok: false, error: "Invalid JSON body." });
  }

  const audioBase64 = String((payload && payload.audio_base64) || "").trim();
  const mimeType = String((payload && payload.mime_type) || "audio/webm").trim();
  const filename = String((payload && payload.filename) || "speech.webm").trim();
  const language = normalizeLang(payload && payload.language);
  if (!audioBase64) return json(400, { ok: false, error: "audio_base64 is required." });

  try {
    const audioBuffer = decodeBase64Audio(audioBase64);
    if (!audioBuffer || audioBuffer.length < 16) {
      return json(400, { ok: false, error: "Audio payload is empty." });
    }

    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 25000) : null;
    const fd = new FormData();
    fd.append("model", "whisper-large-v3-turbo");
    fd.append("response_format", "json");
    fd.append("language", language);
    fd.append("temperature", "0");
    fd.append("file", new Blob([audioBuffer], { type: mimeType || "audio/webm" }), filename || "speech.webm");

    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqKey}`,
      },
      body: fd,
      signal: controller ? controller.signal : undefined,
    });
    if (timer) clearTimeout(timer);

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail =
        (data && data.error && (data.error.message || data.error)) ||
        (data && data.message) ||
        `HTTP ${res.status}`;
      return json(502, { ok: false, error: `STT provider failed: ${String(detail)}` });
    }

    const text = String((data && data.text) || "").trim();
    return json(200, { ok: true, text, engine: "groq:whisper-large-v3-turbo" });
  } catch (e) {
    return json(502, { ok: false, error: `STT request failed: ${String(e && e.message ? e.message : e)}` });
  }
};
