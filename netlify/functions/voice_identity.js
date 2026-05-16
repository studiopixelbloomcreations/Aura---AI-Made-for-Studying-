const { ONBOARDING_PHRASES, enrollVoiceProfile, matchVoiceProfile } = require("../../core/voice_identity");

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
  if (event.httpMethod === "GET") return json(200, { ok: true, onboarding_phrases: ONBOARDING_PHRASES });
  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "Method not allowed" });

  let payload = {};
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  try {
    const action = String(payload.action || "match").toLowerCase();
    if (action === "enroll") {
      const profile = await enrollVoiceProfile(payload.user_id, payload.display_name, payload.phrase_samples || []);
      return json(200, { ok: true, profile });
    }
    const transcript = String(payload.transcript || payload.text || "").trim();
    if (!transcript) return json(400, { ok: false, error: "transcript is required" });
    const match = await matchVoiceProfile(transcript);
    return json(200, { ok: true, match });
  } catch (error) {
    return json(500, { ok: false, error: String(error && error.message ? error.message : error) });
  }
};
