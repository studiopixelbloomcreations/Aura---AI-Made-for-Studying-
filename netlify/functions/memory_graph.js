function json(statusCode, obj) { return { statusCode, headers: { "content-type": "application/json", "access-control-allow-origin": process.env.ALLOWED_ORIGINS || "http://localhost:5500", "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "content-type,authorization,x-aevra-csrf" }, body: JSON.stringify(obj) }; }
exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  try {
    const base = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
    const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
    const userId = String((event.queryStringParameters && (event.queryStringParameters.userId || event.queryStringParameters.user_id)) || "").trim();
    if (!base || !key || !userId) return json(200, { nodes: [], edges: [] });
    const res = await fetch(`${base}/rest/v1/conversation_sessions?user_id=eq.${encodeURIComponent(userId)}&select=metadata`, { headers: { apikey: key, authorization: `Bearer ${key}` } });
    const rows = await res.json().catch(() => []);
    const graph = { nodes: [], edges: [] };
    rows.forEach((row) => {
      const m = row.metadata || {};
      if (Array.isArray(m.nodes)) graph.nodes.push(...m.nodes);
      if (Array.isArray(m.edges)) graph.edges.push(...m.edges);
    });
    return json(200, graph);
  } catch (error) {
    console.error(JSON.stringify({ at: new Date().toISOString(), fn: "memory_graph", error: String(error && error.stack || error) }));
    return json(500, { error: "Memory graph is unavailable right now." });
  }
};
