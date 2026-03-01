function audio(statusCode, bodyBuffer, contentType) {
  return {
    statusCode,
    headers: {
      "content-type": contentType || "audio/mpeg",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type,authorization",
      "cache-control": "no-store",
    },
    body: bodyBuffer.toString("base64"),
    isBase64Encoded: true,
  };
}

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

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  const apiKey = String(process.env.SPEECHIFY_API_KEY || "").trim();
  const defaultVoiceId = String(process.env.SPEECHIFY_VOICE_ID || "").trim();
  const defaultAudioFormat = String(process.env.SPEECHIFY_AUDIO_FORMAT || "mp3").trim();
  const defaultLanguage = String(process.env.SPEECHIFY_LANGUAGE || "").trim();
  const defaultModel = String(process.env.SPEECHIFY_MODEL || "").trim();
  const baseUrl = String(process.env.SPEECHIFY_API_BASE || "https://api.sws.speechify.com").trim();
  const endpointPath = String(process.env.SPEECHIFY_TTS_PATH || "/v1/audio/speech").trim();
  if (!apiKey || !defaultVoiceId) {
    return json(500, { ok: false, error: "SPEECHIFY_API_KEY or SPEECHIFY_VOICE_ID missing in Netlify environment" });
  }

  let payload = {};
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return json(400, { error: "Invalid JSON body" });
  }
  const text = String((payload && payload.text) || "").trim();
  const voiceId = String((payload && payload.voice_id) || defaultVoiceId).trim();
  const audioFormat = String((payload && payload.audio_format) || defaultAudioFormat).trim();
  const language = String((payload && payload.language) || defaultLanguage).trim();
  const model = String((payload && payload.model) || defaultModel).trim();
  if (!text) return json(400, { error: "text is required" });
  if (!voiceId) return json(400, { error: "voice_id is required" });

  try {
    const speechifyPayload = {
      input: text,
      voice_id: voiceId,
      audio_format: audioFormat,
    };
    if (language) speechifyPayload.language = language;
    if (model) speechifyPayload.model = model;

    const resp = await fetch(baseUrl + endpointPath, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(speechifyPayload),
    });

    if (!resp.ok) {
      const errTxt = await resp.text().catch(() => "");
      return json(502, {
        ok: false,
        error: `Speechify TTS failed (HTTP ${resp.status})`,
        detail: errTxt.slice(0, 500),
      });
    }
    const contentType = (resp.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("application/json")) {
      const data = await resp.json().catch(() => ({}));
      const audioData = data && data.audio_data ? String(data.audio_data) : "";
      if (!audioData) {
        return json(502, {
          ok: false,
          error: "Speechify returned JSON without audio_data",
          detail: data,
        });
      }
      const buf = Buffer.from(audioData, "base64");
      return audio(200, buf, audioFormat === "wav" ? "audio/wav" : "audio/mpeg");
    }

    const ab = await resp.arrayBuffer();
    const buf = Buffer.from(ab);
    const ctype = resp.headers.get("content-type") || (audioFormat === "wav" ? "audio/wav" : "audio/mpeg");
    return audio(200, buf, ctype);
  } catch (e) {
    return json(502, { ok: false, error: `Speechify request failed: ${String(e.message || e)}` });
  }
};
