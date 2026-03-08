"use strict";

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  const p = String(prefix || "id").trim() || "id";
  const rand = Math.random().toString(36).slice(2, 10);
  const ts = Date.now().toString(36);
  return `${p}_${ts}_${rand}`;
}

function clampNumber(v, lo, hi, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  if (Number.isFinite(lo) && n < lo) return lo;
  if (Number.isFinite(hi) && n > hi) return hi;
  return n;
}

function createExperienceRecord(envelope) {
  const src = envelope && typeof envelope === "object" ? envelope : {};
  const ts = src.timestamp ? String(src.timestamp) : nowIso();
  const message = String(src.message || "").slice(0, 2000);
  const response = String(src.response || "").slice(0, 2000);
  const moduleId = String(src.module_id || (src.action && src.action.type) || "brain.main");
  const success = !!src.success;
  const corrected = !!src.corrected;
  const latencyMs = clampNumber(src.latency_ms, 0, 120000, 0);
  return {
    id: makeId("exp"),
    timestamp: ts,
    user_request: message,
    ai_response: response,
    success,
    corrected,
    latency_ms: latencyMs,
    module_id: moduleId,
    action_type: src.action && src.action.type ? String(src.action.type) : "",
    ai_provider: String(src.ai_provider || ""),
    ai_error: String(src.ai_error || "").slice(0, 600),
  };
}

function createReinforcementScoreCard(moduleId, prev) {
  const base = prev && typeof prev === "object" ? prev : {};
  return {
    module_id: String(moduleId || base.module_id || "unknown"),
    score: clampNumber(base.score, -100, 100, 0),
    success_count: clampNumber(base.success_count, 0, 1e9, 0),
    failure_count: clampNumber(base.failure_count, 0, 1e9, 0),
    correction_count: clampNumber(base.correction_count, 0, 1e9, 0),
    total_latency_ms: clampNumber(base.total_latency_ms, 0, 1e12, 0),
    updated_at: String(base.updated_at || nowIso()),
  };
}

function createModuleVersionRecord(moduleId, version, proposalId, data) {
  return {
    module_id: String(moduleId || ""),
    version: String(version || "v1"),
    proposal_id: String(proposalId || ""),
    promoted_at: nowIso(),
    runtime_data: data && typeof data === "object" ? data : {},
  };
}

function createEvolutionProposal(weakness, patchSpec, expectedBenefit, modelUsed) {
  const w = weakness && typeof weakness === "object" ? weakness : {};
  return {
    id: makeId("proposal"),
    trace_id: makeId("trace"),
    created_at: nowIso(),
    status: "pending",
    problem_detected: String(w.problem || "unknown weakness"),
    module_responsible: String(w.module_id || "unknown"),
    severity: String(w.severity || "medium"),
    weakness_type: String(w.type || "general"),
    patch_spec: patchSpec && typeof patchSpec === "object" ? patchSpec : {},
    expected_benefit: String(expectedBenefit || "Improve module reliability and speed."),
    model_used: String(modelUsed || "gemini-1.5-pro"),
    evaluation: null,
    promotion: null,
  };
}

module.exports = {
  nowIso,
  makeId,
  clampNumber,
  createExperienceRecord,
  createReinforcementScoreCard,
  createModuleVersionRecord,
  createEvolutionProposal,
};
