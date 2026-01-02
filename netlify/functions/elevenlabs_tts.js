const axios = require('axios');

function response(statusCode, headers, body, isBase64Encoded) {
  return {
    statusCode,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST,OPTIONS",
      "access-control-allow-headers": "content-type,authorization",
      ...headers
    },
    body,
    isBase64Encoded: !!isBase64Encoded
  };
}

function json(statusCode, obj) {
  return response(
    statusCode,
    { "content-type": "application/json" },
    JSON.stringify(obj),
    false
  );
}

exports.handler = async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
  if (!ELEVENLABS_API_KEY) {
    return json(500, { error: 'Missing ELEVENLABS_API_KEY in Netlify environment variables' });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Invalid JSON' });
  }

  const text = payload && payload.text ? String(payload.text) : '';
  const voiceId = payload && payload.voiceId ? String(payload.voiceId) : '';

  if (!text.trim()) return json(400, { error: 'Missing text' });
  if (!voiceId.trim()) return json(400, { error: 'Missing voiceId' });

  const stability = typeof payload.stability === 'number' ? payload.stability : 0.5;
  const similarity_boost = typeof payload.similarity_boost === 'number' ? payload.similarity_boost : 0.75;

  try {
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`;

    const elevenRes = await axios.post(
      url,
      {
        text,
        voice_settings: {
          stability,
          similarity_boost
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': ELEVENLABS_API_KEY,
          Accept: 'audio/mpeg'
        },
        responseType: 'arraybuffer',
        timeout: 60000,
        validateStatus: () => true
      }
    );

    if (!elevenRes || typeof elevenRes.status !== 'number') {
      return json(502, { error: 'Bad response from ElevenLabs' });
    }

    if (elevenRes.status >= 400) {
      const detail = elevenRes.data ? Buffer.from(elevenRes.data).toString('utf8').slice(0, 1200) : '';
      return json(502, {
        error: 'ElevenLabs TTS failed',
        status: elevenRes.status,
        detail: detail || undefined
      });
    }

    const buf = Buffer.from(elevenRes.data);

    return response(
      200,
      {
        'content-type': 'audio/mpeg',
        'cache-control': 'no-store'
      },
      buf.toString('base64'),
      true
    );
  } catch (e) {
    return json(500, { error: 'ElevenLabs TTS request failed' });
  }
};
