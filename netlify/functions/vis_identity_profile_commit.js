"use strict";

function json(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type,authorization",
    },
    body: JSON.stringify(obj),
  };
}

function sanitizeFileName(name) {
  const raw = String(name || "").trim().toLowerCase();
  const safe = raw
    .replace(/[^a-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!safe) return "";
  return safe.endsWith(".piuser.json") ? safe : (safe + ".piuser.json");
}

function endpoint(owner, repo, filePath) {
  return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${filePath
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

async function githubGetSha(token, owner, repo, branch, filePath) {
  const url = `${endpoint(owner, repo, filePath)}?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (res.status === 404) return { ok: true, exists: false, sha: "" };
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: String((data && data.message) || `HTTP_${res.status}`) };
  return { ok: true, exists: true, sha: String(data.sha || "") };
}

async function githubPutFile(token, owner, repo, branch, filePath, contentText, sha, message) {
  const url = endpoint(owner, repo, filePath);
  const body = {
    message: String(message || "vis: update identity profile"),
    content: Buffer.from(String(contentText || ""), "utf-8").toString("base64"),
    branch: branch,
  };
  if (sha) body.sha = sha;

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: String((data && data.message) || `HTTP_${res.status}`) };
  return {
    ok: true,
    sha: String((data && data.content && data.content.sha) || ""),
    commit_sha: String((data && data.commit && data.commit.sha) || ""),
  };
}

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "Method not allowed" });

  let payload = {};
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const profile = payload && payload.profile && typeof payload.profile === "object" ? payload.profile : null;
  const requestedFile = sanitizeFileName((payload && payload.file_name) || (profile && profile.file_name) || "");
  if (!profile || !requestedFile) return json(400, { ok: false, error: "profile and valid file_name are required" });

  const token = String(process.env.GITHUB_TOKEN || "").trim();
  const owner = String(process.env.GITHUB_REPO_OWNER || "").trim();
  const repo = String(process.env.GITHUB_REPO_NAME || "").trim();
  const branch = String(process.env.GITHUB_REPO_BRANCH || "main").trim();
  const basePath = String(process.env.PI_VIS_PROFILE_REPO_PATH || "vis_identity_profiles").trim().replace(/\/+$/, "");
  if (!token || !owner || !repo) {
    return json(500, { ok: false, error: "Missing GITHUB_TOKEN/GITHUB_REPO_OWNER/GITHUB_REPO_NAME" });
  }

  const filePath = `${basePath}/${requestedFile}`;
  const content = JSON.stringify(profile, null, 2) + "\n";
  const message = String((payload && payload.commit_message) || `vis: save ${requestedFile}`).slice(0, 180);

  const existing = await githubGetSha(token, owner, repo, branch, filePath);
  if (!existing.ok) return json(500, { ok: false, error: existing.error, file_path: filePath });

  const put = await githubPutFile(token, owner, repo, branch, filePath, content, existing.sha || "", message);
  if (!put.ok) return json(500, { ok: false, error: put.error, file_path: filePath });

  return json(200, {
    ok: true,
    storage: "github",
    file_path: filePath,
    sha: put.sha || "",
    commit_sha: put.commit_sha || "",
  });
};
