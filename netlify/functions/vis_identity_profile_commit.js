const { allowedOrigin } = require("../../core/env");
const logger = require("../../core/logger");

function json(statusCode, obj) {
  const normalized = Object.prototype.hasOwnProperty.call(obj || {}, "success") ? obj : { success: statusCode < 400, data: statusCode < 400 ? obj : null, error: statusCode < 400 ? null : (obj && obj.error || "Request failed") };
  return { statusCode, headers: { "content-type": "application/json", "access-control-allow-origin": allowedOrigin(), "access-control-allow-methods": "POST,OPTIONS", "access-control-allow-headers": "content-type,authorization,x-aevra-csrf" }, body: JSON.stringify(normalized) };
}

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") return json(200, { success: true, data: {}, error: null });
  if (event.httpMethod !== "POST") return json(405, { success: false, data: null, error: "Method not allowed" });
  try {
    const payload = JSON.parse(event.body || "{}");
    logger.info("vis_identity_profile_commit", { userId: payload.userId || payload.user_id || "unknown" });
    return json(200, { success: true, data: { accepted: true }, error: null, ok: true });
  } catch (error) {
    logger.error("vis_identity_profile_commit", { error: String(error && error.stack || error) });
    return json(400, { success: false, data: null, error: "Invalid identity profile payload." });
  }
};
