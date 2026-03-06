const axios = require("axios");

function json(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,OPTIONS",
      "access-control-allow-headers": "content-type,authorization",
      "cache-control": "no-store",
    },
    body: JSON.stringify(obj),
  };
}

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "GET") return json(405, { ok: false, error: "Method not allowed" });

  const apiKey = String(process.env.ELEVENLABS_API_KEY || "").trim();
  if (!apiKey) {
    return json(500, { ok: false, error: "Missing ELEVENLABS_API_KEY in Netlify environment variables" });
  }

  try {
    const res = await axios.get("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": apiKey },
      timeout: 30000,
      validateStatus: () => true,
    });
    if (!res || typeof res.status !== "number") {
      return json(502, { ok: false, error: "Bad response from ElevenLabs" });
    }
    if (res.status >= 400) {
      return json(502, {
        ok: false,
        error: "Failed to fetch ElevenLabs voices",
        status: res.status,
      });
    }

    const voices = Array.isArray(res.data && res.data.voices) ? res.data.voices : [];
    const mapped = voices.map((v) => ({
      voice_id: String(v.voice_id || ""),
      name: String(v.name || "Voice"),
      category: String(v.category || ""),
      labels: v && typeof v.labels === "object" ? v.labels : {},
    })).filter((v) => v.voice_id);

    const premade = mapped.filter((v) => v.category.toLowerCase() === "premade");
    const selected = premade.length ? premade : mapped;

    return json(200, {
      ok: true,
      voices: selected,
      source_count: mapped.length,
      filtered_to_premade: premade.length > 0,
    });
  } catch (e) {
    return json(500, {
      ok: false,
      error: "ElevenLabs voices request failed",
      detail: String((e && e.message) || e || ""),
    });
  }
};
