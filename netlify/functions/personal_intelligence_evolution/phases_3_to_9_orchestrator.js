"use strict";

const { CloudStateStore } = require("./cloud_state_store");
const { SwarmTaskQueue } = require("./swarm_task_queue");
const { runSwarmWorkerTick } = require("./cloud_swarm_worker");
const { runDistributedSwarm } = require("./distributed_swarm");
const { ResearchEngine } = require("./research/research_engine");
const { updateMultiLayerGraph } = require("./multilayer_graph_reasoner");
const { runStrategicPlanner } = require("./strategic_memory_planner");
const { runAgentCivilizationAsync } = require("./agent_civilization_async");
const { runSriLankaLayer } = require("./sri_lanka_intelligence");
const { GovernanceEngine } = require("./governance/governance_engine");
const { appendObservabilityEvent } = require("./observability");

async function runPhases3To9(envelope, memorySnapshot, phase2Status) {
  const store = new CloudStateStore();
  const queue = new SwarmTaskQueue(store);

  const phase3 = await runDistributedSwarm(
    store,
    queue,
    async (q, opts) => runSwarmWorkerTick(q, { graph_summary: phase2Status && phase2Status.graph }, opts),
    { worker_count: Number(process.env.PI_SWARM_WORKER_COUNT || 3) }
  );

  const phase4 = await ResearchEngine.run(envelope, {
    timeout_ms: Number(process.env.PI_RESEARCH_FETCH_TIMEOUT_MS || 6000),
    max_depth: Number(process.env.PI_RESEARCH_MAX_DEPTH || 2),
    budget: Number(process.env.PI_RESEARCH_BUDGET || 6),
    allowlist: String(process.env.PI_RESEARCH_ALLOWLIST || "").split(",").map((s) => s.trim()).filter(Boolean),
    denylist: String(process.env.PI_RESEARCH_DENYLIST || "").split(",").map((s) => s.trim()).filter(Boolean),
    trust_threshold: Number(process.env.PI_RESEARCH_TRUST_THRESHOLD || 0.25),
  }, store);
  const phase5Graph = await updateMultiLayerGraph(store, envelope, memorySnapshot);
  const phase5Strategy = await runStrategicPlanner(store, envelope);
  const phase6 = await runAgentCivilizationAsync(store, envelope, { research_triggered: !!(phase4 && phase4.triggered) });
  const phase8 = await runSriLankaLayer(store, envelope);
  const phase9 = await GovernanceEngine.evaluate({
    safety_ok: true,
    failed_agents: 0,
    queue: phase2Status && phase2Status.queue ? phase2Status.queue : {},
    dead_letter_count: phase2Status && phase2Status.queue ? Number(phase2Status.queue.dead_letter_count || 0) : 0,
  }, store);
  try {
    await appendObservabilityEvent(store, "phase_3_to_9_cycle", {
      phase3_ok: !!(phase3 && phase3.ok),
      phase4_triggered: !!(phase4 && phase4.triggered),
      phase5_graph_ok: !!(phase5Graph && phase5Graph.ok),
      phase6_ok: !!(phase6 && phase6.ok),
      phase8_ok: !!(phase8 && phase8.ok),
      rollout_mode: phase9 && phase9.mode ? phase9.mode : "",
      rollout_risk: Number(phase9 && phase9.risk_score || 0),
    });
  } catch (e) {}

  return {
    phase3_distributed_swarm: phase3,
    phase4_deep_research: phase4,
    phase5_multilayer_graph: phase5Graph,
    phase5_strategic_memory: phase5Strategy,
    phase6_agent_civilization_async: phase6,
    phase7_dashboard_state: {
      ok: true,
      available_function: "/.netlify/functions/personal_intelligence_dashboard",
      governance_function: "/.netlify/functions/personal_intelligence_governance",
      note: "History drill-down and governance controls available via dashboard and governance endpoints.",
    },
    phase8_sri_lanka_intelligence: phase8,
    phase9_governed_rollout: {
      ok: !!(phase9 && phase9.ok),
      rollout_mode: phase9 && phase9.mode ? phase9.mode : "",
      risk_score: Number(phase9 && phase9.risk_score || 0),
      governance_decision_id: phase9 && phase9.governance_decision_id ? phase9.governance_decision_id : "",
    },
  };
}

module.exports = {
  runPhases3To9,
};
