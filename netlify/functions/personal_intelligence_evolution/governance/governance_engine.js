"use strict";

function riskScore(changeSet) {
  const c = changeSet && typeof changeSet === "object" ? changeSet : {};
  let score = 0;
  if (c.safety_ok === false) score += 5;
  if (Number(c.dead_letter_count || 0) > 0) score += Math.min(3, Number(c.dead_letter_count || 0));
  if (Number(c.failed_agents || 0) > 0) score += 2;
  return Math.min(10, score);
}

const GovernanceEngine = {
  async evaluate(changeSet, store) {
    const risk = riskScore(changeSet);
    const mode = risk <= 2 ? "auto_promote" : (risk <= 5 ? "canary" : "hold");
    const loaded = await store.readDoc("governance_decisions", { decisions: [] });
    if (!loaded.ok) return { ok: false, error: loaded.error };
    const doc = loaded.doc && typeof loaded.doc === "object" ? loaded.doc : { decisions: [] };
    doc.decisions = Array.isArray(doc.decisions) ? doc.decisions : [];
    const decision = {
      id: `gov_${Date.now().toString(36)}`,
      at: new Date().toISOString(),
      risk_score: risk,
      mode,
      reason: mode === "hold" ? "high_risk" : (mode === "canary" ? "moderate_risk" : "low_risk"),
    };
    doc.decisions.push(decision);
    if (doc.decisions.length > 2000) doc.decisions = doc.decisions.slice(-2000);
    const saved = await store.writeDoc("governance_decisions", doc, loaded.sha || "", "pcos: append governance decision");
    if (!saved.ok) return { ok: false, error: saved.error };
    return { ok: true, governance_decision_id: decision.id, mode, risk_score: risk };
  },
};

module.exports = {
  GovernanceEngine,
};

