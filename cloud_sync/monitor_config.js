const path = require("path");

function toMs(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(500, Math.floor(n));
}

function resolveRepoRoot() {
  const envRoot = String(process.env.TUTOR_REPO_ROOT || "").trim();
  if (envRoot) return path.resolve(envRoot);
  return path.resolve(__dirname, "..");
}

function readMonitorConfig() {
  return {
    repoRoot: resolveRepoRoot(),
    branch: String(process.env.CLOUD_SYNC_BRANCH || "main").trim() || "main",
    pollMs: toMs(process.env.CLOUD_SYNC_POLL_MS || "1000", 1000),
    startupPull: String(process.env.CLOUD_SYNC_STARTUP_PULL || "true").trim().toLowerCase() !== "false",
    verbose: String(process.env.CLOUD_SYNC_VERBOSE || "true").trim().toLowerCase() !== "false",
  };
}

module.exports = {
  readMonitorConfig,
};

