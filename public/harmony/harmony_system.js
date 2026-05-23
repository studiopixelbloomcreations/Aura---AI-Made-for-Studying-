(function () {
  "use strict";

  const state = {
    active: false,
    workflow: "idle",
    models: [],
    confidence: 0,
    routing: [],
    ncs: null,
    memory: [],
    fusion: "idle",
    updated_at: "",
  };

  function clone(value) {
    try { return JSON.parse(JSON.stringify(value)); } catch (e) { return value; }
  }

  function summarizeModels(harmony) {
    const plans = harmony && Array.isArray(harmony.query_plans) ? harmony.query_plans : [];
    const seen = new Set();
    plans.forEach(function (plan) {
      (Array.isArray(plan.attempts) ? plan.attempts : []).forEach(function (attempt) {
        if (attempt && attempt.model) seen.add(String(attempt.model));
      });
      if (plan && plan.model_used) seen.add(String(plan.model_used));
    });
    if (harmony && harmony.model_used) seen.add(String(harmony.model_used));
    return Array.from(seen);
  }

  function ingest(detail) {
    const d = detail && typeof detail === "object" ? detail : {};
    const harmony = d.agent_harmony || d.harmony || {};
    const ncs = d.ncs || harmony.ncs || null;
    const systemState = ncs && (ncs.system_state || ncs.systemState) || {};
    state.active = true;
    state.workflow = String(systemState.systemType || (d.observatory && d.observatory.type) || "conversation");
    state.confidence = Number(systemState.confidence || 0);
    state.models = summarizeModels(harmony);
    state.routing = (Array.isArray(harmony.query_plans) ? harmony.query_plans : []).map(function (plan) {
      return {
        query_id: plan.query_id,
        type: plan.type,
        complexity: plan.complexity,
        model_used: plan.model_used,
        fallback_used: !!plan.fallback_used,
      };
    });
    state.ncs = clone(ncs);
    state.memory = Object.keys((d.learned_facts || d.memory_updates || {})).slice(0, 12);
    state.fusion = state.models.length > 1 ? "response_fusion" : "single_model_verified";
    state.updated_at = new Date().toISOString();
    window.dispatchEvent(new CustomEvent("aevra:harmony-state", { detail: clone(state) }));
  }

  window.AuraHarmonySystem = {
    ingest,
    getState: function () { return clone(state); },
  };

  window.addEventListener("pi:harmony-debug", function (event) {
    ingest(event && event.detail || {});
  });
})();
