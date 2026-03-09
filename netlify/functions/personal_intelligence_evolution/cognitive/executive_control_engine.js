"use strict";

function chooseFocus(workingMemory, route) {
  const wm = workingMemory && typeof workingMemory === "object" ? workingMemory : {};
  const intents = Array.isArray(wm.active_intents) ? wm.active_intents : ["general"];
  const target = route && route.target ? String(route.target) : "cloud";
  let priority = "balanced";
  if (intents.includes("research")) priority = "evidence_heavy";
  else if (intents.includes("planning")) priority = "strategy_heavy";
  else if (intents.includes("personal_fact")) priority = "memory_update";
  return {
    target_runtime: target,
    priority_mode: priority,
    next_stage: "reasoning",
    at: new Date().toISOString(),
  };
}

module.exports = {
  chooseFocus,
};

