const { exec } = require("child_process");

function execAsync(command, cwd) {
  return new Promise((resolve) => {
    exec(command, { cwd, windowsHide: true }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        code: error && typeof error.code === "number" ? error.code : 0,
        stdout: String(stdout || ""),
        stderr: String(stderr || ""),
        error: error ? String(error.message || error) : "",
      });
    });
  });
}

class RepoMonitor {
  constructor(config) {
    this.repoRoot = config.repoRoot;
    this.branch = config.branch;
    this.pollMs = config.pollMs;
    this.startupPull = !!config.startupPull;
    this.verbose = !!config.verbose;
    this.timer = null;
    this.lastRemoteHead = "";
    this.busy = false;
  }

  log() {
    if (!this.verbose) return;
    const args = Array.from(arguments);
    console.log("[cloud-sync]", ...args);
  }

  async git(cmd) {
    return execAsync(cmd, this.repoRoot);
  }

  async getRemoteHead() {
    const cmd = `git ls-remote --heads origin ${this.branch}`;
    const res = await this.git(cmd);
    if (!res.ok) return { ok: false, error: res.stderr || res.error || "ls-remote failed" };
    const line = res.stdout.split(/\r?\n/).map((s) => s.trim()).find(Boolean) || "";
    const sha = line.split(/\s+/)[0] || "";
    if (!sha) return { ok: false, error: "remote HEAD not found" };
    return { ok: true, sha };
  }

  async getLocalHead() {
    const res = await this.git("git rev-parse HEAD");
    if (!res.ok) return { ok: false, error: res.stderr || res.error || "rev-parse failed" };
    return { ok: true, sha: res.stdout.trim() };
  }

  async pullLatest() {
    const fetch = await this.git("git fetch --all --prune");
    if (!fetch.ok) {
      return { ok: false, stage: "fetch", error: fetch.stderr || fetch.error || "fetch failed" };
    }

    const pull = await this.git(`git pull --rebase --autostash origin ${this.branch}`);
    if (!pull.ok) {
      return {
        ok: false,
        stage: "pull",
        error: pull.stderr || pull.error || "pull failed",
        stdout: pull.stdout,
      };
    }

    return { ok: true, stdout: pull.stdout };
  }

  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      const remote = await this.getRemoteHead();
      if (!remote.ok) {
        this.log("remote check failed:", remote.error);
        return;
      }

      if (!this.lastRemoteHead) {
        this.lastRemoteHead = remote.sha;
        this.log("tracking remote head:", remote.sha.slice(0, 12));
        return;
      }

      if (remote.sha === this.lastRemoteHead) return;

      this.log("remote changed:", this.lastRemoteHead.slice(0, 12), "->", remote.sha.slice(0, 12));
      const before = await this.getLocalHead();
      const pull = await this.pullLatest();
      if (!pull.ok) {
        this.log("sync failed:", pull.stage, pull.error);
        return;
      }

      const after = await this.getLocalHead();
      this.lastRemoteHead = remote.sha;
      this.log("synced local repo:", (before.sha || "").slice(0, 12), "->", (after.sha || "").slice(0, 12));
    } finally {
      this.busy = false;
    }
  }

  async start() {
    this.log("repo:", this.repoRoot);
    this.log("branch:", this.branch);
    this.log("poll interval (ms):", this.pollMs);

    const remote = await this.getRemoteHead();
    if (remote.ok) {
      this.lastRemoteHead = remote.sha;
      this.log("initial remote head:", remote.sha.slice(0, 12));
    } else {
      this.log("initial remote read failed:", remote.error);
    }

    if (this.startupPull) {
      const startup = await this.pullLatest();
      if (startup.ok) this.log("startup pull complete");
      else this.log("startup pull failed:", startup.error);
    }

    await this.tick();
    this.timer = setInterval(() => {
      this.tick().catch((e) => this.log("tick error:", e && e.message ? e.message : String(e)));
    }, this.pollMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

module.exports = {
  RepoMonitor,
};

