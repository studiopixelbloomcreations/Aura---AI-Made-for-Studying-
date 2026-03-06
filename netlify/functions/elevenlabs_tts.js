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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  const modelFromBody = payload && payload.modelId ? String(payload.modelId).trim() : '';
  const modelFromEnv = String(process.env.ELEVENLABS_MODEL || '').trim();
  const outputFormat = String(process.env.ELEVENLABS_OUTPUT_FORMAT || 'mp3_44100_128').trim();
  const normalizedText = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 3800);
  const modelsToTry = [];
  if (modelFromBody) modelsToTry.push(modelFromBody);
  if (modelFromEnv && !modelsToTry.includes(modelFromEnv)) modelsToTry.push(modelFromEnv);
  if (!modelsToTry.includes('eleven_turbo_v2_5')) modelsToTry.push('eleven_turbo_v2_5');
  if (!modelsToTry.includes('eleven_flash_v2_5')) modelsToTry.push('eleven_flash_v2_5');
  if (!modelsToTry.includes('eleven_multilingual_v2')) modelsToTry.push('eleven_multilingual_v2');

  try {
    const requestOnce = async (modelId) => {
      const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${encodeURIComponent(outputFormat)}`;
      return axios.post(
        url,
        {
          text: normalizedText,
          model_id: modelId,
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
    };

    let lastStatus = 0;
    let lastDetail = '';
    let lastModel = '';
    for (const modelId of modelsToTry) {
      // Retry transient upstream failures for each model.
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        const elevenRes = await requestOnce(modelId);
        lastModel = modelId;
        if (!elevenRes || typeof elevenRes.status !== 'number') {
          lastStatus = 502;
          lastDetail = 'Bad response from ElevenLabs';
          if (attempt < 2) await sleep(220 * attempt);
          continue;
        }

        if (elevenRes.status < 400) {
          const buf = Buffer.from(elevenRes.data || []);
          if (!buf.length) {
            lastStatus = 502;
            lastDetail = 'Empty audio from ElevenLabs';
            if (attempt < 2) await sleep(220 * attempt);
            continue;
          }
          return response(
            200,
            {
              'content-type': 'audio/mpeg',
              'cache-control': 'no-store'
            },
            buf.toString('base64'),
            true
          );
        }

        lastStatus = elevenRes.status;
        lastDetail = elevenRes.data ? Buffer.from(elevenRes.data).toString('utf8').slice(0, 1200) : '';
        // Only retry transient upstream errors. Otherwise break to next model.
        if ([502, 503, 504, 429].includes(elevenRes.status) && attempt < 2) {
          await sleep(220 * attempt);
          continue;
        }
        break;
      }
    }

    return json(502, {
      error: 'ElevenLabs TTS failed',
      status: lastStatus || 502,
      model: lastModel || undefined,
      detail: lastDetail || undefined
    });
  } catch (e) {
    return json(500, { error: 'ElevenLabs TTS request failed', detail: String((e && e.message) || e || '') });
  }
};
