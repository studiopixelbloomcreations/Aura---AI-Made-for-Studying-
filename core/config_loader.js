"use strict";

const DEFAULT_MASTER_CONFIG = {
  firebase: {},
  supabase: {},
  groq: {},
  openrouter: {},
  mistral: {},
  huggingface: {},
  deepseek: {},
  gemini: {},
  security: {},
  features: {},
  limits: {},
  routing: {},
  harmony: {},
  evolution: {},
};

const PROVIDER_ENV = {
  groq: { apiKey: "GROQ_API_KEY", model: "PI_GROQ_MODEL", baseUrl: "PI_GROQ_BASE_URL" },
  openrouter: { apiKey: "OPENROUTER_API_KEY", model: "PI_OPENROUTER_MODEL", baseUrl: "PI_OPENROUTER_BASE_URL" },
  mistral: { apiKey: "MISTRAL_API_KEY", model: "PI_MISTRAL_MODEL", baseUrl: "PI_MISTRAL_BASE_URL" },
  huggingface: { apiKey: "HUGGINGFACE_API_KEY", model: "PI_HUGGINGFACE_MODEL", baseUrl: "PI_HUGGINGFACE_BASE_URL" },
  deepseek: { apiKey: "DEEPSEEK_API_KEY", model: "PI_DEEPSEEK_MODEL", baseUrl: "PI_DEEPSEEK_BASE_URL" },
  gemini: { apiKey: "GEMINI_API_KEY" },
};

function runtimeEnv() {
  if (typeof process !== "undefined" && process.env) return process.env;
  if (typeof window !== "undefined" && window.__AEVRA_ENV__) return window.__AEVRA_ENV__;
  return {};
}

function safeParseJson(raw) {
  const text = String(raw || "").trim();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    return {};
  }
}

function deepMerge(base, extra) {
  const out = Object.assign({}, base || {});
  Object.keys(extra || {}).forEach((key) => {
    const value = extra[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = deepMerge(out[key] && typeof out[key] === "object" ? out[key] : {}, value);
    } else if (value !== undefined && value !== null && value !== "") {
      out[key] = value;
    }
  });
  return out;
}

function loadMasterConfig(envSource) {
  const env = envSource || runtimeEnv();
  const parsed = safeParseJson(env.AEVRA_MASTER_CONFIG || "");
  let config = deepMerge(DEFAULT_MASTER_CONFIG, parsed);

  config.supabase = deepMerge(config.supabase, {
    url: env.SUPABASE_URL,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE,
    anonKey: env.SUPABASE_ANON_KEY,
    profileTable: env.SUPABASE_PI_PROFILE_TABLE,
  });

  Object.keys(PROVIDER_ENV).forEach((provider) => {
    const map = PROVIDER_ENV[provider];
    const fallback = {};
    Object.keys(map).forEach((field) => {
      if (env[map[field]]) fallback[field] = env[map[field]];
    });
    config[provider] = deepMerge(config[provider], fallback);
  });

  config.security = deepMerge(config.security, {
    adminToken: env.PI_ADMIN_TOKEN,
    disableRateLimit: String(env.PI_DISABLE_RATE_LIMIT || "").toLowerCase() === "true",
  });
  config.limits = deepMerge(config.limits, {
    askRateLimitPerMin: Number(env.PI_ASK_RATE_LIMIT_PER_MIN || 90),
  });
  return config;
}

function validateMasterConfig(config) {
  const cfg = config && typeof config === "object" ? config : {};
  const missingSections = Object.keys(DEFAULT_MASTER_CONFIG).filter((key) => !(key in cfg));
  return {
    ok: missingSections.length === 0,
    missingSections,
    warnings: [
      (!cfg.supabase || !cfg.supabase.url) ? "supabase.url is not configured" : "",
      (!cfg.groq || !cfg.groq.apiKey) ? "groq.apiKey is not configured" : "",
    ].filter(Boolean),
  };
}

function getConfigSection(section, envSource) {
  return loadMasterConfig(envSource)[section] || {};
}

function getProviderConfig(provider, envSource) {
  const cfg = loadMasterConfig(envSource);
  return cfg[String(provider || "").toLowerCase()] || {};
}

module.exports = {
  DEFAULT_MASTER_CONFIG,
  loadMasterConfig,
  validateMasterConfig,
  getConfigSection,
  getProviderConfig,
};
