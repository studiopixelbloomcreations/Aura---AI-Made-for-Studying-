const { env } = require("../../../core/env");
"use strict";

function isSet(v) {
  return String(v || "").trim().length > 0;
}

function computeReadiness() {
  const checks = [
    { key: "GITHUB_TOKEN", ok: isSet(env("GITHUB_TOKEN")), required: true },
    { key: "GITHUB_REPO_OWNER", ok: isSet(env("GITHUB_REPO_OWNER")), required: true },
    { key: "GITHUB_REPO_NAME", ok: isSet(env("GITHUB_REPO_NAME")), required: true },
    { key: "GITHUB_REPO_BRANCH", ok: isSet(env("GITHUB_REPO_BRANCH")), required: false },
    { key: "PI_RUNTIME_MODE", ok: isSet(env("PI_RUNTIME_MODE")), required: false },
    { key: "PI_SWARM_WORKER_COUNT", ok: isSet(env("PI_SWARM_WORKER_COUNT")), required: false },
    { key: "PI_SWARM_BACKOFF_BASE_MS", ok: isSet(env("PI_SWARM_BACKOFF_BASE_MS")), required: false },
    { key: "PI_CLOUD_AUTO_EVOLVE", ok: isSet(env("PI_CLOUD_AUTO_EVOLVE")), required: false },
    { key: "PI_ADMIN_TOKEN", ok: isSet(env("PI_ADMIN_TOKEN")), required: true },
    { key: "GEMINI_API_KEY", ok: isSet(env("GEMINI_API_KEY")), required: true },
    { key: "PI_SWARM_FANOUT_URL", ok: isSet(env("PI_SWARM_FANOUT_URL")), required: false },
    { key: "PI_RESEARCH_SOURCE_FEEDS", ok: isSet(env("PI_RESEARCH_SOURCE_FEEDS")), required: false },
  ];
  const requiredFailures = checks.filter((c) => c.required && !c.ok);
  const score = Math.round(((checks.length - requiredFailures.length) / checks.length) * 100);
  return {
    ready: requiredFailures.length === 0,
    score,
    checks,
    missing_required: requiredFailures.map((c) => c.key),
  };
}

module.exports = {
  computeReadiness,
};
