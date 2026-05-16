const { getUserProfile, getUserProfileByUniqueId, saveUserProfile } = require("../../core/agent_comm");
const { buildUserProfileRecord } = require("../../core/personalization_engine");
const { getCurrentUser } = require("../../core/identity_system");
const { generateUniqueId } = require("../../core/unique_id");
const { generateFailsafeIdentity } = require("../../core/failsafe_identity");
const { allowedOrigin } = require("../../core/env");
const { initLumenFile } = require("../../core/lumen_engine");

function json(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": allowedOrigin(),
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type,authorization,x-aevra-csrf",
      "cache-control": "no-store",
    },
    body: JSON.stringify(obj),
  };
}

function normalizeSavedProfile(profile) {
  if (!profile || typeof profile !== "object") return null;
  const personalization = profile.personalization_data && typeof profile.personalization_data === "object"
    ? profile.personalization_data
    : {};
  const aiConfig = profile.ai_config && typeof profile.ai_config === "object"
    ? profile.ai_config
    : {};
  const uniqueId = String(profile.unique_id || profile.unique_identifier || "").trim();
  return Object.assign({}, profile, {
    unique_id: uniqueId,
    unique_identifier: uniqueId,
    personalization_data: personalization,
    ai_config: aiConfig,
    user_config: Object.assign({}, profile.user_config || {}, {
      user_id: profile.user_id,
      unique_id: uniqueId,
      unique_identifier: uniqueId,
      personalization_data: personalization,
      ai_config: aiConfig,
    }),
  });
}

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });

  try {
    if (event.httpMethod === "GET") {
      const user_id = String((event.queryStringParameters && (event.queryStringParameters.user_id || event.queryStringParameters.userId)) || "").trim();
      const unique_id = String((event.queryStringParameters && (event.queryStringParameters.unique_id || event.queryStringParameters.uniqueId)) || "").trim();
      if (!user_id && !unique_id) {
        return json(400, { ok: false, success: false, error: "user_id or unique_id is required" });
      }
      const profile = normalizeSavedProfile(user_id ? await getUserProfile(user_id) : await getUserProfileByUniqueId(unique_id));
      
      // Initialize LUMEN file for this user if it doesn't exist
      if (profile && profile.unique_id) {
        const resolvedEmail = String(profile.identity?.email || profile.email || "guest@student.com");
        await initLumenFile(resolvedEmail, profile.unique_id, profile);
      }

      return json(200, {
        ok: true,
        success: true,
        profile,
        config: profile ? profile.user_config : null,
        data: { profile, config: profile ? profile.user_config : null },
        lumen_active: true
      });
    }

    if (event.httpMethod === "POST") {
      let payload = {};
      try {
        payload = JSON.parse(event.body || "{}");
      } catch (error) {
        return json(400, { ok: false, success: false, error: "Invalid JSON body" });
      }

      const identity = getCurrentUser(payload.identity || payload.user || payload) || {};
      const built = buildUserProfileRecord({
        ...payload,
        identity,
        user_id: payload.user_id || payload.userId || identity.user_id,
        answers: payload.answers || payload.personalization_answers || payload.onboarding_answers || {},
      });
      const unique_id = generateUniqueId({
        user_id: built.user_id,
        personalization_data: built.personalization_data,
        ai_config: built.ai_config,
      }) || generateFailsafeIdentity(built).unique_id;
      const saved = normalizeSavedProfile(await saveUserProfile(built.user_id, {
        personalization_data: built.personalization_data,
        ai_config: Object.assign({}, built.ai_config, {
          personalization_prompt: built.personalization_prompt,
        }),
        unique_id,
      }));

      // Initialize LUMEN file for this new user
      const resolvedEmail = String(identity.email || built.email || "guest@student.com");
      await initLumenFile(resolvedEmail, unique_id, saved);

      return json(200, {
        ok: true,
        success: true,
        profile: saved,
        config: saved ? saved.user_config : null,
        identity: {
          user_id: built.user_id,
          unique_id,
          unique_identifier: unique_id,
        },
        data: {
          profile: saved,
          config: saved ? saved.user_config : null,
        },
        lumen_active: true
      });
    }

    return json(405, { ok: false, success: false, error: "Method not allowed" });
  } catch (error) {
    return json(500, {
      ok: false,
      success: false,
      error: String(error && error.message ? error.message : error),
    });
  }
};
