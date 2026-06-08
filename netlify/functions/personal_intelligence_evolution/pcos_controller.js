const { env } = require("../../../core/env");
"use strict";

const { CloudStateStore } = require("./cloud_state_store");
const { routeRequest } = require("./hybrid_router");
const { appendObservabilityEvent } = require("./observability");
const { CognitiveOrchestrator } = require("./cognitive/cognitive_orchestrator");
const { DigitalTwinEngine } = require("./twin/digital_twin_engine");
const { LifeDataEngine } = require("./life_data/life_data_engine");
const { updateKnowledgeUniverse } = require("./knowledge/knowledge_universe_reasoner");
const { runAgentCivilizationSplit } = require("./agents/agent_civilization_split");
const { ResearchEngine } = require("./research/research_engine");
const { GovernanceEngine } = require("./governance/governance_engine");

const { runHierarchy } = require("./agi/hierarchical_reasoning_v2");
const { runMetaLearning } = require("./agi/meta_learning_engine");
const { estimateCognitiveLoad } = require("./agi/cognitive_load_engine");
const { evolveIdea } = require("./agi/idea_evolution_engine");
const { runLifeExperiment } = require("./agi/life_experiment_engine");
const { appendArchitectureRfc } = require("./agi/architecture_rfc_engine");
const { getFederationState } = require("./agi/federation_interface");

function isCloudOnly() {
  const mode = String(env("PI_RUNTIME_MODE") || "cloud_only").trim().toLowerCase();
  return mode === "cloud_only";
}

async function runPCOSCycle(envelope, context) {
  const store = new CloudStateStore();
  const route = routeRequest(envelope);
  const safetyCloudOnly = isCloudOnly() && route.target === "cloud";

  const twin = await DigitalTwinEngine.update(envelope, context || {}, store);
  const cognitive = CognitiveOrchestrator.run(envelope, {
    memory_snapshot: context && context.memorySnapshot ? context.memorySnapshot : {},
    route,
    twin_state: twin && twin.twin_state ? twin.twin_state : {},
    rollout_mode: context && context.rollout_mode ? context.rollout_mode : "",
  });
  const traceLoaded = await store.readDoc("cognitive_traces", { traces: [] });
  if (traceLoaded.ok) {
    const traceDoc = traceLoaded.doc && typeof traceLoaded.doc === "object" ? traceLoaded.doc : { traces: [] };
    traceDoc.traces = Array.isArray(traceDoc.traces) ? traceDoc.traces : [];
    traceDoc.traces.push({
      id: cognitive.cognitive_trace_id,
      at: new Date().toISOString(),
      stages: cognitive.stages,
      intents: cognitive.perception && cognitive.perception.intents ? cognitive.perception.intents : [],
    });
    if (traceDoc.traces.length > 2500) traceDoc.traces = traceDoc.traces.slice(-2500);
    await store.writeDoc("cognitive_traces", traceDoc, traceLoaded.sha || "", "pcos: append cognitive trace");
  }
  const life = await LifeDataEngine.record({
    message: envelope && envelope.message,
    success: envelope && envelope.success,
    latency_ms: envelope && envelope.latency_ms,
    outcomes: { tags: cognitive.perception && cognitive.perception.intents ? cognitive.perception.intents : [] },
  }, store);
  const universe = await updateKnowledgeUniverse(store, envelope);
  const agents = await runAgentCivilizationSplit(envelope, {
    hints: universe && universe.hints ? universe.hints : [],
  });

  const research = await ResearchEngine.run(envelope, {
    timeout_ms: Number(env("PI_RESEARCH_FETCH_TIMEOUT_MS") || 6000),
    max_depth: Number(env("PI_RESEARCH_MAX_DEPTH") || 2),
    budget: Number(env("PI_RESEARCH_BUDGET") || 6),
    allowlist: String(env("PI_RESEARCH_ALLOWLIST") || "").split(",").map((s) => s.trim()).filter(Boolean),
    denylist: String(env("PI_RESEARCH_DENYLIST") || "").split(",").map((s) => s.trim()).filter(Boolean),
    trust_threshold: Number(env("PI_RESEARCH_TRUST_THRESHOLD") || 0.25),
  }, store);

  const governance = await GovernanceEngine.evaluate({
    safety_ok: safetyCloudOnly,
    dead_letter_count: context && context.phase2Status && context.phase2Status.queue
      ? Number(context.phase2Status.queue.dead_letter_count || 0)
      : 0,
    failed_agents: 0,
  }, store);

  const agiEnabled = String(env("PI_ENABLE_AGI_EXTENSIONS") || "true").trim().toLowerCase() === "true";
  let agi = {};
  if (agiEnabled) {
    const hierarchy = runHierarchy(envelope);
    const meta = await runMetaLearning(store, envelope);
    const load = estimateCognitiveLoad(envelope);
    const idea = evolveIdea(envelope && envelope.message);
    const experiment = await runLifeExperiment(store, envelope);
    const rfc = await appendArchitectureRfc(store, envelope, governance);
    const federation = getFederationState();
    agi = {
      hierarchical_reasoning_v2: hierarchy,
      meta_learning: meta,
      cognitive_load: load,
      idea_evolution: idea,
      life_experiment: experiment,
      architecture_rfc: rfc,
      federation,
    };
  }

  try {
    await appendObservabilityEvent(store, "pcos_cycle", {
      cloud_only: safetyCloudOnly,
      cognitive_trace_id: cognitive.cognitive_trace_id,
      twin_state_version: twin && twin.twin_state_version ? twin.twin_state_version : 0,
      research_report_id: research && research.report_id ? research.report_id : "",
      governance_decision_id: governance && governance.governance_decision_id ? governance.governance_decision_id : "",
    });
  } catch (e) {}

  return {
    pcos_status: {
      mode: "cloud_only",
      model_routing: "gemini_native",
      cloud_policy_enforced: safetyCloudOnly,
      route,
      cognitive: {
        stages: cognitive.stages,
      },
      digital_twin: {
        version: twin && twin.twin_state_version ? twin.twin_state_version : 0,
      },
      life_data: {
        event_id: life && life.event_id ? life.event_id : "",
      },
      knowledge_universe: {
        hints: universe && universe.hints ? universe.hints : [],
      },
      agents,
      research: {
        triggered: !!(research && research.triggered),
        report_id: research && research.report_id ? research.report_id : "",
      },
      governance: {
        decision_id: governance && governance.governance_decision_id ? governance.governance_decision_id : "",
        mode: governance && governance.mode ? governance.mode : "",
      },
      agi_extensions: agi,
    },
    cognitive_trace_id: cognitive.cognitive_trace_id,
    twin_state_version: twin && twin.twin_state_version ? twin.twin_state_version : 0,
    research_report_id: research && research.report_id ? research.report_id : "",
    governance_decision_id: governance && governance.governance_decision_id ? governance.governance_decision_id : "",
  };
}

module.exports = {
  runPCOSCycle,
};
