function audio(statusCode, bodyBuffer, contentType) {
  return {
    statusCode,
    headers: {
      "content-type": contentType || "audio/wav",
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

function pcm16ToWav(pcmBuffer, sampleRate, channels) {
  const bitsPerSample = 16;
  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcmBuffer.length;
  const wav = Buffer.alloc(44 + dataSize);

  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write("WAVE", 8);
  wav.write("fmt ", 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(channels, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(byteRate, 28);
  wav.writeUInt16LE(blockAlign, 32);
  wav.writeUInt16LE(bitsPerSample, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(dataSize, 40);
  pcmBuffer.copy(wav, 44);
  return wav;
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

  const apiKey = String(process.env.GEMINI_API_KEY || "").trim();
  const baseUrl = String(process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com").trim();
  const model = String(process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts").trim();
  const defaultVoice = String(process.env.GEMINI_TTS_VOICE || "Kore").trim();
  const defaultSampleRate = Number(process.env.GEMINI_TTS_SAMPLE_RATE || 24000);
  if (!apiKey) {
    return json(500, { ok: false, error: "GEMINI_API_KEY missing in Netlify environment" });
  }

  let payload = {};
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return json(400, { error: "Invalid JSON body" });
  }
  const text = String((payload && payload.text) || "").trim();
  const voiceName = String((payload && payload.voice_name) || defaultVoice).trim();
  const sampleRate = Number((payload && payload.sample_rate) || defaultSampleRate || 24000);

  if (!text) return json(400, { error: "text is required" });
  if (!voiceName) return json(400, { error: "voice_name is required" });

  try {
    const endpoint = `${baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
      }),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const detail = (data && data.error && data.error.message) ? String(data.error.message) : `HTTP ${resp.status}`;
      return json(502, { ok: false, error: `Gemini TTS failed: ${detail}` });
    }

    const parts =
      data &&
      data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      Array.isArray(data.candidates[0].content.parts)
        ? data.candidates[0].content.parts
        : [];

    let inlineData = null;
    for (const p of parts) {
      const a = p && (p.inlineData || p.inline_data);
      if (a && a.data) {
        inlineData = a;
        break;
      }
    }
    if (!inlineData || !inlineData.data) {
      return json(502, { ok: false, error: "Gemini TTS returned no audio data." });
    }

    const mime = String((inlineData.mimeType || inlineData.mime_type || "")).toLowerCase();
    const raw = decodeBase64Audio(inlineData.data);

    if (!raw || raw.length < 32) {
      return json(502, { ok: false, error: "Gemini TTS returned empty audio." });
    }

    const isLikelyWav = raw.length > 12 && raw.toString("ascii", 0, 4) === "RIFF" && raw.toString("ascii", 8, 12) === "WAVE";
    const isLikelyMpeg = raw.length > 3 && raw.toString("ascii", 0, 3) === "ID3";
    const isPcm = mime.includes("l16") || mime.includes("pcm");

    if (isLikelyWav || isLikelyMpeg || mime.includes("wav") || mime.includes("mpeg") || mime.includes("mp3") || mime.includes("ogg")) {
      // Always use broadly supported browser audio types for HTMLAudioElement.
      const ctype = isLikelyWav || mime.includes("wav") ? "audio/wav" : "audio/mpeg";
      return audio(200, raw, ctype);
    }

    // Default to PCM16 mono -> WAV when Gemini returns raw PCM (common for AUDIO modality).
    const wav = pcm16ToWav(raw, Number.isFinite(sampleRate) ? sampleRate : 24000, 1);
    if (!isPcm && !mime) {
      // Unknown mime with non-container bytes; still deliver WAV as safest browser format.
      return audio(200, wav, "audio/wav");
    }
    return audio(200, wav, "audio/wav");
  } catch (e) {
    return json(502, { ok: false, error: `Gemini TTS request failed: ${String(e.message || e)}` });
  }
};
