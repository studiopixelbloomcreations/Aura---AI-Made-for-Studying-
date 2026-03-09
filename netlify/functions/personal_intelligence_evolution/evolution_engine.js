"use strict";

const {
  createExperienceRecord,
  createReinforcementScoreCard,
  nowIso,
  makeId,
} = require("./contracts");
const { buildMemorySnapshot } = require("./memory_facade");
const { initRegistries, listActiveVersions } = require("./tool_registry");
const { Analyzer } = require("./analyzer");
const { ProposalGenerator } = require("./proposal_generator");
const { SandboxRunner } = require("./sandbox_runner");
const { DeploymentManager } = require("./deployment_manager");
const { PersonalizationScorer } = require("./personalization_scorer");
const { getModelConfig } = require("./model_router");
const { runPIOsCycle } = require("./pi_os_controller");
const { runPhase2Cycle } = require("./phase2_orchestrator");
const { runPhases3To9 } = require("./phases_3_to_9_orchestrator");
const { runPCOSCycle } = require("./pcos_controller");

const runtimeState = {
  boot_at: nowIso(),
  interactions: 0,
  experiences: [],
  score_cards: {},
  frequent_requests: [],
  proposals: [],
  module_versions: [],
  registries: initRegistries(),
  audit: [],
  protected_files: [
    "core_brain",
    "security",
    "evolution_controller",
    "main_entrypoint",
  ],
};

function pushAudit(event, data) {
  runtimeState.audit.push({
    id: makeId("audit"),
    at: nowIso(),
    event: String(event || "event"),
    data: data && typeof data === "object" ? data : {},
  });
  if (runtimeState.audit.length > 1500) runtimeState.audit = runtimeState.audit.slice(-1500);
}

function updateFrequentRequests(message) {
  const text = String(message || "").toLowerCase();
  if (!text) return;
  const buckets = [];
  if (text.includes("homework") || text.includes("study") || text.includes("exam")) buckets.push("study_support");
  if (text.includes("spotify") || text.includes("music")) buckets.push("music");
  if (text.includes("direction") || text.includes("home") || text.includes("navigate")) buckets.push("navigation");
  if (!buckets.length) buckets.push("general");
  runtimeState.frequent_requests = runtimeState.frequent_requests.concat(buckets).slice(-200);
}

function updateReinforcement(record) {
  const moduleId = String(record && record.module_id || "brain.main");
  const prev = runtimeState.score_cards[moduleId];
  const card = createReinforcementScoreCard(moduleId, prev);
  const successDelta = record.success ? 2 : -3;
  const correctionDelta = record.corrected ? -2 : 0;
  const latencyPenalty = Number(record.latency_ms || 0) > 2600 ? -1 : 0;
  card.score = Math.max(-100, Math.min(100, card.score + successDelta + correctionDelta + latencyPenalty));
  if (record.success) card.success_count += 1;
  else card.failure_count += 1;
  if (record.corrected) card.correction_count += 1;
  card.total_latency_ms += Number(record.latency_ms || 0);
  card.updated_at = nowIso();
  runtimeState.score_cards[moduleId] = card;

  const domainMatch = Object.entries(runtimeState.registries).find(([, modules]) => modules && modules[moduleId]);
  if (domainMatch) {
    const domain = domainMatch[0];
    runtimeState.registries[domain][moduleId].score = card.score;
  }

  return card;
}

