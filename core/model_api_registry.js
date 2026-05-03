const { env } = require("./env");

function parseModelApiKeys(raw) {
  const text = String(raw || "").trim();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
}

function getModelApiRegistry() {
  return parseModelApiKeys(env("PI_MODEL_API_KEYS_JSON") || env("MODEL_API_KEYS_JSON") || "");
}

function getModelApiKey(provider) {
  const registry = getModelApiRegistry();
  const entry = registry && provider ? registry[String(provider).toLowerCase()] : null;
  if (entry && typeof entry === "object" && entry.apiKey) {
    return String(entry.apiKey).trim();
  }
  const envMap = {
    openrouter: "OPENROUTER_API_KEY",
    grok: "GROK_API_KEY",
    groq: "GROQ_API_KEY",
    mistral: "MISTRAL_API_KEY",
    huggingface: "HUGGINGFACE_API_KEY",
    deepseek: "DEEPSEEK_API_KEY",
  };
  const envName = envMap[String(provider).toLowerCase()];
  if (envName && env(envName)) {
    return String(env(envName)).trim();
  }
  return "";
}

function getProviderAvailability() {
  const providers = ["openrouter", "grok", "groq", "mistral", "huggingface", "deepseek"];
  const out = {};
  providers.forEach((provider) => {
    out[provider] = !!getModelApiKey(provider);
  });
  return out;
}

module.exports = {
  parseModelApiKeys,
  getModelApiRegistry,
  getModelApiKey,
  getProviderAvailability,
};
