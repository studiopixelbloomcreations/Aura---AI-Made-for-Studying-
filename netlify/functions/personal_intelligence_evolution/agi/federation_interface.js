"use strict";

function getFederationState() {
  const enabled = String(process.env.PI_FEDERATION_ENABLED || "false").trim().toLowerCase() === "true";
  return {
    enabled,
    mode: enabled ? "federation_active" : "disabled_by_default",
    interfaces: enabled ? ["insight_exchange_v1", "anonymized_pattern_feed_v1"] : [],
  };
}

module.exports = {
  getFederationState,
};

