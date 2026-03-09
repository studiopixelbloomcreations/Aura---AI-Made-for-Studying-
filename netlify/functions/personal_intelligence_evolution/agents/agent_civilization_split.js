"use strict";

function strategicAgents(envelope, universeHints) {
  const msg = String(envelope && envelope.message || "");
  return {
    chief: { ok: true, directive: "maintain_safe_progress" },
    planning: { ok: true, focus: /goal|plan|roadmap/i.test(msg) ? "long_horizon" : "session_horizon" },
    world_model: { ok: true, context: "updated" },
    evolution: { ok: true, mode: "continuous" },
    safety: { ok: true, gate: "active" },
    hints: universeHints || [],
  };
}

function operationalAgents(envelope) {
  const msg = String(envelope && envelope.message || "");
  return {
    conversation: { ok: true, mode: "interactive" },
    research: { ok: /research|compare|deep|roadmap/i.test(msg) },
    memory: { ok: true, writeback: true },
    skill: { ok: true, selection: "registry" },
    automation: { ok: true, execution: "guarded" },
    reflection: { ok: true, cycle: "post_action" },
  };
}

async function runAgentCivilizationSplit(envelope, opts) {
  const hints = opts && Array.isArray(opts.hints) ? opts.hints : [];
  return {
    strategic: strategicAgents(envelope, hints),
    operational: operationalAgents(envelope),
    at: new Date().toISOString(),
  };
}

module.exports = {
  runAgentCivilizationSplit,
};

