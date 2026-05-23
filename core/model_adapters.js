const { getModelApiKey } = require("./model_api_registry");
const { getProviderConfig } = require("./config_loader");

function env(name, fallback = "") {
  return String(process.env[name] || fallback).trim();
}

function providerConfig() {
  const master = {
    openrouter: getProviderConfig("openrouter"),
    groq: getProviderConfig("groq"),
    grok: getProviderConfig("grok"),
    mistral: getProviderConfig("mistral"),
    huggingface: getProviderConfig("huggingface"),
    deepseek: getProviderConfig("deepseek"),
  };
  return {
    openrouter: {
      apiKey: getModelApiKey("openrouter") || master.openrouter.apiKey || env("OPENROUTER_API_KEY"),
      baseUrl: master.openrouter.baseUrl || env("PI_OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
      model: master.openrouter.model || env("PI_OPENROUTER_MODEL", "openai/gpt-4o-mini"),
      headers: {
        "HTTP-Referer": env("PI_OPENROUTER_REFERER", "https://tutorv1.netlify.app"),
        "X-Title": env("PI_OPENROUTER_TITLE", "Personal Intelligence"),
      },
    },
    groq: {
      apiKey: getModelApiKey("groq") || master.groq.apiKey || env("GROQ_API_KEY"),
      baseUrl: master.groq.baseUrl || env("PI_GROQ_BASE_URL", "https://api.groq.com/openai/v1"),
      model: master.groq.model || env("PI_GROQ_MODEL", "llama-3.1-8b-instant"),
      headers: {},
    },
    grok: {
      apiKey: getModelApiKey("grok") || master.grok.apiKey || env("GROK_API_KEY") || env("XAI_API_KEY"),
      baseUrl: master.grok.baseUrl || env("PI_GROK_BASE_URL", "https://api.x.ai/v1"),
      model: master.grok.model || env("PI_GROK_MODEL", "grok-3-mini"),
      headers: {},
    },
    mistral: {
      apiKey: getModelApiKey("mistral") || master.mistral.apiKey || env("MISTRAL_API_KEY"),
      baseUrl: master.mistral.baseUrl || env("PI_MISTRAL_BASE_URL", "https://api.mistral.ai/v1"),
      model: master.mistral.model || env("PI_MISTRAL_MODEL", "mistral-small-latest"),
      headers: {},
    },
    huggingface: {
      apiKey: getModelApiKey("huggingface") || master.huggingface.apiKey || env("HUGGINGFACE_API_KEY") || env("HF_API_KEY"),
      baseUrl: master.huggingface.baseUrl || env("PI_HUGGINGFACE_BASE_URL", "https://router.huggingface.co/v1"),
      model: master.huggingface.model || env("PI_HUGGINGFACE_MODEL", "meta-llama/Llama-3.1-8B-Instruct"),
      headers: {},
    },
    deepseek: {
      apiKey: getModelApiKey("deepseek") || master.deepseek.apiKey || env("DEEPSEEK_API_KEY"),
      baseUrl: master.deepseek.baseUrl || env("PI_DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
      model: master.deepseek.model || env("PI_DEEPSEEK_MODEL", "deepseek-chat"),
      headers: {},
    },
  };
}

function buildMessages(context) {
  const analysis = context && context.analysis ? context.analysis : {};
  const ncsPrompt = String(context && context.ncs_prompt || "").trim();
  const roleEmphasis = String(context && context.model_role || "").trim();
  const guidance = [
    ncsPrompt || "You are part of the Aura AI Personal Intelligence agent system.",
    roleEmphasis ? `Your dynamic role emphasis: ${roleEmphasis}.` : "",
    `Query type: ${String(analysis.type || "casual")}`,
    `Complexity: ${String(analysis.complexity || "low")}`,
    context && context.analysis && context.analysis.requires_multi_models
      ? "Multiple models may contribute. Focus on a concise, high-quality final answer."
      : "Provide the best direct answer you can.",
  ].filter(Boolean).join("\n");

  return [
    { role: "system", content: guidance },
    { role: "user", content: String((context && (context.council_prompt || context.query || context.seed_answer)) || "").trim() },
  ];
}

async function postChatCompletion(config, context) {
  if (!config || !config.apiKey || !config.baseUrl || !config.model) {
    return { answer: "", error: "provider_not_configured" };
  }
  const url = `${config.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const headers = Object.assign({
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.apiKey}`,
  }, config.headers || {});
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: config.model,
      messages: buildMessages(context),
      temperature: Number(env("PI_MODEL_TEMPERATURE", "0.4")),
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      answer: "",
      error: String((data && (data.error && data.error.message || data.error || data.message)) || `http_${response.status}`),
    };
  }
  const answer = String((((data || {}).choices || [])[0] || {}).message && (((data || {}).choices || [])[0] || {}).message.content || "").trim();
  return {
    answer,
    raw: data,
    error: answer ? "" : "empty_answer",
  };
}

function buildHarmonyAdapters() {
  const configs = providerConfig();
  return {
    openrouter: async (context) => postChatCompletion(configs.openrouter, context),
    groq: async (context) => postChatCompletion(configs.groq, context),
    grok: async (context) => postChatCompletion(configs.grok, context),
    mistral: async (context) => postChatCompletion(configs.mistral, context),
    huggingface: async (context) => postChatCompletion(configs.huggingface, context),
    deepseek: async (context) => postChatCompletion(configs.deepseek, context),
  };
}

module.exports = {
  buildHarmonyAdapters,
  providerConfig,
};
