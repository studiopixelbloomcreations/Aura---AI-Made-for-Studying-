"use strict";

const { getModule } = require("./tool_registry");
const { generateStageText } = require("./model_router");

const PROTECTED_DOMAINS = new Set([
  "core_brain",
  "security",
  "evolution_controller",
  "main_entrypoint",
]);

function validatePatchShape(patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return { ok: false, reason: "patch must be an object" };
  }
  const forbidden = ["__proto__", "constructor", "prototype"];
  for (const k of Object.keys(patch)) {
    if (forbidden.includes(k)) {
      return { ok: false, reason: `forbidden key: ${k}` };
    }
  }
  return { ok: true, reason: "" };
}

function interfaceCompatibility(module, patch) {
  const m = module && typeof module === "object" ? module : {};
  const p = patch && typeof patch === "object" ? patch : {};
  if (p.capabilities && !Array.isArray(p.capabilities)) {
    return { ok: false, reason: "capabilities must remain an array" };
  }
  if (p.required_permissions && !Array.isArray(p.required_permissions)) {
    return { ok: false, reason: "required_permissions must remain an array" };
  }
  if (m.tests && !Array.isArray(m.tests)) {
    return { ok: false, reason: "existing module tests contract invalid" };
  }
  return { ok: true, reason: "" };
}

function behaviorValidation(weaknessType, patch) {
  const p = patch && typeof patch === "object" ? patch : {};
  const rules = p.behavior_rules && typeof p.behavior_rules === "object" ? p.behavior_rules : {};
  if (weaknessType === "slow_response") {
    const maxSentences = Number(rules.max_reply_sentences || 2);
    if (maxSentences > 4) {
      return { ok: false, reason: "slow response patch must not increase verbosity too much" };
    }
  }
  if (weaknessType === "repeated_failures") {
    const retry = Number(rules.retry_budget || 0);
    if (retry < 1 || retry > 5) {
      return { ok: false, reason: "retry_budget out of safe range" };
    }
  }
  return { ok: true, reason: "" };
}

const SandboxRunner = {
  async evaluate(proposal, runtimeState) {
    const st = runtimeState && typeof runtimeState === "object" ? runtimeState : {};
    const spec = proposal && proposal.patch_spec ? proposal.patch_spec : {};
    const domain = String(spec.domain || "");
    const moduleId = String(proposal && proposal.module_responsible || "");
    const patch = spec.patch && typeof spec.patch === "object" ? spec.patch : {};

    const tests = [];

    if (PROTECTED_DOMAINS.has(domain)) {
      tests.push({ name: "protected_domain", passed: false, detail: `domain ${domain} is protected` });
      return { passed: false, tests, model_used: "none", notes: "blocked_by_safety" };
    }

    const evolvable = new Set(["tools", "plugins", "behavior_rules", "workflows"]);
    if (!evolvable.has(domain)) {
      tests.push({ name: "evolvable_domain", passed: false, detail: `domain ${domain} is not evolvable` });
      return { passed: false, tests, model_used: "none", notes: "blocked_by_allowlist" };
    }

    const shape = validatePatchShape(patch);
    tests.push({ name: "syntax_shape_validation", passed: shape.ok, detail: shape.reason || "ok" });
    if (!shape.ok) return { passed: false, tests, model_used: "none", notes: "shape_validation_failed" };

    const currentModule = getModule(st.registries || {}, domain, moduleId) || {};
    const compat = interfaceCompatibility(currentModule, patch);
    tests.push({ name: "interface_compatibility", passed: compat.ok, detail: compat.reason || "ok" });
    if (!compat.ok) return { passed: false, tests, model_used: "none", notes: "interface_validation_failed" };

    const behavior = behaviorValidation(String(proposal.weakness_type || ""), patch);
    tests.push({ name: "behavior_testing", passed: behavior.ok, detail: behavior.reason || "ok" });
    if (!behavior.ok) return { passed: false, tests, model_used: "none", notes: "behavior_validation_failed" };

    const prompt = [
      "You are the proposal test brain.",
      "Perform a short compatibility verdict for this runtime patch.",
      "Answer exactly PASS or FAIL with a short reason.",
      JSON.stringify({
        domain,
        moduleId,
        weakness_type: proposal.weakness_type,
        patch,
      }).slice(0, 5000),
    ].join("\n");
    const brain = await generateStageText("test", prompt, {});
    const brainText = String(brain.text || "").toUpperCase();
    const brainPass = !brain.ok || brainText.includes("PASS");
    tests.push({
      name: "brain_compatibility_review",
      passed: brainPass,
      detail: brain.ok ? String(brain.text || "").slice(0, 200) : String(brain.error || "brain unavailable"),
    });

    const passed = tests.every((t) => t.passed);
    return {
      passed,
      tests,
      model_used: brain.model_used || "gemini-1.5-pro",
      notes: passed ? "sandbox_passed" : "sandbox_rejected",
    };
  },
};

module.exports = {
  SandboxRunner,
  PROTECTED_DOMAINS,
};
