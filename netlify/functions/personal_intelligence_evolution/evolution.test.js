"use strict";

const assert = require("assert");
const { buildMemorySnapshot } = require("./memory_facade");
const { initRegistries } = require("./tool_registry");
const { SandboxRunner } = require("./sandbox_runner");
const { EvolutionEngine } = require("./evolution_engine");
const { CloudStateStore } = require("./cloud_state_store");
const { SwarmTaskQueue } = require("./swarm_task_queue");
const { routeRequest } = require("./hybrid_router");

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
    assert(out.phases_3_to_9_status);
    assert(out.pcos_status);
    assert(out.cognitive_trace_id);
    assert(typeof out.twin_state_version === "number");
    if (out.proposal_trace_id) observedTrace = out.proposal_trace_id;
  }

  assert(observedTrace.length > 0, "expected at least one proposal trace id");
}

async function testQueueDeadLetterBehavior() {
  const store = new CloudStateStore();
  const queue = new SwarmTaskQueue(store);

  const enq = await queue.enqueueFromInteraction({
    message: "research this deeply and compare options",
    known_facts: { name: "Test User" },
  });
  assert.strictEqual(enq.ok, true);
  assert.strictEqual(enq.enqueued, true);

  const loaded = await queue.load();
  assert.strictEqual(loaded.ok, true);
  const task = loaded.queue.tasks.find((t) => t && t.id === enq.task_id);
  assert(task, "expected enqueued task to exist");
  task.max_retries = 0;
  const saved = await queue.save(loaded.queue, loaded.sha);
  assert.strictEqual(saved.ok, true);

  const processed = await queue.processPending(async () => {
    throw new Error("forced failure");
  }, 1, { backoff_base_ms: 1000 });
  assert.strictEqual(processed.ok, true);
  assert.strictEqual(processed.dead_lettered_count >= 1, true);
}

async function testCloudOnlyPolicy() {
  const route = routeRequest({ message: "quick hi" });
  assert.strictEqual(route.target, "cloud");
  assert.strictEqual(route.local_runtime_allowed, false);
}

async function testPcosPersistence() {
  const store = new CloudStateStore();
  const twin = await store.readDoc("digital_twin_state", {});
  assert.strictEqual(twin.ok, true);
  const traces = await store.readDoc("cognitive_traces", { traces: [] });
  assert.strictEqual(traces.ok, true);
}

async function run() {
  await testMemoryFacade();
  await testSafetyRestrictions();
  await testSandboxRejectInvalidPatch();
  await testEndToEndEvolutionCycle();
  await testQueueDeadLetterBehavior();
  await testCloudOnlyPolicy();
  await testPcosPersistence();
  console.log("evolution tests: ok");
}

run().catch((e) => {
  console.error("evolution tests: failed", e);
  process.exit(1);
});
