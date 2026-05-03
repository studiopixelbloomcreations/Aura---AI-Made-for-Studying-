const { env, allowedOrigin } = require("../../core/env");
const logger = require("../../core/logger");

function json(statusCode, obj) {
  const normalized = Object.prototype.hasOwnProperty.call(obj || {}, "success") ? obj : { success: statusCode < 400, data: statusCode < 400 ? obj : null, error: statusCode < 400 ? null : (obj && obj.error || "Request failed") };
  return { statusCode, headers: { "content-type": "application/json", "access-control-allow-origin": allowedOrigin(), "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "content-type,authorization,x-aevra-csrf" }, body: JSON.stringify(normalized) };
}
exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  try {
    const base = String(env("SUPABASE_URL", "")).replace(/\/$/, "");
    const key = env("SUPABASE_SERVICE_KEY") || env("SUPABASE_ANON_KEY");
    const userId = String((event.queryStringParameters && (event.queryStringParameters.userId || event.queryStringParameters.user_id)) || "").trim();
    if (!base || !key || !userId) return json(200, { success: true, data: { nodes: [], edges: [] }, error: null });
    const res = await fetch(`${base}/rest/v1/conversation_sessions?user_id=eq.${encodeURIComponent(userId)}&select=metadata`, { headers: { apikey: key, authorization: `Bearer ${key}` } });
    const rows = await res.json().catch(() => []);
    const graph = { nodes: [], edges: [] };
    rows.forEach((row) => {
      const m = row.metadata || {};
      if (Array.isArray(m.nodes)) graph.nodes.push(...m.nodes);
      if (Array.isArray(m.edges)) graph.edges.push(...m.edges);
    });
    return json(200, { success: true, data: graph, error: null });
  } catch (error) {
    logger.error("memory_graph", { error: String(error && error.stack || error) });
    return json(500, { success: false, data: null, error: "Memory graph is unavailable right now." });
  }
};
