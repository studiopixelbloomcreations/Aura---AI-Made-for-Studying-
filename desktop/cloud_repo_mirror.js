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

class CloudRepoMirror {
  constructor(options) {
    this.repoRoot = options.repoRoot;
    this.emitEvent = options.emitEvent;
    this.timer = null;
  }

  _notify(event, payload) {
    try {
      if (typeof this.emitEvent === "function") this.emitEvent(event, payload || {});
    } catch (_) {}
  }

  async syncNow() {
    const before = await execAsync("git rev-parse HEAD", this.repoRoot);
    const fetch = await execAsync("git fetch --all --prune", this.repoRoot);
    const pull = await execAsync("git pull --rebase --autostash", this.repoRoot);
    const after = await execAsync("git rev-parse HEAD", this.repoRoot);

    const changed = before.ok && after.ok && before.stdout.trim() !== after.stdout.trim();
    let files = [];
    if (changed) {
      const diff = await execAsync(`git diff --name-only ${before.stdout.trim()} ${after.stdout.trim()}`, this.repoRoot);
      if (diff.ok) {
        files = diff.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      }
    }

    const payload = {
      ok: !!(fetch.ok && pull.ok),
      changed,
      before_head: before.ok ? before.stdout.trim() : "",
      after_head: after.ok ? after.stdout.trim() : "",
      files,
      fetch_stdout: fetch.stdout.slice(0, 1500),
      fetch_error: fetch.ok ? "" : (fetch.stderr || fetch.error || "git fetch failed").slice(0, 1500),
      pull_stdout: pull.stdout.slice(0, 1500),
      pull_error: pull.ok ? "" : (pull.stderr || pull.error || "git pull failed").slice(0, 1500),
      at: new Date().toISOString(),
    };

    this._notify("cloud_repo_sync", payload);
    return payload;
  }

  start(intervalMs) {
    const ms = Number(intervalMs);
    const period = Number.isFinite(ms) && ms >= 5000 ? ms : 10000;
    this.stop();
    this.timer = setInterval(() => {
      this.syncNow().catch((e) => {
        this._notify("cloud_repo_sync_error", { ok: false, error: String(e && e.message ? e.message : e) });
      });
    }, period);
    this._notify("cloud_repo_sync_started", { interval_ms: period, at: new Date().toISOString() });
    return { ok: true, interval_ms: period };
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this._notify("cloud_repo_sync_stopped", { at: new Date().toISOString() });
    }
    return { ok: true };
  }
}

module.exports = {
  CloudRepoMirror,
};
