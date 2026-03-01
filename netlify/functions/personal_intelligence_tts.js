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

  const apiKey = String(process.env.NOIZ_API_KEY || "").trim();
  const voiceId = String(process.env.NOIZ_VOICE_ID || "").trim();
  if (!apiKey || !voiceId) {
    return json(200, { ok: false, error: "NOIZ_API_KEY or NOIZ_VOICE_ID missing in Netlify environment" });
  }

  let payload = {};
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return json(400, { error: "Invalid JSON body" });
  }
  const text = String((payload && payload.text) || "").trim();
  if (!text) return json(400, { error: "text is required" });

  try {
    const params = new URLSearchParams({
      text,
      voice_id: voiceId,
      output_format: "mp3",
    });

    const resp = await fetch("https://noiz.ai/v1/text-to-speech", {
      method: "POST",
      headers: {
        Authorization: apiKey,
      },
      body: params,
    });

    if (!resp.ok) {
      const errTxt = await resp.text().catch(() => "");
      return json(200, {
        ok: false,
        error: `Noiz TTS failed (HTTP ${resp.status})`,
        detail: errTxt.slice(0, 500),
      });
    }

    const ab = await resp.arrayBuffer();
    const buf = Buffer.from(ab);
    const ctype = resp.headers.get("content-type") || "audio/mpeg";
    return audio(200, buf, ctype);
  } catch (e) {
    return json(200, { ok: false, error: `Noiz request failed: ${String(e.message || e)}` });
  }
};
