"use strict";

const { nowIso } = require("./contracts");

function toObj(v) {
  return v && typeof v === "object" ? v : {};
}

function sanitizeHistory(history) {
  const arr = Array.isArray(history) ? history : [];
  return arr
    .map((m) => {
      if (!m || typeof m !== "object") return null;
      const role = m.role === "assistant" ? "assistant" : "user";
      const content = String(m.content || "").slice(0, 1600);
      if (!content) return null;
      const ts = Number(m.ts || Date.now());
      return { role, content, ts };
    })
    .filter(Boolean)
    .slice(-120);
}

function buildMemorySnapshot(input, state) {
  const src = toObj(input);
  const st = toObj(state);
  const knownFacts = toObj(src.known_facts);
  const profile = toObj(src.profile);
  const history = sanitizeHistory(src.history);
  const experiences = Array.isArray(st.experiences) ? st.experiences.slice(-200) : [];

  const shortTermMemory = {
    recent_conversation: history.slice(-20),
    current_task: String(src.current_task || src.action_type || "conversation"),
    active_decision: String(src.active_decision || "respond_or_route"),
    captured_at: nowIso(),
  };

  const userProfileMemory = {
    name: String(knownFacts.name || profile.name || ""),
    location: String(knownFacts.home_address || knownFacts.city || profile.location || ""),
    preferences: {
      language: String(src.language || profile.preferred_language || "English"),
      subject: String(src.subject || "General"),
      style: String(knownFacts.communication_style || profile.style || ""),
    },
    habits: {
      common_time_of_use: String(src.time_slot || "unknown"),
      frequent_requests: Array.isArray(st.frequent_requests) ? st.frequent_requests.slice(0, 12) : [],
    },
    frequently_used_apps: Array.isArray(knownFacts.frequent_apps) ? knownFacts.frequent_apps.slice(0, 20) : [],
  };

  const experienceMemory = experiences.map((x) => ({
    user_request: String(x.user_request || ""),
    ai_response: String(x.ai_response || ""),
    success: !!x.success,
    corrections: !!x.corrected,
    timestamp: String(x.timestamp || ""),
    latency_ms: Number(x.latency_ms || 0),
    module_id: String(x.module_id || ""),
  }));

  const registries = toObj(st.registries);
  const skills = [];
  Object.keys(registries).forEach((domain) => {
    const map = toObj(registries[domain]);
    Object.keys(map).forEach((moduleId) => {
      const m = toObj(map[moduleId]);
      skills.push({
        domain,
        module_id: moduleId,
        version: String(m.version || "v1"),
        score: Number(m.score || 0),
        capabilities: Array.isArray(m.capabilities) ? m.capabilities : [],
      });
    });
  });

  const skillMemory = skills;

  return {
    short_term_memory: shortTermMemory,
    user_profile_memory: userProfileMemory,
    experience_memory: experienceMemory,
    skill_memory: skillMemory,
  };
}

module.exports = {
  buildMemorySnapshot,
};
