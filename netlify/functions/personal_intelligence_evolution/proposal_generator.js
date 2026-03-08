"use strict";

const { createEvolutionProposal } = require("./contracts");
const { generateStageText } = require("./model_router");

function suggestedDomainForModule(moduleId) {
  const id = String(moduleId || "");
  if (!id) return "tools";
  if (id.startsWith("plugin.")) return "plugins";
  if (id.startsWith("workflow.")) return "workflows";
  if (id.startsWith("rule.") || id.includes("behavior")) return "behavior_rules";
  if (id.includes("brain")) return "behavior_rules";
  return "tools";
}

const ProposalGenerator = {
  async generate(weakness, context) {
    const w = weakness && typeof weakness === "object" ? weakness : {};
    const moduleId = String(w.module_id || "unknown");
    const domain = suggestedDomainForModule(moduleId);
    const ctx = context && typeof context === "object" ? context : {};

    const prompt = [
      "You are the Evolution Proposal Brain.",
      "Generate a safe runtime patch proposal for an evolvable module.",
      "Output JSON only with keys: strategy_note, patch, expected_benefit.",
      "patch must be shallow and compatible.",
      `Weakness: ${JSON.stringify(w).slice(0, 3500)}`,
      `Memory summary: ${JSON.stringify(ctx.memory_summary || {}).slice(0, 3500)}`,
    ].join("\n");

    const brain = await generateStageText("proposal", prompt, {});
    let patch = {
      behavior_rules: {
        retry_budget: w.type === "repeated_failures" ? 2 : 1,
        max_reply_sentences: w.type === "slow_response" ? 1 : 2,
      },
    };
    let expected = "Better task success rate and lower user corrections.";

    if (brain.ok) {
      const text = String(brain.text || "").trim();
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try {
          const parsed = JSON.parse(text.slice(start, end + 1));
          if (parsed && typeof parsed.patch === "object") {
            patch = parsed.patch;
          }
          if (parsed && parsed.expected_benefit) {
            expected = String(parsed.expected_benefit).slice(0, 300);
          }
        } catch (e) {
          // Use safe fallback patch.
        }
      }
    }

    const patchSpec = {
      domain,
      patch,
      strategy_note: brain.ok ? "proposal_brain_generated" : "fallback_patch_generated",
    };

    return createEvolutionProposal(w, patchSpec, expected, brain.model_used || "gemini-1.5-pro");
  },
};

module.exports = {
  ProposalGenerator,
};
