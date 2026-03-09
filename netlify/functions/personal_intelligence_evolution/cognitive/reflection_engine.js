"use strict";

function runReflection(interaction, outcome) {
  const i = interaction && typeof interaction === "object" ? interaction : {};
  const o = outcome && typeof outcome === "object" ? outcome : {};
  const latency = Number(i.latency_ms || 0);
  const success = !!i.success;
  const notes = [];
  if (!success) notes.push("response_failed_or_partial");
  if (latency > 2600) notes.push("slow_response");
  if (o.rollout_mode === "hold") notes.push("high_risk_rollout");
  return {
    notes,
    improvement_signal: notes.length ? "improve_required" : "stable",
    at: new Date().toISOString(),
  };
}

module.exports = {
  runReflection,
};

