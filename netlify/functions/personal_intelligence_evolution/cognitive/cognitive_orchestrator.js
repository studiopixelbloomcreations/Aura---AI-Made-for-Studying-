"use strict";

const { runPerception } = require("./perception_engine");
const { buildWorkingMemory } = require("./working_memory_engine");
const { chooseFocus } = require("./executive_control_engine");
const { runReflection } = require("./reflection_engine");
const { simulateScenarios } = require("./imagination_engine");

function makeTraceId() {
  return `cog_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const CognitiveOrchestrator = {
  run(envelope, context) {
    const ctx = context && typeof context === "object" ? context : {};
    const perception = runPerception(envelope);
    const workingMemory = buildWorkingMemory(perception, ctx.memory_snapshot);
    const executive = chooseFocus(workingMemory, ctx.route);
    const imagination = simulateScenarios(perception, ctx.twin_state || {});
    const reflection = runReflection(envelope, {
      rollout_mode: ctx.rollout_mode || "",
    });
    const traceId = makeTraceId();
    return {
      cognitive_trace_id: traceId,
      stages: [
        { name: "perception", ok: true, at: perception.at },
        { name: "working_memory", ok: true, at: workingMemory.at },
        { name: "executive_control", ok: true, at: executive.at },
        { name: "imagination", ok: true, at: imagination.at },
        { name: "reflection", ok: true, at: reflection.at },
      ],
      perception,
      working_memory: workingMemory,
      executive_control: executive,
      imagination,
      reflection,
    };
  },
};

module.exports = {
  CognitiveOrchestrator,
};

