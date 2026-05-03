"use strict";

function parseEnv() {
  if (typeof window !== "undefined") {
    const raw =
      (window.__AEVRA_ENV && JSON.stringify(window.__AEVRA_ENV)) ||
      "{}";
    try { return typeof raw === "string" ? JSON.parse(raw || "{}") : raw || {}; } catch (error) { return {}; }
  }
  try { return JSON.parse(process.env.AEVRA_ENV || "{}"); } catch (error) { return {}; }
}

const ENV = parseEnv();

function env(name, fallback) {
  const value = ENV && Object.prototype.hasOwnProperty.call(ENV, name) ? ENV[name] : undefined;
  if (value === undefined || value === null || value === "") return fallback || "";
  return value;
}

function allowedOrigin() {
  const origins = String(env("ALLOWED_ORIGINS", "http://localhost:5500")).split(",").map((s) => s.trim()).filter(Boolean);
  return origins[0] || "http://localhost:5500";
}

if (typeof module !== "undefined") module.exports = { ENV, env, allowedOrigin };
if (typeof window !== "undefined") window.AevraEnv = { ENV, env, allowedOrigin };
