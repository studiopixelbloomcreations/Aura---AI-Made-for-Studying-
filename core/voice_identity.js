"use strict";

const { getConfigSection } = require("./config_loader");

const ONBOARDING_PHRASES = [
  "Hey Aevra, this is my voice.",
  "Aevra, help me study with focus.",
  "My learning should feel personal.",
  "I want clear explanations and practice.",
  "Please remember my study patterns.",
  "Aevra, verify me by my voice.",
  "I am ready for adaptive learning.",
  "Use my voice to load my profile.",
  "Keep my identity secure.",
  "Aevra AI is my study partner.",
];

function embeddingFromText(text) {
  const bins = new Array(32).fill(0);
  const raw = String(text || "").toLowerCase();
  for (let i = 0; i < raw.length; i += 1) {
    bins[i % bins.length] += raw.charCodeAt(i) / 255;
  }
  const mag = Math.sqrt(bins.reduce((sum, n) => sum + n * n, 0)) || 1;
  return bins.map((n) => Number((n / mag).toFixed(6)));
}

function cosine(a, b) {
  const left = Array.isArray(a) ? a : [];
  const right = Array.isArray(b) ? b : [];
  const len = Math.min(left.length, right.length);
  if (!len) return 0;
  let dot = 0;
  let am = 0;
  let bm = 0;
  for (let i = 0; i < len; i += 1) {
    dot += Number(left[i] || 0) * Number(right[i] || 0);
    am += Number(left[i] || 0) ** 2;
    bm += Number(right[i] || 0) ** 2;
  }
  return dot / ((Math.sqrt(am) || 1) * (Math.sqrt(bm) || 1));
}

function buildVoiceEmbedding(samples) {
  const list = Array.isArray(samples) ? samples : [samples];
  const vectors = list.map((sample) => embeddingFromText(sample)).filter((v) => v.length);
  if (!vectors.length) return [];
  return vectors[0].map((_, index) => {
    const avg = vectors.reduce((sum, vector) => sum + Number(vector[index] || 0), 0) / vectors.length;
    return Number(avg.toFixed(6));
  });
}

async function supabaseRequest(path, options) {
  const supabase = getConfigSection("supabase");
  const key = supabase.serviceRoleKey || supabase.anonKey || "";
  if (!supabase.url || !key) throw new Error("Supabase is not configured");
  const response = await fetch(`${String(supabase.url).replace(/\/$/, "")}${path}`, {
    ...options,
    headers: Object.assign({
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    }, options && options.headers || {}),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((body && body.message) || `Supabase HTTP ${response.status}`);
  return body;
}

async function enrollVoiceProfile(userId, displayName, phraseSamples) {
  const embedding = buildVoiceEmbedding(phraseSamples);
  const row = {
    user_id: String(userId || "").trim(),
    display_name: String(displayName || "").trim(),
    wake_word: "hey aevra",
    embedding: { model: "aevra-text-audio-proxy-v1", vector: embedding },
    enrollment_phrases: Array.isArray(phraseSamples) ? phraseSamples.slice(0, 10) : [],
    verification_score: 1,
    updated_at: new Date().toISOString(),
  };
  const saved = await supabaseRequest("/rest/v1/voice_identity_profiles?on_conflict=user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(row),
  });
  return Array.isArray(saved) ? saved[0] : saved;
}

async function matchVoiceProfile(transcript) {
  const rows = await supabaseRequest("/rest/v1/voice_identity_profiles?select=*&limit=100", { method: "GET" });
  const probe = buildVoiceEmbedding([transcript]);
  let best = null;
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const vector = row && row.embedding && row.embedding.vector;
    const score = cosine(probe, vector);
    if (!best || score > best.score) best = { row, score };
  });
  return best && best.score >= 0.72
    ? { matched: true, score: Number(best.score.toFixed(4)), profile: best.row }
    : { matched: false, score: best ? Number(best.score.toFixed(4)) : 0, profile: null };
}

module.exports = {
  ONBOARDING_PHRASES,
  buildVoiceEmbedding,
  enrollVoiceProfile,
  matchVoiceProfile,
};
