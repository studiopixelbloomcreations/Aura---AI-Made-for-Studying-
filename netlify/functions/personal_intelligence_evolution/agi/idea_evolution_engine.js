"use strict";

function evolveIdea(text) {
  const t = String(text || "");
  const base = t.slice(0, 220) || "general_idea";
  return {
    generated: true,
    stages: [
      { stage: "idea_generation", output: base },
      { stage: "refinement", output: `${base} with clearer scope` },
      { stage: "feasibility", output: "feasible_with_incremental_delivery" },
      { stage: "roadmap", output: "define_mvp_then_iterate" },
    ],
  };
}

module.exports = {
  evolveIdea,
};

