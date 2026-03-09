const { CloudStateStore } = require("./personal_intelligence_evolution/cloud_state_store");
const { requireAdmin, enforceRateLimit } = require("./personal_intelligence_evolution/security_ops");

function json(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type,authorization",
    },
    body: JSON.stringify(obj),
  };
}

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });
  const rl = enforceRateLimit(event, "governance", Number(process.env.PI_GOV_RATE_LIMIT_PER_MIN || 60), 60000);
  if (!rl.allowed) return json(429, { error: "Rate limit exceeded", rate_limit: rl });
  const auth = requireAdmin(event);
  if (!auth.ok) return json(401, { error: auth.reason });

  const store = new CloudStateStore();
  const docs = [
    "swarm_task_queue",
    "distributed_swarm_state",
    "deep_research_reports",
    "research_index",
    "citation_traces",
    "digital_twin_state",
    "life_timeline",
    "cognitive_traces",
    "knowledge_universe",
    "multilayer_graph",
    "strategic_memory",
    "agent_civilization_async",
    "sri_lanka_layer",
    "governed_rollout",
    "governance_decisions",
    "architecture_rfc",
  ];
  const out = {};

  for (const key of docs) {
    const res = await store.readDoc(key, {});
    out[key] = res && res.ok ? res.doc : { error: String(res && res.error || "read_failed") };
  }

  return json(200, {
    ok: true,
    storage_mode: store.enabled ? "github" : "memory_fallback",
    base_path: store.basePath,
    state: out,
  });
};