async function runEvolutionCycle(envelope, memorySnapshot) {
  const experiences = runtimeState.experiences.slice(-200);
  const weaknesses = Analyzer.detectWeaknesses(experiences, runtimeState.score_cards);
  const analysis = await Analyzer.summarizeWithBrain(weaknesses, envelope || {});

  if (!weaknesses.length) {
    return {
      triggered: false,
      weaknesses: [],
      analysis_summary: analysis.summary,
      analysis_model: analysis.model_used || "none",
      proposal_id: "",
      proposal_trace_id: "",
      outcome: "no_weakness",
    };
  }

  const top = weaknesses[0];
  const proposal = await ProposalGenerator.generate(top, {
    memory_summary: {
      short_term_size: (memorySnapshot.short_term_memory && memorySnapshot.short_term_memory.recent_conversation || []).length,
      experience_count: (memorySnapshot.experience_memory || []).length,
      skill_count: (memorySnapshot.skill_memory || []).length,
    },
  });
  runtimeState.proposals.push(proposal);

  const evaluation = await SandboxRunner.evaluate(proposal, runtimeState);
  const promotion = DeploymentManager.promote(proposal.id, runtimeState, evaluation);

  pushAudit("evolution_cycle", {
    weakness: top,
    analysis_model: analysis.model_used || "none",
    proposal_id: proposal.id,
    proposal_status: proposal.status,
    evaluation_passed: !!evaluation.passed,
    promotion_ok: !!promotion.ok,
  });

  return {
    triggered: true,
    weaknesses,
    analysis_summary: analysis.summary,
    analysis_model: analysis.model_used || "none",
    proposal_id: proposal.id,
    proposal_trace_id: proposal.trace_id,
    proposal_status: proposal.status,
    outcome: promotion.ok ? "deployed" : "rejected",
    evaluation,
  };
}

const EvolutionEngine = {
  async processInteraction(interactionEnvelope) {
    const envelope = interactionEnvelope && typeof interactionEnvelope === "object" ? interactionEnvelope : {};
    runtimeState.interactions += 1;
    updateFrequentRequests(envelope.message);

    const record = createExperienceRecord(envelope);
    runtimeState.experiences.push(record);
    if (runtimeState.experiences.length > 500) {
      runtimeState.experiences = runtimeState.experiences.slice(-500);
    }

    const card = updateReinforcement(record);
    const memorySnapshot = buildMemorySnapshot({
      known_facts: envelope.known_facts,
      profile: envelope.profile,
      history: envelope.history,
      language: envelope.language,
      subject: envelope.subject,
      current_task: envelope.current_task,
      action_type: record.action_type,
    }, runtimeState);

    const personalization = PersonalizationScorer.score(memorySnapshot);
    const evolution = await runEvolutionCycle(envelope, memorySnapshot);
    const piOs = runPIOsCycle(runtimeState, envelope, memorySnapshot, evolution.weaknesses || []);
    const phase2 = await runPhase2Cycle(envelope);
    const phases3to9 = await runPhases3To9(envelope, memorySnapshot, phase2);
    const pcos = await runPCOSCycle(envelope, {
      memorySnapshot,
      phase2Status: phase2,
      rollout_mode: phases3to9 && phases3to9.phase9_governed_rollout ? phases3to9.phase9_governed_rollout.rollout_mode : "",
    });

    return {
      evolution_status: {
        mode: "netlify_simulated_runtime",
        automatic: true,
        trigger_policy: "every_interaction",
        interaction_index: runtimeState.interactions,
        latest_experience_id: record.id,
        reinforcement: {
          module_id: card.module_id,
          score: card.score,
          success_count: card.success_count,
          failure_count: card.failure_count,
          correction_count: card.correction_count,
        },
        cycle: evolution,
        personalization,
        protected_components: runtimeState.protected_files,
        stage_brains: getModelConfig(),
      },
      active_module_versions: listActiveVersions(runtimeState.registries),
      proposal_trace_id: evolution.proposal_trace_id || "",
      memory_snapshot: memorySnapshot,
      pi_os_status: piOs,
      phase2_status: phase2,
      phases_3_to_9_status: phases3to9,
      pcos_status: pcos && pcos.pcos_status ? pcos.pcos_status : undefined,
      cognitive_trace_id: pcos && pcos.cognitive_trace_id ? pcos.cognitive_trace_id : "",
      twin_state_version: pcos && pcos.twin_state_version ? pcos.twin_state_version : 0,
      research_report_id: pcos && pcos.research_report_id ? pcos.research_report_id : "",
      governance_decision_id: pcos && pcos.governance_decision_id ? pcos.governance_decision_id : "",
    };
  },
};

module.exports = {
  EvolutionEngine,
};
