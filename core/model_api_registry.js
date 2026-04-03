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
  return parseModelApiKeys(process.env.PI_MODEL_API_KEYS_JSON || process.env.MODEL_API_KEYS_JSON || "");
}

function getModelApiKey(provider) {
  const registry = getModelApiRegistry();
  const entry = registry && provider ? registry[String(provider).toLowerCase()] : null;
  if (entry && typeof entry === "object" && entry.apiKey) {
    return String(entry.apiKey).trim();
  }
  return "";
}

function getProviderAvailability() {
  const providers = ["openrouter", "groq", "mistral", "huggingface", "deepseek"];
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

