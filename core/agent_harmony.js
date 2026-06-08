"use strict";

const { getProviderAvailability } = require("./model_api_registry");
const { detectSystemState, buildCognitiveBlueprint, compileCognitivePrompt } = require("./ncs_engine");
const logger = require("./logger");

/**
 * Harmony Agent — Parallel multi-model execution with confidence scoring.
 *
 * Architecture:
 *   1. Determine preferred models based on query analysis
 *   2. Fire ALL eligible models in parallel (Promise.allSettled)
 *   3. Score each response for confidence (length, coherence, latency)
 *   4. If multi-model mode: synthesize via leader council role
 *   5. Return best response with metadata
 *
 * Council roles (from aura_identity.py):
 *   teacher, reasoning, critic, explanation, coach, leader
 */

// ---------------------------------------------------------------------------
// Council role assignments per query type
// ---------------------------------------------------------------------------

const COUNCIL_ROLES = {
  teacher:     "Creates knowledge responses with clear explanations",
  reasoning:   "Deep step-by-step analytical thinking",
  critic:      "Finds mistakes, validates accuracy, challenges assumptions",
  explanation: "Simplifies complex answers into digestible pieces",
  coach:       "Gives encouragement, study tips, and recommendations",
  leader:      "Synthesizes all perspectives into the final best answer",
};

const MODEL_PRIORITY = {
  casual:        ["gemini", "grok"],
  deep_research: ["gemini", "deepseek", "openrouter"],
  tutorial:      ["gemini", "mistral", "openrouter"],
  coding:        ["gemini", "openrouter", "deepseek"],
  creative:      ["gemini", "grok", "huggingface"],
};

