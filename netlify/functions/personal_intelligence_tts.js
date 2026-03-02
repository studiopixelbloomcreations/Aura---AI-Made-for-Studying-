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

function splitIntoChunks(text, maxLen) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return [];
  if (t.length <= maxLen) return [t];

  const sentences = t.split(/(?<=[.!?])\s+/);
  const chunks = [];
  let current = "";
  for (const s of sentences) {
    const sentence = String(s || "").trim();
    if (!sentence) continue;
    if (!current) {
      if (sentence.length <= maxLen) {
        current = sentence;
      } else {
        for (let i = 0; i < sentence.length; i += maxLen) {
          chunks.push(sentence.slice(i, i + maxLen));
        }
      }
      continue;
    }
    if ((current + " " + sentence).length <= maxLen) {
      current += " " + sentence;
    } else {
      chunks.push(current);
      if (sentence.length <= maxLen) {
        current = sentence;
      } else {
        for (let i = 0; i < sentence.length; i += maxLen) {
          chunks.push(sentence.slice(i, i + maxLen));
        }
        current = "";
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function parseWav(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 44) return null;
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") return null;

  let offset = 12;
  let fmt = null;
  let dataChunk = null;
  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const bodyStart = offset + 8;
    const bodyEnd = bodyStart + size;
    if (bodyEnd > buf.length) break;

    if (id === "fmt " && size >= 16) {
      fmt = {
        audioFormat: buf.readUInt16LE(bodyStart),
        channels: buf.readUInt16LE(bodyStart + 2),
        sampleRate: buf.readUInt32LE(bodyStart + 4),
        byteRate: buf.readUInt32LE(bodyStart + 8),
        blockAlign: buf.readUInt16LE(bodyStart + 12),
        bitsPerSample: buf.readUInt16LE(bodyStart + 14),
      };
    } else if (id === "data") {
      dataChunk = buf.subarray(bodyStart, bodyEnd);
    }

    offset = bodyEnd + (size % 2);
  }

  if (!fmt || !dataChunk) return null;
  return { fmt, data: dataChunk };
}

function buildWav(dataBuffer, fmt) {
  const channels = fmt.channels || 1;
  const sampleRate = fmt.sampleRate || 24000;
  const bitsPerSample = fmt.bitsPerSample || 16;
  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = dataBuffer.length;

  const out = Buffer.alloc(44 + dataSize);
  out.write("RIFF", 0);
  out.writeUInt32LE(36 + dataSize, 4);
  out.write("WAVE", 8);
  out.write("fmt ", 12);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(channels, 22);
  out.writeUInt32LE(sampleRate, 24);
  out.writeUInt32LE(byteRate, 28);
  out.writeUInt16LE(blockAlign, 32);
  out.writeUInt16LE(bitsPerSample, 34);
  out.write("data", 36);
  out.writeUInt32LE(dataSize, 40);
  dataBuffer.copy(out, 44);
  return out;
}

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  const apiKey = String(process.env.GROQ_API_KEY || "").trim();
  const baseUrl = String(process.env.GROQ_API_BASE || "https://api.groq.com").trim();
  const model = String(process.env.GROQ_TTS_MODEL || "canopylabs/orpheus-v1-english").trim();
  const voice = String(process.env.GROQ_TTS_VOICE || "autumn").trim();
  if (!apiKey) {
    return json(500, { ok: false, error: "GROQ_API_KEY missing in Netlify environment" });
  }

  let payload = {};
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return json(400, { error: "Invalid JSON body" });
  }
  const text = String((payload && payload.text) || "").trim();
  if (!text) return json(400, { error: "text is required" });

  const chunks = splitIntoChunks(text, 180);
  if (!chunks.length) return json(400, { error: "text is required" });

  try {
    const wavParts = [];
    let wavFmt = null;

    for (const chunk of chunks) {
      const res = await fetch(`${baseUrl}/openai/v1/audio/speech`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          voice,
          input: chunk,
          response_format: "wav",
        }),
      });

      if (!res.ok) {
        const errTxt = await res.text().catch(() => "");
        return json(502, {
          ok: false,
          error: `Groq TTS failed (HTTP ${res.status})`,
          detail: errTxt.slice(0, 500),
        });
      }

      const raw = Buffer.from(await res.arrayBuffer());
      const parsed = parseWav(raw);
      if (!parsed) {
        if (chunks.length === 1) return audio(200, raw, "audio/wav");
        return json(502, { ok: false, error: "Groq TTS returned non-WAV chunk for a multi-part response." });
      }

      if (!wavFmt) {
        wavFmt = parsed.fmt;
      } else {
        const mismatch =
          wavFmt.channels !== parsed.fmt.channels ||
          wavFmt.sampleRate !== parsed.fmt.sampleRate ||
          wavFmt.bitsPerSample !== parsed.fmt.bitsPerSample;
        if (mismatch) {
          return json(502, { ok: false, error: "Groq TTS chunks returned mismatched audio formats." });
        }
      }
      wavParts.push(parsed.data);
    }

    const mergedPcm = Buffer.concat(wavParts);
    const mergedWav = buildWav(mergedPcm, wavFmt || { channels: 1, sampleRate: 24000, bitsPerSample: 16 });
    return audio(200, mergedWav, "audio/wav");
  } catch (e) {
    return json(502, { ok: false, error: `Groq TTS request failed: ${String(e.message || e)}` });
  }
};
