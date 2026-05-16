const { env: readEnv } = require("./env");
const logger = require("./logger");

function env(name, fallback = "") {
  return String(readEnv(name, fallback)).trim();
}

function getConfig() {
  return {
    supabaseUrl: env("SUPABASE_URL").replace(/\/$/, ""),
    apiKey: env("SUPABASE_SERVICE_KEY") || env("SUPABASE_ANON_KEY"),
    table: "lumen_archives",
  };
}

function ensureConfig() {
  const config = getConfig();
  if (!config.supabaseUrl || !config.apiKey) {
    throw new Error("Missing Supabase configuration for LUMEN");
  }
  return config;
}

function headers(config) {
  return {
    apikey: config.apiKey,
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

function upsertHeaders(config) {
  return {
    apikey: config.apiKey,
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates,return=representation",
  };
}

function sanitizeEmail(email) {
  return String(email || "guest@student.com").trim().toLowerCase();
}

async function readLumenFile(email, uniqueId) {
  try {
    const config = ensureConfig();
    const e = encodeURIComponent(sanitizeEmail(email));
    const u = encodeURIComponent(String(uniqueId || "").trim());
    if (!u) return null;

    const url = `${config.supabaseUrl}/rest/v1/${config.table}?email=eq.${e}&unique_id=eq.${u}&limit=1`;
    const response = await fetch(url, { method: "GET", headers: headers(config) });
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`LUMEN read failed: ${response.status}`);
    }
    const rows = await response.json().catch(() => []);
    if (!Array.isArray(rows) || !rows.length) return null;

    const row = rows[0];
    return {
      email: row.email,
      unique_id: row.unique_id,
      facts: row.facts || {},
      base_profile: row.base_profile || {},
      system_name: row.system_name || "LUMEN",
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  } catch (error) {
    logger.error("LUMEN_READ_ERROR", { error: String(error) });
    return null;
  }
}

async function writeLumenFile(email, uniqueId, data = {}) {
  try {
    const config = ensureConfig();
    const cleanEmail = sanitizeEmail(email);
    const cleanUid = String(uniqueId || "").trim();
    if (!cleanUid) return false;

    const payload = {
      email: cleanEmail,
      unique_id: cleanUid,
      facts: data.facts || {},
      base_profile: data.base_profile || {},
      system_name: data.system_name || "LUMEN (Lifelong User Memory Evolution Network)",
      updated_at: new Date().toISOString(),
    };

    // Upsert using the file_key (email + unique_id) generated column
    const url = `${config.supabaseUrl}/rest/v1/${config.table}?on_conflict=file_key`;
    const response = await fetch(url, {
      method: "POST",
      headers: upsertHeaders(config),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`LUMEN write failed: ${response.status} - ${err.message || ""}`);
    }
    return true;
  } catch (error) {
    logger.error("LUMEN_WRITE_ERROR", { error: String(error) });
    return false;
  }
}

async function initLumenFile(email, uniqueId, initialProfile = {}) {
  const existing = await readLumenFile(email, uniqueId);
  if (existing) return existing;

  const cleanEmail = sanitizeEmail(email);
  const cleanUid = String(uniqueId || "").trim();

  const initialMemory = {
    email: cleanEmail,
    unique_id: cleanUid,
    facts: {},
    base_profile: initialProfile,
    system_name: "LUMEN (Lifelong User Memory Evolution Network)",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await writeLumenFile(cleanEmail, cleanUid, initialMemory);
  return initialMemory;
}

async function updateLumenMemory(email, uniqueId, newFacts = {}) {
  let memory = await readLumenFile(email, uniqueId);
  if (!memory) {
    memory = {
      email: sanitizeEmail(email),
      unique_id: String(uniqueId || "").trim(),
      facts: {},
      base_profile: {},
      system_name: "LUMEN (Lifelong User Memory Evolution Network)",
    };
  }

  memory.facts = Object.assign({}, memory.facts || {}, newFacts);
  memory.updated_at = new Date().toISOString();

  await writeLumenFile(memory.email, memory.unique_id, memory);
  return memory;
}

function buildLumenPrompt(memory) {
  if (!memory || !memory.facts || Object.keys(memory.facts).length === 0) {
    return "";
  }

  const lines = [
    "--- [LUMEN ARCHIVE: ACTIVE] ---",
    "The following are deeply learned facts about this specific user across all time:",
  ];
  Object.keys(memory.facts).forEach((k) => {
    lines.push(`- ${k}: ${memory.facts[k]}`);
  });
  lines.push("Always incorporate these facts naturally into your reasoning. This is the user's permanent memory engram.");

  return lines.join("\n");
}

module.exports = {
  readLumenFile,
  writeLumenFile,
  initLumenFile,
  updateLumenMemory,
  buildLumenPrompt,
};
