const { computeReadiness } = require("./personal_intelligence_evolution/production_readiness");
const { CloudStateStore } = require("./personal_intelligence_evolution/cloud_state_store");
const { enforceRateLimit } = require("./personal_intelligence_evolution/security_ops");
const { getProviderAvailability } = require("../../core/model_api_registry");

function json(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,OPTIONS",
      "access-control-allow-headers": "content-type,authorization",
    },
    body: JSON.stringify(obj),
  };
}

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });
  const rl = enforceRateLimit(event, "health", Number(process.env.PI_HEALTH_RATE_LIMIT_PER_MIN || 120), 60000);
  if (!rl.allowed) return json(429, { error: "Rate limit exceeded", rate_limit: rl });

  const readiness = computeReadiness();
  const store = new CloudStateStore();
  const queue = await store.readDoc("swarm_task_queue", { tasks: [], dead_letter: [], metrics: {} });
  const rollout = await store.readDoc("governed_rollout", { events: [] });
  const twin = await store.readDoc("digital_twin_state", { version: 0 });
  const traces = await store.readDoc("cognitive_traces", { traces: [] });
  const gov = await store.readDoc("governance_decisions", { decisions: [] });
  const modelApiAvailability = getProviderAvailability();

  return json(200, {
    ok: true,
    production_readiness: readiness,
    model_api_availability: modelApiAvailability,
    storage_mode: store.enabled ? "github" : "memory_fallback",
    queue_summary: {
      task_count: queue && queue.ok && queue.doc && Array.isArray(queue.doc.tasks) ? queue.doc.tasks.length : 0,
      dead_letter_count: queue && queue.ok && queue.doc && Array.isArray(queue.doc.dead_letter) ? queue.doc.dead_letter.length : 0,
      metrics: queue && queue.ok && queue.doc && queue.doc.metrics ? queue.doc.metrics : {},
    },
    rollout_summary: {
      events: rollout && rollout.ok && rollout.doc && Array.isArray(rollout.doc.events) ? rollout.doc.events.length : 0,
      latest: rollout && rollout.ok && rollout.doc && Array.isArray(rollout.doc.events) && rollout.doc.events.length
        ? rollout.doc.events[rollout.doc.events.length - 1]
        : null,
    },
    pcos_summary: {
      twin_state_version: twin && twin.ok && twin.doc ? Number(twin.doc.version || 0) : 0,
      cognitive_trace_count: traces && traces.ok && traces.doc && Array.isArray(traces.doc.traces) ? traces.doc.traces.length : 0,
      governance_decision_count: gov && gov.ok && gov.doc && Array.isArray(gov.doc.decisions) ? gov.doc.decisions.length : 0,
    },
  });
};
