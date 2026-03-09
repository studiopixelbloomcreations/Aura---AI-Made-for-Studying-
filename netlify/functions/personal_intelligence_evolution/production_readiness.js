"use strict";

function isSet(v) {
  return String(v || "").trim().length > 0;
}

function computeReadiness() {
  const checks = [
    { key: "GITHUB_TOKEN", ok: isSet(process.env.GITHUB_TOKEN), required: true },
    { key: "GITHUB_REPO_OWNER", ok: isSet(process.env.GITHUB_REPO_OWNER), required: true },
    { key: "GITHUB_REPO_NAME", ok: isSet(process.env.GITHUB_REPO_NAME), required: true },
    { key: "GITHUB_REPO_BRANCH", ok: isSet(process.env.GITHUB_REPO_BRANCH), required: false },
    { key: "PI_RUNTIME_MODE", ok: isSet(process.env.PI_RUNTIME_MODE), required: false },
    { key: "PI_SWARM_WORKER_COUNT", ok: isSet(process.env.PI_SWARM_WORKER_COUNT), required: false },
    { key: "PI_SWARM_BACKOFF_BASE_MS", ok: isSet(process.env.PI_SWARM_BACKOFF_BASE_MS), required: false },
    { key: "PI_CLOUD_AUTO_EVOLVE", ok: isSet(process.env.PI_CLOUD_AUTO_EVOLVE), required: false },
    { key: "PI_ADMIN_TOKEN", ok: isSet(process.env.PI_ADMIN_TOKEN), required: true },
    { key: "PI_STRICT_PUTER_ONLY", ok: String(process.env.PI_STRICT_PUTER_ONLY || "true").trim().toLowerCase() === "true", required: true },
    { key: "PI_SWARM_FANOUT_URL", ok: isSet(process.env.PI_SWARM_FANOUT_URL), required: false },
    { key: "PI_RESEARCH_SOURCE_FEEDS", ok: isSet(process.env.PI_RESEARCH_SOURCE_FEEDS), required: false },
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
