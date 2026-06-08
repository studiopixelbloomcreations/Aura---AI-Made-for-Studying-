"use strict";

const { env: readEnv } = require("./env");
const logger = require("./logger");

/**
 * LUMEN Engine — Structured long-term memory for AURA AI.
 * Uses the `lumen_memories` Supabase table (Firebase UID-based).
 * Each memory row: { user_id, category, key, value, importance, tags, source }
 *
 * Categories: personal | academic | preference | behavior | general
 * Importance: 0.0 (trivial) → 1.0 (critical)
 *
 * The Python live/memory_service.py is the server-side counterpart used by the
 * Orchestrator. This JS module is the client-side/Node accessor.
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

function env(name, fallback = "") {
  return String(readEnv(name, fallback)).trim();
}

function getConfig() {
  return {
    supabaseUrl: env("SUPABASE_URL").replace(/\/$/, ""),
    apiKey: env("SUPABASE_SERVICE_KEY") || env("SUPABASE_ANON_KEY"),
    table: "lumen_memories",
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

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const VALID_CATEGORIES = ["personal", "academic", "preference", "behavior", "general"];

function validateCategory(category) {
  const cat = String(category || "general").trim().toLowerCase();
  return VALID_CATEGORIES.includes(cat) ? cat : "general";
}

function clampImportance(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

function sanitizeUserId(userId) {
  return String(userId || "").trim();
}

// ---------------------------------------------------------------------------
// Core CRUD operations
// ---------------------------------------------------------------------------

/**
 * Save a single structured memory.
 * @param {string} userId  Firebase UID
 * @param {string} category  personal | academic | preference | behavior | general
 * @param {string} key  Short identifier (e.g. "favorite_subject")
 * @param {string} value  The actual memory content
 * @param {number} importance  0.0 → 1.0
 * @param {string[]} tags  Optional search tags
 * @param {string} source  Origin: "live", "chat", "harmony", "manual"
 */
async function saveMemory(userId, category, key, value, importance = 0.5, tags = [], source = "chat") {
  try {
    const config = ensureConfig();
    const uid = sanitizeUserId(userId);
    const cleanKey = String(key || "").trim();
    const cleanValue = String(value || "").trim();
    if (!uid || !cleanKey || !cleanValue) return { success: false, error: "missing_fields" };

    const payload = {
      user_id: uid,
      category: validateCategory(category),
      key: cleanKey,
      value: cleanValue,
      importance: clampImportance(importance),
      tags: Array.isArray(tags) ? tags.map(String) : [],
      source: String(source || "chat").trim(),
    };

    const url = `${config.supabaseUrl}/rest/v1/${config.table}`;
    const response = await fetch(url, {
      method: "POST",
      headers: headers(config),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`LUMEN save failed: ${response.status} - ${err.message || ""}`);
    }

    const rows = await response.json().catch(() => []);
    const saved = Array.isArray(rows) && rows.length ? rows[0] : null;
    logger.info("LUMEN_SAVE", { userId: uid, category: payload.category, key: cleanKey });
    return { success: true, id: saved ? saved.id : null };
  } catch (error) {
    logger.error("LUMEN_SAVE_ERROR", { error: String(error) });
    return { success: false, error: String(error) };
  }
}

/**
 * Search memories by keyword relevance for a given user.
 * Returns rows sorted by importance (desc).
 */
async function searchMemory(userId, query, limit = 5) {
  try {
    const config = ensureConfig();
    const uid = sanitizeUserId(userId);
    if (!uid || !query) return [];

    const terms = String(query).toLowerCase().split(/\s+/).filter(Boolean);
    const orConditions = terms
      .map((term) => `value.ilike.%${encodeURIComponent(term)}%`)
      .join(",");

    const url =
      `${config.supabaseUrl}/rest/v1/${config.table}` +
      `?user_id=eq.${encodeURIComponent(uid)}` +
      `&or=(${orConditions})` +
      `&order=importance.desc` +
      `&limit=${Math.min(limit, 50)}`;

    const response = await fetch(url, { method: "GET", headers: headers(config) });
    if (!response.ok) {
      if (response.status === 404) return [];
      throw new Error(`LUMEN search failed: ${response.status}`);
    }

    const rows = await response.json().catch(() => []);
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    logger.error("LUMEN_SEARCH_ERROR", { error: String(error) });
    return [];
  }
}

/**
 * Get top-N most important memories for a user (for prompt injection).
 */
async function getTopMemories(userId, limit = 5) {
  try {
    const config = ensureConfig();
    const uid = sanitizeUserId(userId);
    if (!uid) return [];

    const url =
      `${config.supabaseUrl}/rest/v1/${config.table}` +
      `?user_id=eq.${encodeURIComponent(uid)}` +
      `&order=importance.desc` +
      `&limit=${Math.min(limit, 50)}`;

    const response = await fetch(url, { method: "GET", headers: headers(config) });
    if (!response.ok) return [];

    const rows = await response.json().catch(() => []);
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    logger.error("LUMEN_TOP_ERROR", { error: String(error) });
    return [];
  }
}

/**
 * Get all memories in a specific category for a user.
 */
