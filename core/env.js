"use strict";

function parseEnv() {
  if (typeof window !== "undefined") {
    const raw =
      (window.__AEVRA_ENV && JSON.stringify(window.__AEVRA_ENV)) ||
      (window.__PUBLIC_AEVRA_ENV && JSON.stringify(window.__PUBLIC_AEVRA_ENV)) ||
      "{}";
    try { return typeof raw === "string" ? JSON.parse(raw || "{}") : raw || {}; } catch (error) { return {}; }
  }
  try {
    const parsed = JSON.parse(process.env.AEVRA_ENV || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
}

const ENV = parseEnv();
function parseMasterConfig() {
  if (typeof process === "undefined" || !process.env) return {};
  try {
    const parsed = JSON.parse(process.env.AEVRA_MASTER_CONFIG || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
}

const MASTER_CONFIG = parseMasterConfig();
const MASTER_ENV_MAP = {
  GROQ_API_KEY: ["groq", "apiKey"],
  OPENROUTER_API_KEY: ["openrouter", "apiKey"],
  MISTRAL_API_KEY: ["mistral", "apiKey"],
  HUGGINGFACE_API_KEY: ["huggingface", "apiKey"],
  DEEPSEEK_API_KEY: ["deepseek", "apiKey"],
  SUPABASE_URL: ["supabase", "url"],
  SUPABASE_ANON_KEY: ["supabase", "anonKey"],
  SUPABASE_SERVICE_KEY: ["supabase", "serviceRoleKey"],
  SUPABASE_SERVICE_ROLE_KEY: ["supabase", "serviceRoleKey"],
  ELEVENLABS_API_KEY: ["elevenlabs", "apiKey"],
  ALLOWED_ORIGINS: ["security", "allowedOrigins"],
};

function env(name, fallback) {
  const value = ENV && Object.prototype.hasOwnProperty.call(ENV, name) ? ENV[name] : undefined;
  if (value !== undefined && value !== null && value !== "") return value;
  if (typeof process !== "undefined" && process.env && process.env[name]) return process.env[name];
  const path = MASTER_ENV_MAP[name];
  if (path && MASTER_CONFIG && MASTER_CONFIG[path[0]]) {
    const sectionValue = MASTER_CONFIG[path[0]][path[1]];
    if (sectionValue !== undefined && sectionValue !== null && sectionValue !== "") return sectionValue;
  }
  if (name === "SUPABASE_SERVICE_KEY" && typeof process !== "undefined" && process.env && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
  return fallback === undefined ? "" : fallback;
}

function validateEnv(required) {
  const keys = Array.isArray(required) && required.length ? required : [
    "GROQ_API_KEY",
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
  ];
  const missing = keys.filter((key) => !env(key));
  missing.forEach((key) => {
    if (typeof console !== "undefined" && console.error) console.error(`Missing ENV key: ${key}`);
  });
  return missing;
}

function allowedOrigin() {
  const origins = String(env("ALLOWED_ORIGINS", "https://aevrav1.netlify.app")).split(",").map((s) => s.trim()).filter(Boolean);
  return origins[0] || "https://aevrav1.netlify.app";
}

if (typeof module !== "undefined") module.exports = { ENV, env, validateEnv, allowedOrigin };
if (typeof window !== "undefined") {
  window.AuraEnv = { ENV, env, validateEnv, allowedOrigin };
  validateEnv();
}
