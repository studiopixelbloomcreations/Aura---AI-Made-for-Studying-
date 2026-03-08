const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
const { exec } = require("child_process");

function toIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function sha256(input) {
  return crypto.createHash("sha256").update(String(input || "")).digest("hex");
}

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

function stripCodeFences(text) {
  const src = String(text || "").trim();
  const fence = src.match(/^```[A-Za-z0-9_-]*\n([\s\S]*?)\n```$/);
  if (fence && fence[1]) return fence[1];
  return src;
}

function safeJsonParse(text, fallback) {
  try {
    return JSON.parse(String(text || ""));
  } catch (e) {
    return fallback;
  }
}

function writeFileAtomicValidated(targetPath, content) {
  const absolutePath = String(targetPath || "");
  const text = String(content || "");
  if (path.extname(absolutePath).toLowerCase() === ".json") {
    JSON.parse(text);
  }
  const dir = path.dirname(absolutePath);
  fs.mkdirSync(dir, { recursive: true });
  const temp = path.join(
    dir,
    `.tmp_${path.basename(absolutePath)}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  );
  fs.writeFileSync(temp, text, "utf-8");
  fs.renameSync(temp, absolutePath);
}

function sanitizeFactUserId(v) {
  return String(v || "guest@student.com")
    .toLowerCase()
    .replace(/[^a-z0-9._@-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "guest-student.com";
}

function normalizeFactMap(input) {
  const src = input && typeof input === "object" ? input : {};
  const out = {};
  const keys = ["name", "school", "best_friend_name", "favorite_sport", "favorite_subject", "favorite_color", "hobbies", "city", "home_address", "zip_code", "country", "goal", "preferred_language", "grade"];
  keys.forEach((k) => {
    if (typeof src[k] === "boolean") {
      out[k] = src[k];
      return;
    }
    const v = String(src[k] || "").trim();
    if (v) out[k] = v.slice(0, 240);
  });
  Object.keys(src).forEach((k) => {
    if (/^fact_[a-z0-9_]{1,32}$/i.test(k)) {
      const v = String(src[k] || "").trim();
      if (v) out[k] = v.slice(0, 240);
    }
  });
  return out;
}

function normalizeCompareValue(v) {
  return String(v || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildFactEvolutionJson(existingText, payload) {
  const base = safeJsonParse(existingText, {}) || {};
  const users = base.users && typeof base.users === "object" ? base.users : {};
  const userId = sanitizeFactUserId(payload && payload.user_id);
  const facts = normalizeFactMap(payload && payload.facts);
  const msg = String(payload && payload.message || "").slice(0, 900);
  const prior = users[userId] && typeof users[userId] === "object" ? users[userId] : {};
  const priorFacts = prior.latest_facts && typeof prior.latest_facts === "object" ? prior.latest_facts : {};
  const priorEvents = Array.isArray(prior.fact_events) ? prior.fact_events : [];
  const changedFacts = {};
  Object.keys(facts).forEach((k) => {
    const prev = priorFacts[k];
    const next = facts[k];
    if (typeof prev === "boolean" || typeof next === "boolean") {
      if (prev !== next) changedFacts[k] = next;
      return;
    }
    if (normalizeCompareValue(prev) !== normalizeCompareValue(next)) {
      changedFacts[k] = next;
    }
  });

  const mergedFacts = Object.assign({}, priorFacts, changedFacts);

  if (Object.keys(changedFacts).length > 0) {
    priorEvents.push({
      id: makeId("fact_evt"),
      at: toIso(),
      message: msg,
      updates: changedFacts,
    });
  }

  users[userId] = {
    user_id: userId,
    latest_facts: mergedFacts,
    fact_events: priorEvents.slice(-500),
    updated_at: toIso(),
  };

  return {
    changed: Object.keys(changedFacts).length > 0,
    changed_facts: changedFacts,
    text: JSON.stringify({
      schema_version: 1,
      file_kind: "Fact Evolution",
      updated_at: toIso(),
      users,
    }, null, 2) + "\n",
  };
}

function buildFactSchemaJson(existingText, payload) {
  const base = safeJsonParse(existingText, {}) || {};
  const categories = base.categories && typeof base.categories === "object" ? base.categories : {};
  const aliases = base.aliases && typeof base.aliases === "object" ? { ...base.aliases } : {};
  const custom = Array.isArray(categories.custom) ? categories.custom.slice() : [];
  const known = new Set();
  Object.keys(categories).forEach((cat) => {
    const arr = Array.isArray(categories[cat]) ? categories[cat] : [];
    arr.forEach((k) => known.add(String(k).toLowerCase()));
  });
  custom.forEach((k) => known.add(String(k).toLowerCase()));

  const candidates = Array.isArray(payload && payload.schema_candidates) ? payload.schema_candidates : [];
  let changed = false;
  candidates.forEach((entry) => {
    const key = String(entry && entry.key ? entry.key : "").toLowerCase().trim();
    if (!key) return;
    if (known.has(key)) return;
    custom.push(key);
    known.add(key);
    changed = true;
  });

  categories.custom = custom;

  return {
    changed,
    text: JSON.stringify({
      schema_version: 1,
      file_kind: "Fact Schema",
      updated_at: toIso(),
      categories,
      aliases,
    }, null, 2) + "\n",
  };
}

class LiveEvolutionManager {
  constructor(options) {
    this.repoRoot = path.resolve(options.repoRoot);
    this.loadStore = options.loadStore;
    this.saveStore = options.saveStore;
    this.pushAudit = options.pushAudit;
    this.promptApproval = options.promptApproval;
    this.emitEvent = options.emitEvent;
    this.proposals = new Map();

    this.protectedPaths = [
      "desktop/main.js",
      "desktop/preload.js",
      "main.py",
      "netlify/functions/personal_intelligence_ask.js",
      ".git/",
    ];
  }

  _notify(event, payload) {
    try {
      if (typeof this.emitEvent === "function") this.emitEvent(event, payload || {});
    } catch (_) {}
  }

  _relativePath(inputPath) {
    const raw = String(inputPath || "").replace(/\\/g, "/").trim();
    const withoutPrefix = raw.replace(/^\/+/, "");
    return withoutPrefix;
  }

  _resolveTargetPath(filePath) {
    const rel = this._relativePath(filePath);
    const absolute = path.resolve(this.repoRoot, rel);
    const repoNorm = path.resolve(this.repoRoot);
    const absNorm = path.resolve(absolute);
    if (!absNorm.startsWith(repoNorm)) {
      return { ok: false, error: "Target path must be inside repository" };
    }
    return { ok: true, absolute: absNorm, relative: rel };
  }

  _isProtected(relativePath) {
    const rel = String(relativePath || "").replace(/\\/g, "/").toLowerCase();
    return this.protectedPaths.some((p) => rel.includes(String(p).toLowerCase()));
  }

  _inspectDiff(currentContent, proposedContent) {
    const before = String(currentContent || "").split(/\r?\n/);
    const after = String(proposedContent || "").split(/\r?\n/);
    const max = Math.max(before.length, after.length);
    let changed = 0;
    let added = 0;
    let removed = 0;
    const sample = [];

    for (let i = 0; i < max; i++) {
      const a = before[i];
      const b = after[i];
      if (a === b) continue;
      changed += 1;
      if (typeof a === "undefined") {
        added += 1;
        if (sample.length < 12) sample.push(`+ ${String(b || "")}`);
      } else if (typeof b === "undefined") {
        removed += 1;
        if (sample.length < 12) sample.push(`- ${String(a || "")}`);
      } else {
        if (sample.length < 12) sample.push(`~ ${String(a).slice(0, 70)} -> ${String(b).slice(0, 70)}`);
      }
    }

    return {
      lines_before: before.length,
      lines_after: after.length,
      changed_lines: changed,
      added_lines: added,
      removed_lines: removed,
      sample,
      before_hash: sha256(currentContent).slice(0, 16),
      after_hash: sha256(proposedContent).slice(0, 16),
    };
  }

  async _runSecurityChecks(absolutePath, relativePath, proposedContent) {
    const checks = [];
    const extension = path.extname(relativePath).toLowerCase();
    const content = String(proposedContent || "");

    if (this._isProtected(relativePath)) {
      checks.push({ name: "protected_path", passed: false, detail: "Protected file/path cannot be auto-mutated" });
      return { ok: false, checks };
    }
    checks.push({ name: "protected_path", passed: true, detail: "ok" });

    if (extension === ".json") {
      try {
        const parsed = JSON.parse(content);
        const ok = !!(parsed && typeof parsed === "object");
        checks.push({ name: "json_parse", passed: ok, detail: ok ? "ok" : "json shape invalid" });
        if (!ok) return { ok: false, checks };
      } catch (e) {
        checks.push({ name: "json_parse", passed: false, detail: String(e && e.message ? e.message : e) });
        return { ok: false, checks };
      }
      return { ok: true, checks };
    }

    const forbiddenPatterns = [
      /require\(['"]child_process['"]\)/,
      /\bexec\s*\(/,
      /\bspawn\s*\(/,
      /\bprocess\.env\.[A-Z0-9_]+\s*=\s*/,
      /rm\s+-rf/,
    ];
    const matched = forbiddenPatterns.find((r) => r.test(content));
    if (matched) {
      checks.push({ name: "forbidden_pattern", passed: false, detail: `Matched ${matched}` });
      return { ok: false, checks };
    }
    checks.push({ name: "forbidden_pattern", passed: true, detail: "ok" });

    if (extension === ".js" || extension === ".cjs" || extension === ".mjs") {
      const temp = path.join(os.tmpdir(), `pi_live_check_${Date.now()}_${path.basename(relativePath)}`);
      fs.writeFileSync(temp, content, "utf-8");
      const syntax = await execAsync(`node --check "${temp}"`, this.repoRoot);
      try { fs.unlinkSync(temp); } catch (_) {}
      checks.push({
        name: "js_syntax",
        passed: !!syntax.ok,
        detail: syntax.ok ? "ok" : (syntax.stderr || syntax.error || "syntax failed").slice(0, 800),
      });
      if (!syntax.ok) return { ok: false, checks };
    }

    return { ok: true, checks };
  }

  _record(store, item) {
    store.evolution = store.evolution || { proposals: [] };
    store.evolution.proposals = Array.isArray(store.evolution.proposals) ? store.evolution.proposals : [];
    store.evolution.proposals.push(item);
    if (store.evolution.proposals.length > 300) {
      store.evolution.proposals = store.evolution.proposals.slice(-300);
    }
  }

  listProposals() {
    const out = [];
    for (const p of this.proposals.values()) {
      out.push({
        id: p.id,
        created_at: p.created_at,
        status: p.status,
        file_path: p.file_path,
        instruction: p.instruction,
        model_used: p.model_used,
        inspect: p.inspect,
        security: p.security ? { ok: p.security.ok, checks: p.security.checks } : null,
        deploy: p.deploy || null,
      });
    }
    out.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return { ok: true, proposals: out };
  }

  getProposal(proposalId) {
    const p = this.proposals.get(String(proposalId || ""));
    if (!p) return { ok: false, error: "proposal not found" };
    return {
      ok: true,
      proposal: {
        id: p.id,
        created_at: p.created_at,
        status: p.status,
        file_path: p.file_path,
        instruction: p.instruction,
        model_used: p.model_used,
        inspect: p.inspect,
        security: p.security || null,
        deploy: p.deploy || null,
        generated_preview: String(p.proposed_content || "").split(/\r?\n/).slice(0, 80),
      },
    };
  }

  async startPipeline(payload) {
    const req = payload && typeof payload === "object" ? payload : {};
    const instruction = String(req.instruction || "").trim();
    const filePath = String(req.file_path || "").trim();
    const deployLocal = req.deploy_local !== false;
    const deployCloud = !!req.deploy_cloud;

    if (!instruction) return { ok: false, error: "instruction is required" };
    if (!filePath) return { ok: false, error: "file_path is required" };

    const target = this._resolveTargetPath(filePath);
    if (!target.ok) return { ok: false, error: target.error };

    if (this._isProtected(target.relative)) {
      return { ok: false, error: `Refused: ${target.relative} is protected` };
    }

    const current = fs.existsSync(target.absolute) ? fs.readFileSync(target.absolute, "utf-8") : "";
    const factEvolutionMode = !!req.fact_evolution;
    const factSchemaMode = !!req.fact_schema;
    const puterCode = stripCodeFences(req.puter_generated_code);
    const modelUsed = String(req.puter_model || process.env.PI_LIVE_MODEL || "gemini-3-pro-preview").trim();
    let proposedContent = "";
    if (factEvolutionMode) {
      const factOut = buildFactEvolutionJson(current, {
        user_id: req.user_id,
        message: req.message,
        facts: req.facts,
      });
      if (!factOut.changed) {
        this._notify("fact_ignored_duplicate", {
          file_path: target.relative,
          user_id: req.user_id || "guest@student.com",
        });
        return {
          ok: true,
          skipped: true,
          reason: "fact_already_exists",
          file_path: target.relative,
        };
      }
      proposedContent = factOut.text;
    } else if (factSchemaMode) {
      const schemaOut = buildFactSchemaJson(current, {
        schema_candidates: req.schema_candidates,
      });
      if (!schemaOut.changed) {
        this._notify("schema_ignored_duplicate", {
          file_path: target.relative,
        });
        return {
          ok: true,
          skipped: true,
          reason: "schema_already_exists",
          file_path: target.relative,
        };
      }
      proposedContent = schemaOut.text;
    } else {
      proposedContent = puterCode;
    }

    if (!proposedContent) {
      const err = "PUTER_REQUIRED: pass puter_generated_code from renderer";
      this._notify("failed", { stage: "generate", file_path: target.relative, error: err });
      return { ok: false, stage: "generate", error: err, model_used: modelUsed };
    }

    const proposal = {
      id: makeId("live_evo"),
      created_at: toIso(),
      status: "generated",
      file_path: target.relative,
      absolute_path: target.absolute,
      instruction,
      model_used: modelUsed,
      current_content: current,
      proposed_content: proposedContent,
      inspect: this._inspectDiff(current, proposedContent),
      security: null,
      deploy: null,
    };

    this.proposals.set(proposal.id, proposal);
    this._notify("generated", { id: proposal.id, file_path: proposal.file_path, inspect: proposal.inspect });

    proposal.status = "inspected";
    this._notify("inspected", { id: proposal.id, inspect: proposal.inspect });

    const security = await this._runSecurityChecks(target.absolute, target.relative, proposal.proposed_content);
    proposal.security = security;
    proposal.status = security.ok ? "checked" : "rejected";
    this._notify("security_checked", { id: proposal.id, security });

    if (!security.ok) {
      const store = this.loadStore();
      this.pushAudit(store, { kind: "live_evolution_rejected", proposal_id: proposal.id, file_path: proposal.file_path, security });
      this._record(store, {
        id: proposal.id,
        at: toIso(),
        kind: "rejected",
        file_path: proposal.file_path,
        inspect: proposal.inspect,
        security,
      });
      this.saveStore(store);
      return {
        ok: false,
        stage: "security",
        proposal_id: proposal.id,
        inspect: proposal.inspect,
        security,
      };
    }

    if (!deployLocal && !deployCloud) {
      return {
        ok: true,
        stage: "checked",
        proposal_id: proposal.id,
        inspect: proposal.inspect,
        security,
      };
    }

    return this.deployProposal(proposal.id, { deploy_local: deployLocal, deploy_cloud: deployCloud });
  }

  async deployProposal(proposalId, options) {
    const req = options && typeof options === "object" ? options : {};
    const p = this.proposals.get(String(proposalId || ""));
    if (!p) return { ok: false, error: "proposal not found" };

    const deployLocal = req.deploy_local !== false;
    const deployCloud = !!req.deploy_cloud;

    if (!p.security || !p.security.ok) {
      return { ok: false, error: "Proposal must pass security checks before deploy" };
    }

    const approved = await this.promptApproval(
      "Live Evolution Deploy",
      `Deploy evolved code to ${p.file_path}?\n\nChanged lines: ${p.inspect.changed_lines}\nModel: ${p.model_used}`
    );
    if (!approved) {
      p.status = "denied";
      p.deploy = { ok: false, denied: true, detail: "Creator denied deploy" };
      return { ok: false, denied: true, proposal_id: p.id };
    }

    if (deployLocal) {
      writeFileAtomicValidated(p.absolute_path, p.proposed_content);
    }

    let gitInfo = null;
    if (deployCloud) {
      const msg = `live-evolution: ${p.file_path} (${p.id})`;
      const add = await execAsync(`git add -- "${p.file_path}"`, this.repoRoot);
      const commit = add.ok ? await execAsync(`git commit -m "${msg}"`, this.repoRoot) : { ok: false, stderr: add.stderr || add.error };
      const push = commit.ok ? await execAsync("git push", this.repoRoot) : { ok: false, stderr: commit.stderr || commit.error };
      gitInfo = {
        add,
        commit,
        push,
        pushed: !!push.ok,
      };
    }

    p.status = "deployed";
    p.deploy = {
      ok: true,
      deployed_at: toIso(),
      local_written: !!deployLocal,
      cloud_attempted: !!deployCloud,
      git: gitInfo,
    };

    const store = this.loadStore();
    this.pushAudit(store, {
      kind: "live_evolution_deployed",
      proposal_id: p.id,
      file_path: p.file_path,
      changed_lines: p.inspect.changed_lines,
      cloud_attempted: !!deployCloud,
      cloud_pushed: !!(gitInfo && gitInfo.pushed),
    });
    this._record(store, {
      id: p.id,
      at: toIso(),
      kind: "deployed",
      file_path: p.file_path,
      inspect: p.inspect,
      security: p.security,
      deploy: p.deploy,
    });
    this.saveStore(store);

    this._notify("deployed", { proposal_id: p.id, file_path: p.file_path, deploy: p.deploy });

    return {
      ok: true,
      proposal_id: p.id,
      file_path: p.file_path,
      inspect: p.inspect,
      security: p.security,
      deploy: p.deploy,
    };
  }
}

module.exports = {
  LiveEvolutionManager,
};
