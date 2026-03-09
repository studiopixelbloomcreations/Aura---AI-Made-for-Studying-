"use strict";

function sanitizeModelId(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  if (!/^[A-Za-z0-9._-]{3,120}$/.test(s)) return "";
  return s;
}

function getModelConfig() {
  const strict = String(process.env.PI_STRICT_PUTER_ONLY || "true").trim().toLowerCase() === "true";
  return {
    provider: "puter",
    strict_puter_only: strict,
    main: sanitizeModelId(process.env.PI_MAIN_BRAIN_MODEL || "gemini-3-pro-preview") || "gemini-3-pro-preview",
    main_fallback: sanitizeModelId(process.env.PI_MAIN_BRAIN_FALLBACK_MODEL || "gemini-3-pro-preview") || "gemini-3-pro-preview",
    analysis: sanitizeModelId(process.env.PI_ANALYSIS_BRAIN_MODEL || "gemini-3-pro-preview") || "gemini-3-pro-preview",
    proposal: sanitizeModelId(process.env.PI_PROPOSAL_BRAIN_MODEL || "gemini-3-pro-preview") || "gemini-3-pro-preview",
    test: sanitizeModelId(process.env.PI_TEST_BRAIN_MODEL || "gemini-3-pro-preview") || "gemini-3-pro-preview",
  };
}

async function generateStageText(stage, prompt, options) {
  const opts = options && typeof options === "object" ? options : {};
  const cfg = getModelConfig();
  const stageKey = String(stage || "proposal").trim().toLowerCase();
  const model = cfg[stageKey] || cfg.proposal;
  const injected = String(opts.puter_text || "").trim();
  const injectedProvider = String(opts.provider || "puter").trim().toLowerCase();
  if (cfg.strict_puter_only && injectedProvider !== "puter") {
    return {
      ok: false,
      text: "",
      model_used: model,
      error: "PUTER_ONLY_POLICY: non-puter provider blocked",
    };
  }
  if (!injected) {
    return {
      ok: false,
      text: "",
      model_used: model,
      error: "PUTER_REQUIRED: stage text must come from Puter client",
    };
  }
  return { ok: true, text: injected, model_used: model, error: "" };
}

module.exports = {
  sanitizeModelId,
  getModelConfig,
  generateStageText,
};
