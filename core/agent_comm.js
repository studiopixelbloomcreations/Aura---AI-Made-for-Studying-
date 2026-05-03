const { env: readEnv } = require("./env");

function env(name, fallback = "") {
  return String(readEnv(name, fallback)).trim();
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
    throw new Error("Missing Supabase configuration for Personal Intelligence profiles");
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

async function parseResponse(response) {
  return response.json().catch(() => ({}));
}

async function getUserProfile(user_id) {
  const config = ensureConfig();
  const userId = encodeURIComponent(String(user_id || "").trim());
  const urls = [
    `${config.supabaseUrl}/rest/v1/${config.table}?select=*&user_id=eq.${userId}&limit=1`,
    `${config.supabaseUrl}/rest/v1/${config.table}?select=user_id,personalization_data,unique_id,created_at,updated_at,user_config,unique_identifier,source_profile_file&user_id=eq.${userId}&limit=1`,
  ];
  let lastError = null;
  for (const url of urls) {
    const response = await fetch(url, { method: "GET", headers: headers(config) });
    const rows = await parseResponse(response);
    if (response.ok) {
      const row = Array.isArray(rows) && rows.length ? rows[0] : null;
      if (!row) return null;
      return normalizeLegacyProfile(row);
    }
    lastError = (rows && rows.message) || `Supabase get failed (${response.status})`;
  }
  throw new Error(lastError || "Supabase get failed");
}

async function getUserProfileByUniqueId(unique_id) {
  const config = ensureConfig();
  const uniqueId = encodeURIComponent(String(unique_id || "").trim());
  const urls = [
    `${config.supabaseUrl}/rest/v1/${config.table}?select=*&unique_id=eq.${uniqueId}&limit=1`,
    `${config.supabaseUrl}/rest/v1/${config.table}?select=user_id,personalization_data,unique_id,created_at,updated_at,user_config,unique_identifier,source_profile_file&unique_identifier=eq.${uniqueId}&limit=1`,
  ];
  let lastError = null;
  for (const url of urls) {
    const response = await fetch(url, { method: "GET", headers: headers(config) });
    const rows = await parseResponse(response);
    if (response.ok) {
      const row = Array.isArray(rows) && rows.length ? rows[0] : null;
      return row ? normalizeLegacyProfile(row) : null;
    }
    lastError = (rows && rows.message) || `Supabase unique_id lookup failed (${response.status})`;
  }
  throw new Error(lastError || "Supabase unique_id lookup failed");
}

async function saveUserProfile(user_id, data = {}) {
  const config = ensureConfig();
  const payload = {
    user_id: String(user_id || data.user_id || "").trim(),
    personalization_data: data.personalization_data || {},
    ai_config: data.ai_config || {},
    unique_id: String(data.unique_id || "").trim(),
    updated_at: new Date().toISOString(),
  };
  const legacyPayload = {
    user_id: payload.user_id,
    unique_identifier: payload.unique_id,
    user_config: {
      user_id: payload.user_id,
      personalization_data: payload.personalization_data,
      ai_config: payload.ai_config,
      unique_id: payload.unique_id,
    },
    updated_at: payload.updated_at,
  };

  const payloads = [payload, legacyPayload];
  let lastError = null;
  for (const candidate of payloads) {
    const response = await fetch(`${config.supabaseUrl}/rest/v1/${config.table}?on_conflict=user_id`, {
      method: "POST",
      headers: headers(config),
      body: JSON.stringify(candidate),
    });
    const rows = await parseResponse(response);
    if (response.ok) {
      const row = Array.isArray(rows) && rows.length ? rows[0] : candidate;
      return normalizeLegacyProfile(row);
    }
    lastError = (rows && rows.message) || `Supabase save failed (${response.status})`;
  }
  throw new Error(lastError || "Supabase save failed");
}

async function updateUserMemory(user_id, memory = {}) {
  const existing = await getUserProfile(user_id);
  const personalization_data = Object.assign({}, existing && existing.personalization_data || {}, {
    memory: Object.assign({}, existing && existing.personalization_data && existing.personalization_data.memory || {}, memory || {}),
  });
  return saveUserProfile(user_id, {
    personalization_data,
    ai_config: existing && existing.ai_config || {},
    unique_id: existing && existing.unique_id || "",
  });
}

module.exports = {
  getUserProfile,
  getUserProfileByUniqueId,
  saveUserProfile,
  updateUserMemory,
};

function normalizeLegacyProfile(row) {
  const item = row && typeof row === "object" ? row : {};
  const userConfig = item.user_config && typeof item.user_config === "object" ? item.user_config : {};
  return {
    ...item,
    personalization_data: item.personalization_data || userConfig.personalization_data || {},
    ai_config: item.ai_config || userConfig.ai_config || {},
    unique_id: item.unique_id || item.unique_identifier || userConfig.unique_id || "",
  };
}
