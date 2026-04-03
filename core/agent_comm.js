function env(name, fallback = "") {
  return String(process.env[name] || fallback).trim();
}

function getConfig() {
  return {
    supabaseUrl: env("SUPABASE_URL").replace(/\/$/, ""),
    apiKey: env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_SERVICE_ROLE") || env("SUPABASE_ANON_KEY"),
    table: env("SUPABASE_PI_PROFILE_TABLE", "user_profiles"),
  };
}

function ensureConfig() {
  const config = getConfig();
  if (!config.supabaseUrl || !config.apiKey) {
    throw new Error("Missing Supabase configuration for agent communication");
  }
  return config;
}

function headers(config) {
  return {
    apikey: config.apiKey,
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates,return=representation",
  };
}

async function getUserConfig(userId) {
  const config = ensureConfig();
  const url = `${config.supabaseUrl}/rest/v1/${config.table}?select=*&user_id=eq.${encodeURIComponent(String(userId || "").trim())}&limit=1`;
  const response = await fetch(url, {
    method: "GET",
    headers: headers(config),
  });
  const rows = await response.json().catch(() => []);
  if (!response.ok) {
    throw new Error((rows && rows.message) || `Supabase get failed (${response.status})`);
  }
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function getUserConfigByIdentifier(uniqueIdentifier) {
  const config = ensureConfig();
  const url = `${config.supabaseUrl}/rest/v1/${config.table}?select=*&unique_identifier=eq.${encodeURIComponent(String(uniqueIdentifier || "").trim())}&limit=1`;
  const response = await fetch(url, {
    method: "GET",
    headers: headers(config),
  });
  const rows = await response.json().catch(() => []);
  if (!response.ok) {
    throw new Error((rows && rows.message) || `Supabase identifier lookup failed (${response.status})`);
  }
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function saveUserConfig(configPayload) {
  const config = ensureConfig();
  const payload = {
    user_id: String(configPayload.user_id || "").trim(),
    unique_identifier: String(configPayload.unique_identifier || "").trim(),
    user_config: configPayload,
    source_profile_file: String(configPayload.source_profile_file || "").trim(),
    updated_at: new Date().toISOString(),
  };
  const response = await fetch(`${config.supabaseUrl}/rest/v1/${config.table}?on_conflict=user_id`, {
    method: "POST",
    headers: headers(config),
    body: JSON.stringify(payload),
  });
  const rows = await response.json().catch(() => []);
  if (!response.ok) {
    throw new Error((rows && rows.message) || `Supabase save failed (${response.status})`);
  }
  return Array.isArray(rows) && rows.length ? rows[0] : payload;
}

module.exports = {
  getUserConfig,
  getUserConfigByIdentifier,
  saveUserConfig,
};

