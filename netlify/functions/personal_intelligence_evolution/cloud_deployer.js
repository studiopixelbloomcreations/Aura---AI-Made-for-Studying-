"use strict";

const crypto = require("crypto");

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function hashText(input) {
  return crypto.createHash("sha256").update(String(input || "")).digest("hex");
}

function sanitizeSegment(v) {
  return String(v || "").toLowerCase().replace(/[^a-z0-9._-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 64) || "user";
}

function hasForbiddenPatterns(code) {
  const src = String(code || "");
  const patterns = [
    /child_process/,
    /\bexec\s*\(/,
    /\bspawn\s*\(/,
    /process\.env\.[A-Z0-9_]+\s*=\s*/,
    /rm\s+-rf/,
    /fs\.rm\s*\(/,
  ];
  return patterns.find((p) => p.test(src)) || null;
}

function basicSyntaxShapeCheck(code) {
  const src = String(code || "").trim();
  if (!src) return { ok: false, detail: "empty generated code" };
  if (src.length < 60) return { ok: false, detail: "generated code too short" };
  if (!/module\.exports\s*=|export\s+default|exports\./.test(src)) {
    return { ok: false, detail: "missing export pattern" };
  }
  const forbidden = hasForbiddenPatterns(src);
  if (forbidden) return { ok: false, detail: `forbidden pattern matched: ${forbidden}` };
  return { ok: true, detail: "ok" };
}

function buildTargetPath(userId, message) {
  const uid = sanitizeSegment(userId || "guest");
  const topic = sanitizeSegment((message || "").split(/\s+/).slice(0, 6).join(" ") || "interaction");
  const stamp = new Date().toISOString().slice(0, 10);
  return `netlify/functions/personal_intelligence_evolution/generated_plugins/${uid}/${stamp}/${topic}-${Date.now()}.js`;
}

async function githubPutFile(params) {
  const token = String(params.token || "").trim();
  const owner = String(params.owner || "").trim();
  const repo = String(params.repo || "").trim();
  const branch = String(params.branch || "main").trim();
  const filePath = String(params.filePath || "").trim();
  const content = String(params.content || "");
  const message = String(params.commitMessage || "cloud evolution commit");

  if (!token || !owner || !repo || !filePath) {
    return { ok: false, error: "Missing GitHub token/owner/repo/filePath" };
  }

  const endpoint = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${filePath.split("/").map(encodeURIComponent).join("/")}`;
  const body = {
    message,
    content: Buffer.from(content, "utf-8").toString("base64"),
    branch,
  };

  try {
    const res = await fetch(endpoint, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/vnd.github+json",
        "Authorization": `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data && data.message ? String(data.message) : `HTTP ${res.status}`;
      return { ok: false, error: `GitHub PUT failed: ${msg}`, raw: data };
    }
    return {
      ok: true,
      commit_sha: data && data.commit && data.commit.sha ? String(data.commit.sha) : "",
      commit_url: data && data.commit && data.commit.html_url ? String(data.commit.html_url) : "",
      content_path: data && data.content && data.content.path ? String(data.content.path) : filePath,
    };
  } catch (e) {
    return { ok: false, error: `GitHub request error: ${String(e && e.message ? e.message : e)}` };
  }
}

function extractCodeFromModel(text) {
  const raw = String(text || "").trim();
  const fence = raw.match(/```(?:javascript|js)?\n([\s\S]*?)\n```/i);
  if (fence && fence[1]) return String(fence[1]).trim();
  return raw;
}

async function autoEvolveToGitHub(input) {
  const payload = input && typeof input === "object" ? input : {};
  const userId = sanitizeSegment(payload.user_id || payload.email || payload.uid || "guest");
  const message = String(payload.message || "");
  const knownFacts = payload.known_facts && typeof payload.known_facts === "object" ? payload.known_facts : {};
  const memoryUpdates = payload.memory_updates && typeof payload.memory_updates === "object" ? payload.memory_updates : {};

  const traceId = makeId("cloud_trace");
  const stages = [];

  const shouldEvolve = Object.keys(memoryUpdates).length > 0 || /my name is|i live|set home|my city|my school|my goal/i.test(message);
  if (!shouldEvolve) {
    return { ok: true, skipped: true, trace_id: traceId, reason: "no_personal_data_signal", stages };
  }

  const filePath = buildTargetPath(userId, message);

  const puterCode = String(payload.puter_generated_code || "").trim();
  const puterModel = String(payload.puter_model || "gemini-3-pro-preview");
  if (!puterCode) {
    stages.push({
      stage: "generate",
      ok: false,
      model_used: puterModel,
      error: "PUTER_REQUIRED: missing puter_generated_code",
    });
    return {
      ok: false,
      trace_id: traceId,
      stages,
      stage: "generate",
      error: "PUTER_REQUIRED: frontend must send puter_generated_code",
    };
  }
  stages.push({ stage: "generate", ok: true, model_used: puterModel, error: "" });

  const code = extractCodeFromModel(puterCode);
  const inspect = {
    file_path: filePath,
    generated_lines: code.split(/\r?\n/).length,
    generated_chars: code.length,
    hash: hashText(code).slice(0, 16),
  };
  stages.push({ stage: "inspect", ok: true, inspect });

  const shape = basicSyntaxShapeCheck(code);
  stages.push({ stage: "security_check", ok: !!shape.ok, detail: shape.detail });
  if (!shape.ok) {
    return { ok: false, trace_id: traceId, stages, stage: "security_check", inspect, error: shape.detail };
  }

  const token = String(process.env.GITHUB_TOKEN || "").trim();
  const owner = String(process.env.GITHUB_REPO_OWNER || "").trim();
  const repo = String(process.env.GITHUB_REPO_NAME || "").trim();
  const branch = String(process.env.GITHUB_REPO_BRANCH || "main").trim();

  const deploy = await githubPutFile({
    token,
    owner,
    repo,
    branch,
    filePath,
    content: code,
    commitMessage: `auto-evolution(${userId}): ${pathTail(filePath)}`,
  });
  stages.push({ stage: "deploy", ok: !!deploy.ok, commit_sha: deploy.commit_sha || "", commit_url: deploy.commit_url || "", error: deploy.error || "" });

  if (!deploy.ok) {
    return { ok: false, trace_id: traceId, stages, stage: "deploy", inspect, error: deploy.error || "deploy failed" };
  }

  return {
    ok: true,
    trace_id: traceId,
    file_path: filePath,
    inspect,
    deploy,
    stages,
  };
}

function pathTail(p) {
  const s = String(p || "");
  const idx = s.lastIndexOf("/");
  return idx >= 0 ? s.slice(idx + 1) : s;
}

module.exports = {
  autoEvolveToGitHub,
};
