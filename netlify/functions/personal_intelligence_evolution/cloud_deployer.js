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
function buildSchemaFilePath() {
  return String(process.env.PI_FACT_SCHEMA_PATH || "netlify/functions/personal_intelligence_evolution/Fact Schema.json").trim();
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
    "best_friend_name",
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

function extractSchemaCandidates(facts) {
  const src = facts && typeof facts === "object" ? facts : {};
  const out = [];
  Object.keys(src).forEach((k) => {
    if (/^fact_[a-z0-9_]{1,64}$/i.test(k)) {
      const raw = String(k).replace(/^fact_/i, "");
      if (!raw) return;
      out.push({
        key: String(raw).toLowerCase(),
        category: "custom",
        source_key: k,
      });
    }
  });
  return out;
}

function mergeSchemaCandidates(fromFacts, fromPayload) {
  const out = [];
  const seen = new Set();
  const push = (entry) => {
    const key = String(entry && entry.key ? entry.key : "").toLowerCase().trim();
    if (!key) return;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ key, category: String(entry && entry.category ? entry.category : "custom"), source_key: String(entry && entry.source_key ? entry.source_key : "") });
  };
  (Array.isArray(fromFacts) ? fromFacts : []).forEach(push);
  (Array.isArray(fromPayload) ? fromPayload : []).forEach(push);
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

function buildNextFactSchemaDoc(existingDoc, schemaCandidates) {
  const base = existingDoc && typeof existingDoc === "object" ? existingDoc : {};
  const categories = base.categories && typeof base.categories === "object" ? base.categories : {};
  const custom = Array.isArray(categories.custom) ? categories.custom.slice() : [];
  const aliases = base.aliases && typeof base.aliases === "object" ? { ...base.aliases } : {};

  const known = new Set();
  Object.keys(categories).forEach((cat) => {
    const arr = Array.isArray(categories[cat]) ? categories[cat] : [];
    arr.forEach((k) => known.add(String(k).toLowerCase()));
  });
  custom.forEach((k) => known.add(String(k).toLowerCase()));

  let changed = false;
  (Array.isArray(schemaCandidates) ? schemaCandidates : []).forEach((entry) => {
    const key = String(entry && entry.key ? entry.key : "").toLowerCase().trim();
    if (!key) return;
    if (known.has(key)) return;
    custom.push(key);
    known.add(key);
    changed = true;
  });

  categories.custom = custom;
  const doc = {
    schema_version: 1,
    file_kind: "Fact Schema",
    updated_at: new Date().toISOString(),
    categories,
    aliases,
  };
  return { changed, doc };
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
  const schemaPath = buildSchemaFilePath();
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

  let schemaDeploy = { ok: true, skipped: true };
  const schemaCandidates = mergeSchemaCandidates(
    extractSchemaCandidates(facts),
    payload && payload.schema_candidates
  );
  if (schemaCandidates.length > 0) {
    const schemaCurrent = await githubGetFile({ token, owner, repo, branch, filePath: schemaPath });
    if (schemaCurrent.ok) {
      const schemaExisting = schemaCurrent.exists ? safeJsonParse(schemaCurrent.content, {}) : {};
      const schemaNext = buildNextFactSchemaDoc(schemaExisting, schemaCandidates);
      if (schemaNext.changed) {
        const schemaJson = JSON.stringify(schemaNext.doc, null, 2) + "\n";
        schemaDeploy = await githubPutFile({
          token,
          owner,
          repo,
          branch,
          filePath: schemaPath,
          content: schemaJson,
          sha: schemaCurrent.exists ? schemaCurrent.sha : "",
          commitMessage: `fact-schema(${userId}): add custom fact keys`,
        });
      } else {
        schemaDeploy = { ok: true, skipped: true, reason: "no_new_schema_keys" };
      }
    } else {
      schemaDeploy = { ok: false, error: schemaCurrent.error || "schema load failed" };
    }
  }
  stages.push({
    stage: "schema_deploy",
    ok: !!schemaDeploy.ok,
    skipped: !!schemaDeploy.skipped,
    commit_sha: schemaDeploy.commit_sha || "",
    commit_url: schemaDeploy.commit_url || "",
    error: schemaDeploy.error || "",
  });

  return {
    ok: true,
    trace_id: traceId,
    file_path: filePath,
    inspect,
    deploy,
    schema_deploy: schemaDeploy,
    stages,
  };
}

module.exports = {
  autoEvolveToGitHub,
};