async function getMemoriesByCategory(userId, category, limit = 20) {
  try {
    const config = ensureConfig();
    const uid = sanitizeUserId(userId);
    if (!uid) return [];

    const url =
      `${config.supabaseUrl}/rest/v1/${config.table}` +
      `?user_id=eq.${encodeURIComponent(uid)}` +
      `&category=eq.${encodeURIComponent(validateCategory(category))}` +
      `&order=importance.desc` +
      `&limit=${Math.min(limit, 100)}`;

    const response = await fetch(url, { method: "GET", headers: headers(config) });
    if (!response.ok) return [];

    const rows = await response.json().catch(() => []);
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    logger.error("LUMEN_CATEGORY_ERROR", { error: String(error) });
    return [];
  }
}

/**
 * Update an existing memory by id.
 */
async function updateMemory(userId, memoryId, updates = {}) {
  try {
    const config = ensureConfig();
    const uid = sanitizeUserId(userId);
    if (!uid || !memoryId) return { success: false, error: "missing_fields" };

    const payload = {};
    if (updates.category) payload.category = validateCategory(updates.category);
    if (updates.key) payload.key = String(updates.key).trim();
    if (updates.value) payload.value = String(updates.value).trim();
    if (updates.importance !== undefined) payload.importance = clampImportance(updates.importance);
    if (updates.tags) payload.tags = Array.isArray(updates.tags) ? updates.tags.map(String) : [];
    payload.updated_at = new Date().toISOString();

    const url =
      `${config.supabaseUrl}/rest/v1/${config.table}` +
      `?id=eq.${encodeURIComponent(memoryId)}` +
      `&user_id=eq.${encodeURIComponent(uid)}`;

    const response = await fetch(url, {
      method: "PATCH",
      headers: headers(config),
      body: JSON.stringify(payload),
    });

    if (!response.ok) throw new Error(`LUMEN update failed: ${response.status}`);
    return { success: true };
  } catch (error) {
    logger.error("LUMEN_UPDATE_ERROR", { error: String(error) });
    return { success: false, error: String(error) };
  }
}

/**
 * Delete a memory by id (user-scoped).
 */
async function deleteMemory(userId, memoryId) {
  try {
    const config = ensureConfig();
    const uid = sanitizeUserId(userId);
    if (!uid || !memoryId) return { success: false, error: "missing_fields" };

    const url =
      `${config.supabaseUrl}/rest/v1/${config.table}` +
      `?id=eq.${encodeURIComponent(memoryId)}` +
      `&user_id=eq.${encodeURIComponent(uid)}`;

    const response = await fetch(url, {
      method: "DELETE",
      headers: headers(config),
    });

    if (!response.ok) throw new Error(`LUMEN delete failed: ${response.status}`);
    return { success: true };
  } catch (error) {
    logger.error("LUMEN_DELETE_ERROR", { error: String(error) });
    return { success: false, error: String(error) };
  }
}

// ---------------------------------------------------------------------------
// Prompt integration
// ---------------------------------------------------------------------------

/**
 * Build a prompt section from a list of memory rows.
 * Used by the system prompt builder to inject LUMEN context.
 */
function buildLumenPrompt(memories) {
  if (!Array.isArray(memories) || memories.length === 0) return "";

  const lines = [
    "--- [LUMEN MEMORY: ACTIVE] ---",
    "Relevant long-term memories about this user:",
  ];

  for (const mem of memories) {
    const cat = mem.category || "general";
    const key = mem.key || "";
    const val = mem.value || "";
    const imp = Number(mem.importance || 0).toFixed(1);
    lines.push(`- [${cat}] ${key}: ${val}  (importance: ${imp})`);
  }

  lines.push("Use these memories naturally when relevant. Never fabricate or assume beyond what is stored.");
  return lines.join("\n");
}

/**
 * Convenience: fetch top memories and build prompt in one call.
 */
async function buildLumenPromptForUser(userId, limit = 5) {
  const memories = await getTopMemories(userId, limit);
  return buildLumenPrompt(memories);
}

// ---------------------------------------------------------------------------
// Backwards compatibility (legacy email-based API → UID-based)
// ---------------------------------------------------------------------------

/**
 * @deprecated Use saveMemory() instead. Kept for backwards compatibility.
 */
async function readLumenFile(email, uniqueId) {
  // Legacy: attempt to read from lumen_memories using uniqueId as user_id
  try {
    const memories = await getTopMemories(uniqueId || email, 100);
    if (!memories.length) return null;
    const facts = {};
    memories.forEach((m) => { facts[m.key] = m.value; });
    return {
      email,
      unique_id: uniqueId,
      facts,
      base_profile: {},
      system_name: "LUMEN",
    };
  } catch {
    return null;
  }
}

/**
 * @deprecated Use saveMemory() instead.
 */
async function updateLumenMemory(email, uniqueId, newFacts = {}) {
  const uid = uniqueId || email;
  const results = [];
  for (const [key, value] of Object.entries(newFacts)) {
    results.push(await saveMemory(uid, "general", key, String(value), 0.5, [], "legacy"));
  }
  return { email, unique_id: uid, facts: newFacts, results };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // New structured API
  saveMemory,
  searchMemory,
  getTopMemories,
  getMemoriesByCategory,
  updateMemory,
  deleteMemory,
  buildLumenPrompt,
  buildLumenPromptForUser,
  VALID_CATEGORIES,

  // Legacy compatibility
  readLumenFile,
  updateLumenMemory,
  buildLumenPrompt: buildLumenPrompt,
};
