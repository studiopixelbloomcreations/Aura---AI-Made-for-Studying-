const MODEL_PRIORITY = {
  casual: ["grok", "puter"],
  deep_research: ["deepseek", "openrouter", "puter"],
  tutorial: ["mistral", "openrouter", "puter"],
  code: ["openrouter", "deepseek", "puter"],
  creative: ["grok", "huggingface", "puter"],
  multi_question: ["openrouter", "deepseek", "grok", "puter"],
};
const { getProviderAvailability } = require("./model_api_registry");

function buildCouncilPrompt(query, analysis) {
  return [
    "You are part of an AI council.",
    "Discuss and refine the best answer collaboratively.",
    "Return one final unified answer.",
    `Query type: ${analysis.type}`,
    `Complexity: ${analysis.complexity}`,
    `User query: ${query}`,
  ].join("\n");
}

function preferredModelsFor(analysis) {
  return MODEL_PRIORITY[analysis.type] || ["puter"];
}

async function tryAdapter(modelName, context, adapters) {
  const adapter = adapters && adapters[modelName];
  if (typeof adapter !== "function") {
    return { ok: false, model: modelName, error: "adapter_unavailable" };
  }
  try {
    const out = await adapter(context);
    return {
      ok: !!(out && out.answer),
      model: modelName,
      answer: out && out.answer ? String(out.answer) : "",
      raw: out || null,
      error: out && out.error ? String(out.error) : "",
    };
  } catch (error) {
    return { ok: false, model: modelName, error: String(error && error.message ? error.message : error) };
  }
}

async function coordinateQuery(analysis, options = {}) {
  const preferred = preferredModelsFor(analysis);
  const adapters = options.adapters || {};
  const available = [];

  for (const modelName of preferred) {
    const result = await tryAdapter(modelName, {
      query: analysis.text,
      analysis,
      council_prompt: buildCouncilPrompt(analysis.text, analysis),
      seed_answer: options.seedAnswer || "",
    }, adapters);
    available.push(result);
    if (result.ok) {
      return {
        final_answer: result.answer,
        model_used: modelName,
        fallback_used: modelName !== preferred[0],
        discussion_mode: !!analysis.requires_multi_models,
        attempts: available,
      };
    }
  }

  return {
    final_answer: String(options.seedAnswer || "").trim(),
    model_used: preferred[0] || "puter",
    fallback_used: true,
    discussion_mode: !!analysis.requires_multi_models,
    attempts: available,
  };
}

async function coordinateAgentHarmony(observatoryOutput, options = {}) {
  const analyses = observatoryOutput && Array.isArray(observatoryOutput.queries) ? observatoryOutput.queries : [];
  const query_plans = [];
  const provider_availability = getProviderAvailability();

  for (const query of analyses) {
    const coordinated = await coordinateQuery(query, options);
    query_plans.push({
      query_id: query.id,
      query: query.text,
      type: query.type,
      complexity: query.complexity,
      requires_multi_models: query.requires_multi_models,
      ...coordinated,
    });
  }

  const primary = query_plans[0] || {
    final_answer: String(options.seedAnswer || "").trim(),
    model_used: "puter",
    fallback_used: false,
  };

  return {
    final_answer: primary.final_answer,
    model_used: primary.model_used,
    fallback_used: query_plans.some((row) => !!row.fallback_used),
    discussion_mode: query_plans.some((row) => !!row.requires_multi_models),
    provider_availability,
    query_plans,
  };
}

module.exports = {
  buildCouncilPrompt,
  coordinateAgentHarmony,
  preferredModelsFor,
};

