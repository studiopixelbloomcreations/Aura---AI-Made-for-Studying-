"use strict";

function runHierarchy(envelope) {
  const text = String(envelope && envelope.message || "");
  const fast = { ok: true, confidence: 0.65 };
  const analytical = { ok: /why|how|explain|compare|analy/i.test(text), confidence: 0.72 };
  const strategic = { ok: /goal|plan|strategy|roadmap|career/i.test(text), confidence: 0.78 };
  const longTerm = { ok: /year|long term|multi-year|future/i.test(text), confidence: 0.8 };
  let selected = "fast";
  if (longTerm.ok) selected = "long_term";
  else if (strategic.ok) selected = "strategic";
  else if (analytical.ok) selected = "analytical";
  return {
    selected_level: selected,
    levels: { fast, analytical, strategic, long_term: longTerm },
    escalation_policy: "confidence_and_intent",
  };
}

module.exports = {
  runHierarchy,
};

