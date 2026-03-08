"use strict";

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeSegment(v) {
  return String(v || "")
    .toLowerCase()
    .replace(/[^a-z0-9._@-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "user";
}

function buildFactsFilePath() {
  return String(process.env.PI_FACT_EVOLUTION_PATH || "netlify/functions/personal_intelligence_evolution/Fact Evolution.json").trim();
}

function safeJsonParse(text, fallback) {
  try {
    return JSON.parse(String(text || ""));
  } catch (e) {
    return fallback;
  }
}

function toBase64Utf8(text) {
  return Buffer.from(String(text || ""), "utf-8").toString("base64");
}

function fromBase64Utf8(text) {
  return Buffer.from(String(text || ""), "base64").toString("utf-8");
}

function githubContentsEndpoint(owner, repo, filePath) {
  return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${filePath.split("/").map(encodeURIComponent).join("/")}`;
}

async function githubGetFile(params) {
  const token = String(params.token || "").trim();
  const owner = String(params.owner || "").trim();
  const repo = String(params.repo || "").trim();
  const branch = String(params.branch || "main").trim();
  const filePath = String(params.filePath || "").trim();

  if (!token || !owner || !repo || !filePath) {
    return { ok: false, missing: true, error: "Missing GitHub token/owner/repo/filePath" };
  }

  const endpoint = `${githubContentsEndpoint(owner, repo, filePath)}?ref=${encodeURIComponent(branch)}`;
  try {
    const res = await fetch(endpoint, {
      method: "GET",
      headers: {
        "Accept": "application/vnd.github+json",
        "Authorization": `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (res.status === 404) {
      return { ok: true, exists: false, sha: "", content: "" };
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data && data.message ? String(data.message) : `HTTP ${res.status}`;
      return { ok: false, error: `GitHub GET failed: ${msg}` };
    }

    const encoded = String(data && data.content ? data.content : "").replace(/\n/g, "");
    const decoded = encoded ? fromBase64Utf8(encoded) : "";
    return {
      ok: true,
      exists: true,
      sha: String(data && data.sha ? data.sha : ""),
      content: decoded,
    };
  } catch (e) {
    return { ok: false, error: `GitHub request error: ${String(e && e.message ? e.message : e)}` };
  }
}

async function githubPutFile(params) {
  const token = String(params.token || "").trim();
  const owner = String(params.owner || "").trim();
  const repo = String(params.repo || "").trim();
  const branch = String(params.branch || "main").trim();
  const filePath = String(params.filePath || "").trim();
  const content = String(params.content || "");
  const message = String(params.commitMessage || "cloud evolution commit");
  const sha = String(params.sha || "").trim();

  if (!token || !owner || !repo || !filePath) {
    return { ok: false, error: "Missing GitHub token/owner/repo/filePath" };
  }

  const endpoint = githubContentsEndpoint(owner, repo, filePath);
  const body = {
    message,
    content: toBase64Utf8(content),
    branch,
  };
  if (sha) body.sha = sha;

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

function extractPersonalFacts(knownFacts, memoryUpdates) {
  const src = Object.assign({}, knownFacts || {}, memoryUpdates || {});
  const allowed = [
    "name",
    "home_address",
    "zip_code",
    "city",
    "school",
    "favorite_sport",
    "favorite_subject",
    "favorite_color",
    "hobbies",
    "country",
    "goal",
    "preferred_language",
    "grade",
  ];
  const out = {};
  allowed.forEach((k) => {
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

function buildNextFactEvolutionDoc(existingDoc, data) {
  const base = existingDoc && typeof existingDoc === "object" ? existingDoc : {};
  const users = base.users && typeof base.users === "object" ? base.users : {};

  const uid = String(data.userId || "guest");
  const prior = users[uid] && typeof users[uid] === "object" ? users[uid] : {};
  const priorFacts = prior.latest_facts && typeof prior.latest_facts === "object" ? prior.latest_facts : {};
  const priorEvents = Array.isArray(prior.fact_events) ? prior.fact_events : [];

  const incomingFacts = data.facts || {};
  const changedFacts = {};
  Object.keys(incomingFacts).forEach((k) => {
    const prev = priorFacts[k];
    const next = incomingFacts[k];
    if (typeof prev === "boolean" || typeof next === "boolean") {
      if (prev !== next) changedFacts[k] = next;
      return;
    }
    if (normalizeCompareValue(prev) !== normalizeCompareValue(next)) {
      changedFacts[k] = next;
    }
  });

  const mergedFacts = Object.assign({}, priorFacts, changedFacts);
  const event = {
    id: makeId("fact_evt"),
    at: new Date().toISOString(),
    message: String(data.message || "").slice(0, 900),
    updates: changedFacts,
  };

  const nextEvents = Object.keys(changedFacts).length
    ? priorEvents.concat([event]).slice(-500)
    : priorEvents;

  users[uid] = {
    user_id: uid,
    latest_facts: mergedFacts,
    fact_events: nextEvents,
    updated_at: new Date().toISOString(),
  };

  return {
    changed: Object.keys(changedFacts).length > 0,
    changed_facts: changedFacts,
    doc: {
      schema_version: 1,
      file_kind: "Fact Evolution",
      updated_at: new Date().toISOString(),
      users,
    },
  };
}

async function autoEvolveToGitHub(input) {
  const payload = input && typeof input === "object" ? input : {};
  const userId = sanitizeSegment(payload.user_id || payload.email || payload.uid || "guest@student.com");
  const message = String(payload.message || "");
  const knownFacts = payload.known_facts && typeof payload.known_facts === "object" ? payload.known_facts : {};
  const memoryUpdates = payload.memory_updates && typeof payload.memory_updates === "object" ? payload.memory_updates : {};

  const traceId = makeId("cloud_trace");
  const stages = [];

  const facts = extractPersonalFacts(knownFacts, memoryUpdates);
  const shouldEvolve = Object.keys(facts).length > 0;
  if (!shouldEvolve) {
    return { ok: true, skipped: true, trace_id: traceId, reason: "no_personal_facts_found", stages };
  }

  const filePath = buildFactsFilePath();
  const inspect = {
    file_path: filePath,
    user_id: userId,
    fact_keys: Object.keys(facts),
    fact_count: Object.keys(facts).length,
  };
  stages.push({ stage: "generate", ok: true, model_used: String(payload.puter_model || "gemini-3-pro-preview"), error: "" });
  stages.push({ stage: "inspect", ok: true, inspect });

  const token = String(process.env.GITHUB_TOKEN || "").trim();
  const owner = String(process.env.GITHUB_REPO_OWNER || "").trim();
  const repo = String(process.env.GITHUB_REPO_NAME || "").trim();
  const branch = String(process.env.GITHUB_REPO_BRANCH || "main").trim();

  const current = await githubGetFile({ token, owner, repo, branch, filePath });
  if (!current.ok) {
    stages.push({ stage: "security_check", ok: false, detail: current.error || "failed to load existing file" });
    return { ok: false, trace_id: traceId, stages, stage: "security_check", inspect, error: current.error || "failed to load existing file" };
  }

  const existingDoc = current.exists ? safeJsonParse(current.content, {}) : {};
  const nextDoc = buildNextFactEvolutionDoc(existingDoc, { userId, message, facts });
  if (!nextDoc.changed) {
    stages.push({ stage: "deploy", ok: true, skipped: true, detail: "duplicate facts ignored" });
    return {
      ok: true,
      skipped: true,
      trace_id: traceId,
      file_path: filePath,
      inspect,
      stages,
      reason: "fact_already_exists",
    };
  }
  const nextJson = JSON.stringify(nextDoc.doc, null, 2) + "\n";

  // Safety check: ensure resulting file is valid JSON and is the expected structure.
  const parsedCheck = safeJsonParse(nextJson, null);
  const validShape = !!(parsedCheck && parsedCheck.users && typeof parsedCheck.users === "object");
  stages.push({ stage: "security_check", ok: validShape, detail: validShape ? "ok" : "invalid Fact Evolution JSON" });
  if (!validShape) {
    return { ok: false, trace_id: traceId, stages, stage: "security_check", inspect, error: "invalid Fact Evolution JSON" };
  }

  const deploy = await githubPutFile({
    token,
    owner,
    repo,
    branch,
    filePath,
    content: nextJson,
    sha: current.exists ? current.sha : "",
    commitMessage: `fact-evolution(${userId}): update facts`,
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

module.exports = {
  autoEvolveToGitHub,
};
