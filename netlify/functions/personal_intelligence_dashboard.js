const { CloudStateStore } = require("./personal_intelligence_evolution/cloud_state_store");
const { requireAdmin, enforceRateLimit } = require("./personal_intelligence_evolution/security_ops");

function json(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,OPTIONS",
      "access-control-allow-headers": "content-type,authorization,x-admin-token",
    },
    body: JSON.stringify(obj),
  };
}

function toNum(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });

  const rl = enforceRateLimit(event, "dashboard", Number(process.env.PI_DASH_RATE_LIMIT_PER_MIN || 120), 60000);
  if (!rl.allowed) return json(429, { error: "Rate limit exceeded", rate_limit: rl });

  const auth = requireAdmin(event);
  if (!auth.ok) return json(401, { error: auth.reason });

  const qs = event.queryStringParameters || {};
  const limit = Math.max(10, Math.min(500, toNum(qs.limit, 80)));
  const offset = Math.max(0, toNum(qs.offset, 0));
  const store = new CloudStateStore();

  const keys = [
    "swarm_task_queue",
    "distributed_swarm_state",
    "deep_research_reports",
    "research_index",
    "citation_traces",
    "governed_rollout",
    "governance_decisions",
    "digital_twin_state",
    "life_timeline",
    "cognitive_traces",
    "knowledge_universe",
    "architecture_rfc",
    "observability_events",
  ];
  const docs = {};
  for (const k of keys) {
    const got = await store.readDoc(k, {});
    docs[k] = got && got.ok ? got.doc : {};
  }

  const events = Array.isArray(docs.observability_events && docs.observability_events.events)
    ? docs.observability_events.events
    : [];
  const page = events.slice(Math.max(0, events.length - offset - limit), Math.max(0, events.length - offset));

  return json(200, {
    ok: true,
    storage_mode: store.enabled ? "github" : "memory_fallback",
    dashboard: {
      queue: docs.swarm_task_queue || {},
      swarm: docs.distributed_swarm_state || {},
      research: docs.deep_research_reports || {},
      research_index: docs.research_index || {},
      citation_traces: docs.citation_traces || {},
      rollout: docs.governed_rollout || {},
      governance_decisions: docs.governance_decisions || {},
      digital_twin_state: docs.digital_twin_state || {},
      life_timeline: docs.life_timeline || {},
      cognitive_traces: docs.cognitive_traces || {},
      knowledge_universe: docs.knowledge_universe || {},
      architecture_rfc: docs.architecture_rfc || {},
      observability_page: page,
      observability_total: events.length,
      pagination: { limit, offset },
    },
  });
};
