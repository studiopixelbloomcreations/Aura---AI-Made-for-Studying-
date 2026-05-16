const { getProviderAvailability } = require("./model_api_registry");
const { detectSystemState, buildCognitiveBlueprint, compileCognitivePrompt } = require("./ncs_engine");

const MODEL_PRIORITY = {
  casual: ["grok"],
  deep_research: ["deepseek", "openrouter"],
  tutorial: ["mistral", "openrouter"],
  coding: ["openrouter", "deepseek"],
  creative: ["grok", "huggingface"],
};

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
  return preferred.concat(Object.keys(availability).filter((name) => availability[name] && !preferred.includes(name)));
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
      error: out && out.error ? String(out.error) : "",
      raw: out || null,
    };
  } catch (error) {
    return {
      ok: false,
      model: modelName,
      error: String(error && error.message ? error.message : error),
    };
  }
}

async function coordinateQuery(analysis, options = {}) {
  const preferred = preferredModelsFor(analysis).filter((name) => name !== "puter");
  const adapters = options.adapters || {};
  const attempts = [];
  const successes = [];
  const blueprint = options.cognitiveBlueprint || {};
  const ncsPrompt = options.ncsPrompt || compileCognitivePrompt(blueprint);
  const modelRoles = blueprint.model_roles || {};

  for (const modelName of preferred) {
    const result = await tryAdapter(modelName, {
      query: analysis.text,
      analysis,
      seed_answer: options.seedAnswer || "",
      personalization_prompt: options.personalizationPrompt || "",
      ncs_prompt: ncsPrompt,
      model_role: modelRoles[modelName] || "reasoning",
      council_prompt: buildCouncilPrompt(analysis.text, analysis, options.personalizationPrompt || ""),
    }, adapters);

    attempts.push(result);
    if (result.ok) successes.push(result);
    if (result.ok && !analysis.requires_multi_models) {
      return {
        answer: result.answer,
        model_used: modelName,
        fallback_used: modelName !== preferred[0],
        attempts,
      };
    }
  }

  if (analysis.requires_multi_models && successes.length > 1) {
    const synthesisModel = successes[0].model;
    const synthesis = await tryAdapter(synthesisModel, {
      query: analysis.text,
      analysis,
      personalization_prompt: options.personalizationPrompt || "",
      council_prompt: [
        "You are part of an AI council.",
        "Combine the strongest ideas into one final answer.",
        "Return a unified final response only.",
        ncsPrompt,
        options.personalizationPrompt || "",
        `Original query: ${analysis.text}`,
        "",
        ...successes.map((item, index) => `Model ${index + 1} (${item.model}): ${item.answer}`),
      ].filter(Boolean).join("\n"),
    }, adapters);

    attempts.push(synthesis);
    if (synthesis.ok) {
      return {
        answer: synthesis.answer,
        model_used: synthesisModel,
        fallback_used: synthesisModel !== preferred[0],
        attempts,
      };
    }
  }

  const winning = successes[0];
  return {
    answer: winning ? winning.answer : String(options.seedAnswer || "").trim(),
    model_used: winning ? winning.model : (preferred[0] || "unavailable"),
    fallback_used: !winning || winning.model !== preferred[0],
    attempts,
  };
}

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
      attempts: coordinated.attempts,
    });
  }

  const primary = query_plans[0] || {
    answer: String(options.seedAnswer || "").trim(),
    model_used: "unavailable",
    fallback_used: false,
  };

  return {
    answer: primary.answer,
    final_answer: primary.answer,
    model_used: primary.model_used,
    fallback_used: query_plans.some((item) => item.fallback_used),
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
};
