"use strict";

const assert = require("assert");
const { buildMemorySnapshot } = require("./memory_facade");
const { initRegistries } = require("./tool_registry");
const { SandboxRunner } = require("./sandbox_runner");
const { EvolutionEngine } = require("./evolution_engine");

async function testMemoryFacade() {
  const snapshot = buildMemorySnapshot(
    {
      known_facts: { name: "Asha", city: "Colombo", frequent_apps: ["Spotify", "Maps"] },
      history: [{ role: "user", content: "help me with homework", ts: Date.now() }],
      language: "English",
      subject: "Science",
    },
    {
      experiences: [
        {
          user_request: "Q1",
          ai_response: "A1",
          success: true,
          corrected: false,
          timestamp: new Date().toISOString(),
          latency_ms: 320,
          module_id: "brain.main",
        },
      ],
      frequent_requests: ["study_support"],
      registries: initRegistries(),
    }
  );

  assert(snapshot.short_term_memory);
  assert(snapshot.user_profile_memory);
  assert(snapshot.experience_memory);
  assert(snapshot.skill_memory);
  assert.strictEqual(snapshot.user_profile_memory.name, "Asha");
}

async function testSafetyRestrictions() {
  const proposal = {
    module_responsible: "security.auth_guard",
    weakness_type: "repeated_failures",
    patch_spec: {
      domain: "security",
      patch: { behavior_rules: { retry_budget: 1 } },
    },
  };
  const report = await SandboxRunner.evaluate(proposal, { registries: initRegistries() });
  assert.strictEqual(report.passed, false);
  assert(report.tests.some((t) => t.name === "protected_domain" && t.passed === false));
}

async function testSandboxRejectInvalidPatch() {
  const proposal = {
    module_responsible: "directions_home",
    weakness_type: "repeated_failures",
    patch_spec: {
      domain: "tools",
      patch: ["not-object"],
    },
  };
  const report = await SandboxRunner.evaluate(proposal, { registries: initRegistries() });
  assert.strictEqual(report.passed, false);
  assert(report.tests.some((t) => t.name === "syntax_shape_validation" && t.passed === false));
}

async function testEndToEndEvolutionCycle() {
  let observedTrace = "";
  for (let i = 0; i < 4; i++) {
    const out = await EvolutionEngine.processInteraction({
      timestamp: new Date().toISOString(),
      message: "navigate home now",
      response: "I need your home address first.",
      success: false,
      corrected: true,
      latency_ms: 3400,
      module_id: "directions_home",
      action: { type: "directions_home" },
      ai_provider: "local_action",
      ai_error: "",
      history: [{ role: "user", content: "navigate home" }],
      known_facts: {},
      language: "English",
      subject: "General",
    });

    assert(out.evolution_status);
    assert(out.active_module_versions);
    if (out.proposal_trace_id) observedTrace = out.proposal_trace_id;
  }

  assert(observedTrace.length > 0, "expected at least one proposal trace id");
}

async function run() {
  await testMemoryFacade();
  await testSafetyRestrictions();
  await testSandboxRejectInvalidPatch();
  await testEndToEndEvolutionCycle();
  console.log("evolution tests: ok");
}

run().catch((e) => {
  console.error("evolution tests: failed", e);
  process.exit(1);
});
