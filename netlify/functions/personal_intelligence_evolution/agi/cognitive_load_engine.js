"use strict";

function estimateCognitiveLoad(envelope) {
  const text = String(envelope && envelope.message || "");
  const len = text.length;
  let score = 0.35;
  if (len > 180) score += 0.2;
  if (/confused|hard|stuck|overwhelmed|don't understand/i.test(text)) score += 0.35;
  if (/urgent|fast|quick/i.test(text)) score += 0.1;
  score = Math.max(0, Math.min(1, score));
  return {
    load_score: score,
    mode: score >= 0.7 ? "high_load" : (score >= 0.45 ? "medium_load" : "low_load"),
    adaptation: score >= 0.7 ? "simplify_and_chunk" : "normal",
  };
}

module.exports = {
  estimateCognitiveLoad,
};

