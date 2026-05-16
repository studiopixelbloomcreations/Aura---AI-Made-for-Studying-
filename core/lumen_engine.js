const { env: readEnv } = require("./env");
const logger = require("./logger");

function env(name, fallback = "") {
  return String(readEnv(name, fallback)).trim();
}

function getConfig() {
  return {
    supabaseUrl: env("SUPABASE_URL").replace(/\/$/, ""),
    apiKey: env("SUPABASE_SERVICE_KEY") || env("SUPABASE_ANON_KEY"),
    bucket: env("SUPABASE_LUMEN_BUCKET", "lumen_archives"),
  };
}

function ensureConfig() {
  const config = getConfig();
  if (!config.supabaseUrl || !config.apiKey) {
    throw new Error("Missing Supabase configuration for LUMEN");
  }
  return config;
}

function headers(config, isUpload = false) {
  const h = {
    apikey: config.apiKey,
    Authorization: `Bearer ${config.apiKey}`,
  };
  if (isUpload) {
    h["Content-Type"] = "application/json";
    h["x-upsert"] = "true";
  }
  return h;
}

function sanitizeEmail(email) {
  return String(email || "guest").replace(/[^a-zA-Z0-9@.-]/g, "_");
}

let bucketEnsured = false;
async function ensureBucketExists(config) {
  if (bucketEnsured) return;
  try {
    const url = `${config.supabaseUrl}/storage/v1/bucket`;
    // Try to get the bucket first
    const getRes = await fetch(`${url}/${config.bucket}`, { method: "GET", headers: headers(config) });
    if (getRes.ok) {
      bucketEnsured = true;
      return;
    }
    // If it doesn't exist, create it
    const createRes = await fetch(url, {
      method: "POST",
      headers: headers(config, true),
      body: JSON.stringify({ id: config.bucket, name: config.bucket, public: false })
    });
    if (createRes.ok || createRes.status === 409) {
      bucketEnsured = true;
    } else {
      logger.error("LUMEN_BUCKET_CREATE_ERROR", { status: createRes.status });
    }
  } catch (e) {
    logger.error("LUMEN_BUCKET_ENSURE_ERROR", { error: String(e) });
  }
}

function getFilename(email, uniqueId) {
  return `${sanitizeEmail(email)}_${String(uniqueId || "unknown").trim()}.json`;
}

async function readLumenFile(email, uniqueId) {
  try {
    const config = ensureConfig();
    await ensureBucketExists(config);
    const filename = getFilename(email, uniqueId);
    const url = `${config.supabaseUrl}/storage/v1/object/authenticated/${config.bucket}/${filename}`;
    
    const response = await fetch(url, { method: "GET", headers: headers(config) });
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`LUMEN read failed: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    logger.error("LUMEN_READ_ERROR", { error: String(error) });
    return null;
  }
}

async function writeLumenFile(email, uniqueId, data = {}) {
  try {
    const config = ensureConfig();
    await ensureBucketExists(config);
    const filename = getFilename(email, uniqueId);
    // Use POST with x-upsert: true for Supabase Storage to overwrite or create
    const url = `${config.supabaseUrl}/storage/v1/object/${config.bucket}/${filename}`;
    
    const response = await fetch(url, {
      method: "POST",
      headers: headers(config, true),
      body: JSON.stringify(data, null, 2),
    });
    
    if (!response.ok) {
      // If POST fails, try PUT as fallback for some Supabase versions
      const putResponse = await fetch(url, {
        method: "PUT",
        headers: headers(config, true),
        body: JSON.stringify(data, null, 2),
      });
      if (!putResponse.ok) {
        throw new Error(`LUMEN write failed: ${putResponse.status}`);
      }
    }
    return true;
  } catch (error) {
    logger.error("LUMEN_WRITE_ERROR", { error: String(error) });
    return false;
  }
}

async function initLumenFile(email, uniqueId, initialProfile = {}) {
  const existing = await readLumenFile(email, uniqueId);
  if (existing) return existing; // Already exists

  const initialMemory = {
    email,
    unique_id: uniqueId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    facts: {},
    system_name: "LUMEN (Lifelong User Memory Evolution Network)",
    base_profile: initialProfile
  };

  await writeLumenFile(email, uniqueId, initialMemory);
  return initialMemory;
}

async function updateLumenMemory(email, uniqueId, newFacts = {}) {
  let memory = await readLumenFile(email, uniqueId);
  if (!memory) {
    memory = {
      email,
      unique_id: uniqueId,
      created_at: new Date().toISOString(),
      facts: {},
      system_name: "LUMEN (Lifelong User Memory Evolution Network)"
    };
  }

  memory.updated_at = new Date().toISOString();
  memory.facts = Object.assign({}, memory.facts || {}, newFacts);

  await writeLumenFile(email, uniqueId, memory);
  return memory;
}

function buildLumenPrompt(memory) {
  if (!memory || !memory.facts || Object.keys(memory.facts).length === 0) {
    return "";
  }
  
  const lines = ["--- [LUMEN ARCHIVE: ACTIVE] ---", "The following are deeply learned facts about this specific user across all time:"];
  Object.keys(memory.facts).forEach(k => {
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
