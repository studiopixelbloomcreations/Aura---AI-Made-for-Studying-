"use strict";

function simulateScenarios(perception, twinState) {
  const p = perception && typeof perception === "object" ? perception : {};
  const t = twinState && typeof twinState === "object" ? twinState : {};
  const goal = String(t.current_goal || "").trim();
  const scenarioA = {
    id: "scenario_a",
    label: "focused_plan",
    expected_outcome: goal ? `Higher progress toward ${goal}` : "Higher progress on active tasks",
  };
  const scenarioB = {
    id: "scenario_b",
    label: "multi_task",
    expected_outcome: "Broader coverage with lower depth",
  };
  return {
    triggered: (p.intents || []).includes("planning") || (p.intents || []).includes("research"),
    scenarios: [scenarioA, scenarioB],
    at: new Date().toISOString(),
  };
}

module.exports = {
  simulateScenarios,
};