// Map model providers to default council roles
const DEFAULT_MODEL_ROLES = {
  groq:         "reasoning",
  openrouter:   "teacher",
  grok:         "explanation",
  mistral:      "coach",
  huggingface:  "critic",
  deepseek:     "reasoning",
  gemini:       "leader",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildCouncilPrompt(query, analysis, personalizationPrompt = "") {
  return [
    "You are part of an AI council.",
    "Collaborate and produce the best possible answer.",
    "Return a unified final response only.",
    `Query type: ${String(analysis.type || "casual")}`,
    `Complexity: ${String(analysis.complexity || "low")}`,
    personalizationPrompt ? `Personalization:\n${personalizationPrompt}` : "",
    `User query: ${String(query || "").trim()}`,
  ].filter(Boolean).join("\n\n");
}

function preferredModelsFor(analysis = {}) {
  const preferred = MODEL_PRIORITY[String(analysis.type || "casual")] || ["grok"];
  const availability = getProviderAvailability();
  return preferred.concat(
    Object.keys(availability).filter((name) => availability[name] && !preferred.includes(name))
  );
}

function roleForModel(modelName, blueprintRoles = {}) {
  if (blueprintRoles[modelName]) return blueprintRoles[modelName];
  return DEFAULT_MODEL_ROLES[modelName] || "reasoning";
}

async function tryAdapter(modelName, context, adapters) {
  const adapter = adapters && adapters[modelName];
  if (typeof adapter !== "function") {
    return { ok: false, model: modelName, error: "adapter_unavailable", confidence: 0 };
  }
  const startTime = Date.now();
  try {
    const out = await adapter(context);
    const latencyMs = Date.now() - startTime;
    const answer = out && out.answer ? String(out.answer) : "";
    const ok = !!answer;
    return {
      ok,
      model: modelName,
      answer,
      error: out && out.error ? String(out.error) : "",
      raw: out || null,
      latency_ms: latencyMs,
      confidence: ok ? computeConfidence(answer, latencyMs, modelName) : 0,
    };
  } catch (error) {
    return {
      ok: false,
      model: modelName,
      error: String(error && error.message ? error.message : error),
      latency_ms: Date.now() - startTime,
      confidence: 0,
    };
  }
}

/**
 * Compute a confidence score (0.0 → 1.0) for a model response.
 * Factors: answer length, latency, error presence.
 */
function computeConfidence(answer, latencyMs, modelName) {
  if (!answer) return 0;

  // Length factor: too short or extremely long → lower score
  const len = answer.length;
  let lengthScore = 0;
  if (len < 10) lengthScore = 0.2;
  else if (len < 50) lengthScore = 0.5;
  else if (len < 300) lengthScore = 0.9;
  else if (len < 1500) lengthScore = 1.0;
  else lengthScore = 0.8; // Very long → slight penalty

  // Latency factor: faster = higher confidence
  let latencyScore = 1.0;
  if (latencyMs > 15000) latencyScore = 0.4;
  else if (latencyMs > 10000) latencyScore = 0.6;
  else if (latencyMs > 5000) latencyScore = 0.8;

  // Quality heuristics: has structure, not repetitive
  const hasStructure = /[-•\d.]/.test(answer) || answer.includes("\n");
  const structureBonus = hasStructure ? 0.05 : 0;

  const raw = lengthScore * 0.5 + latencyScore * 0.4 + structureBonus + 0.1;
  return Math.max(0, Math.min(1, Number(raw.toFixed(3))));
}

// ---------------------------------------------------------------------------
// Parallel coordination
// ---------------------------------------------------------------------------

/**
 * Fire models in PARALLEL and score results.
 * If analysis.requires_multi_models is true, all models run and results are synthesized.
 * Otherwise, race mode: first good response wins, others continue in background.
 */
async function coordinateQuery(analysis, options = {}) {
  let preferred = preferredModelsFor(analysis);

  if (options.modelOverride && typeof options.modelOverride === "string" && preferred.includes(options.modelOverride)) {
    preferred = [options.modelOverride, ...preferred.filter((m) => m !== options.modelOverride)];
  }

  const adapters = options.adapters || {};
  const blueprint = options.cognitiveBlueprint || {};
  const ncsPrompt = options.ncsPrompt || compileCognitivePrompt(blueprint);
  const modelRoles = Object.assign({}, DEFAULT_MODEL_ROLES, blueprint.model_roles || {});

  // Determine how many models to fire in parallel
  const isMultiModel = !!analysis.requires_multi_models;
  const parallelLimit = isMultiModel ? Math.min(preferred.length, 4) : Math.min(preferred.length, 3);
  const modelsToQuery = preferred.slice(0, parallelLimit);

  // Build shared context for all models
  const sharedContext = {
    query: analysis.text,
    analysis,
    seed_answer: options.seedAnswer || "",
    personalization_prompt: options.personalizationPrompt || "",
    ncs_prompt: ncsPrompt,
    council_prompt: buildCouncilPrompt(analysis.text, analysis, options.personalizationPrompt || ""),
  };

  // Fire all models in parallel
  const parallelPromises = modelsToQuery.map(async (modelName) => {
    const context = Object.assign({}, sharedContext, {
      model_role: roleForModel(modelName, modelRoles),
    });
    return tryAdapter(modelName, context, adapters);
  });

  const settled = await Promise.allSettled(parallelPromises);
  const attempts = settled.map((s) => (s.status === "fulfilled" ? s.value : {
    ok: false, model: "unknown", error: String(s.reason || "rejected"), confidence: 0, latency_ms: 0,
  }));

  const successes = attempts.filter((r) => r.ok);

  // Single-model mode: pick highest confidence
  if (!isMultiModel) {
    if (successes.length > 0) {
      successes.sort((a, b) => b.confidence - a.confidence);
      const winner = successes[0];
      return {
        answer: winner.answer,
        model_used: winner.model,
        fallback_used: winner.model !== preferred[0],
        confidence: winner.confidence,
        all_results: attempts,
        attempts,
      };
    }
    return {
      answer: String(options.seedAnswer || "").trim(),
      model_used: preferred[0] || "unavailable",
      fallback_used: true,
      confidence: 0,
      all_results: attempts,
      attempts,
    };
  }

  // Multi-model mode: synthesize via leader role
  if (successes.length >= 1) {
    // Pick the highest-confidence model as synthesizer
    successes.sort((a, b) => b.confidence - a.confidence);
    const synthesisModel = successes[0].model;

    const councilMemberLines = successes.map(
      (item, idx) => `[${roleForModel(item.model, modelRoles).toUpperCase()}] ${item.model}: ${item.answer}`
    );

    const synthesisContext = Object.assign({}, sharedContext, {
      model_role: "leader",
      council_prompt: [
        "You are the LEADER of the AURA AI council.",
        "Your role: Synthesize all perspectives into the final best answer.",
        "Combine the strongest ideas. Remove contradictions. Return ONE unified response.",
        "",
        ncsPrompt,
        options.personalizationPrompt || "",
        `Original query: ${analysis.text}`,
        "",
        "Council member responses:",
        ...councilMemberLines,
      ].filter(Boolean).join("\n"),
    });

    const synthesis = await tryAdapter(synthesisModel, synthesisContext, adapters);

    if (synthesis.ok) {
      // Average confidence of council + synthesis boost
      const avgCouncilConfidence = successes.reduce((s, r) => s + r.confidence, 0) / successes.length;
      const finalConfidence = Math.min(1, avgCouncilConfidence * 0.6 + synthesis.confidence * 0.4);

      return {
        answer: synthesis.answer,
        model_used: synthesisModel,
        fallback_used: synthesisModel !== preferred[0],
        confidence: Number(finalConfidence.toFixed(3)),
        council_results: successes.map((r) => ({
          model: r.model,
          role: roleForModel(r.model, modelRoles),
          confidence: r.confidence,
          latency_ms: r.latency_ms,
        })),
        all_results: attempts.concat(synthesis),
        attempts: attempts.concat(synthesis),
      };
    }

    // Synthesis failed → use highest-confidence council response
    return {
      answer: successes[0].answer,
      model_used: successes[0].model,
      fallback_used: true,
      confidence: successes[0].confidence,
      council_results: successes.map((r) => ({
        model: r.model,
        role: roleForModel(r.model, modelRoles),
        confidence: r.confidence,
        latency_ms: r.latency_ms,
      })),
      all_results: attempts,
      attempts,
    };
  }

  // All models failed
  logger.warn("HARMONY_ALL_FAILED", { models: modelsToQuery });
  return {
    answer: String(options.seedAnswer || "").trim(),
    model_used: "unavailable",
    fallback_used: true,
    confidence: 0,
    all_results: attempts,
    attempts,
  };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

async function coordinateAgentHarmony(observatoryOutput, options = {}) {
  const queries = observatoryOutput && Array.isArray(observatoryOutput.queries) ? observatoryOutput.queries : [];
  const query_plans = [];

  const ncsContext = {
    userMessage: queries.map((query) => query.text).join("\n"),
    observatoryOutput,
    activeModules: options.activeModules || ["observatory", "harmony", "memory_graph", "personality_engine"],
    recentCalls: options.recentCalls || [],
    metadata: Object.assign({}, options.metadata || {}, { providerAvailability: getProviderAvailability() }),
    sessionData: options.sessionData || {},
  };

  const systemState = options.systemState || detectSystemState(ncsContext);
  const cognitiveBlueprint = options.cognitiveBlueprint || buildCognitiveBlueprint(ncsContext, systemState);
  const ncsPrompt = options.ncsPrompt || compileCognitivePrompt(cognitiveBlueprint);

  for (const query of queries) {
    const coordinated = await coordinateQuery(query, Object.assign({}, options, {
      cognitiveBlueprint,
      ncsPrompt,
      modelOverride: options.modelOverride,
    }));

    query_plans.push({
      query_id: query.id,
      query: query.text,
      type: query.type,
      complexity: query.complexity,
      requires_multi_models: query.requires_multi_models,
      answer: coordinated.answer,
      model_used: coordinated.model_used,
      fallback_used: coordinated.fallback_used,
      confidence: coordinated.confidence || 0,
      council_results: coordinated.council_results || null,
      attempts: coordinated.attempts,
    });
  }

  const primary = query_plans[0] || {
    answer: String(options.seedAnswer || "").trim(),
    model_used: "unavailable",
    fallback_used: false,
    confidence: 0,
  };

  return {
    answer: primary.answer,
    final_answer: primary.answer,
    model_used: primary.model_used,
    fallback_used: query_plans.some((item) => item.fallback_used),
    confidence: primary.confidence || 0,
    provider_availability: getProviderAvailability(),
    ncs: {
      system_state: systemState,
      cognitive_blueprint: cognitiveBlueprint,
      prompt_preview: ncsPrompt.slice(0, 600),
    },
    query_plans,
  };
}

module.exports = {
  buildCouncilPrompt,
  coordinateAgentHarmony,
  preferredModelsFor,
  COUNCIL_ROLES,
  computeConfidence,
};
