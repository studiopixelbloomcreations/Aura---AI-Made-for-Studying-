"use strict";

function buildWorkingMemory(perception, memorySnapshot) {
  const p = perception && typeof perception === "object" ? perception : {};
  const ms = memorySnapshot && typeof memorySnapshot === "object" ? memorySnapshot : {};
  const recent = ms.short_term_memory && Array.isArray(ms.short_term_memory.recent_conversation)
    ? ms.short_term_memory.recent_conversation.slice(-24)
    : [];
  const facts = ms.user_profile_memory && typeof ms.user_profile_memory === "object"
    ? ms.user_profile_memory
    : {};
  return {
    active_intents: Array.isArray(p.intents) ? p.intents : ["general"],
    recent_context: recent,
    profile_facts: facts,
    context_size: recent.length,
    at: new Date().toISOString(),
  };
}

module.exports = {
  buildWorkingMemory,
};

