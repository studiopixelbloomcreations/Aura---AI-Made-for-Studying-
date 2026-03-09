"use strict";

function routeRequest(envelope) {
  const e = envelope && typeof envelope === "object" ? envelope : {};
  const mode = "cloud_only";
  const text = String(e.message || "").toLowerCase();
  const wantsResearch = /research|compare|analy|roadmap|deep|plan/i.test(text);
  const wantsLongReasoning = /step by step|strategy|long term|project|career/i.test(text);

  return {
    runtime_mode: mode,
    target: "cloud",
    reason: wantsResearch || wantsLongReasoning ? "complex_cloud_reasoning" : "cloud_policy_forced",
    local_runtime_allowed: false,
  };
}

module.exports = {
  routeRequest,
};
