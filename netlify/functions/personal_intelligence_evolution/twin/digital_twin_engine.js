"use strict";

function defaultTwin() {
  return {
    schema_version: 1,
    updated_at: new Date().toISOString(),
    profile: {
      learning_style: "mixed",
      productivity_pattern: "unknown",
      pace: "medium",
    },
    current_goal: "",
    metrics: {
      interactions: 0,
      success_rate: 0,
      avg_latency_ms: 0,
    },
    version: 1,
  };
}

const DigitalTwinEngine = {
  async update(interaction, outcomes, store) {
    const loaded = await store.readDoc("digital_twin_state", defaultTwin());
    if (!loaded.ok) return { ok: false, error: loaded.error };
    const doc = loaded.doc && typeof loaded.doc === "object" ? loaded.doc : defaultTwin();
    const i = interaction && typeof interaction === "object" ? interaction : {};
    const facts = i.known_facts && typeof i.known_facts === "object" ? i.known_facts : {};
    const goal = String(facts.goal || "").trim();
    if (goal) doc.current_goal = goal.slice(0, 220);
    if (/visual|diagram|chart/i.test(String(i.message || ""))) doc.profile.learning_style = "visual";
    if (/step by step|example/i.test(String(i.message || ""))) doc.profile.learning_style = "guided";

    doc.metrics.interactions = Number(doc.metrics.interactions || 0) + 1;
    const s = Number(doc.metrics.success_rate || 0);
    doc.metrics.success_rate = Math.max(0, Math.min(100, ((s * (doc.metrics.interactions - 1)) + (i.success ? 100 : 0)) / doc.metrics.interactions));
    const lat = Number(doc.metrics.avg_latency_ms || 0);
    const nextLat = Number(i.latency_ms || 0);
    doc.metrics.avg_latency_ms = Math.max(0, ((lat * (doc.metrics.interactions - 1)) + nextLat) / doc.metrics.interactions);
    doc.profile.pace = doc.metrics.avg_latency_ms > 2600 ? "slow" : "medium";
    doc.updated_at = new Date().toISOString();
    doc.version = Number(doc.version || 1) + 1;

    const saved = await store.writeDoc("digital_twin_state", doc, loaded.sha || "", "pcos: update digital twin state");
    if (!saved.ok) return { ok: false, error: saved.error };
    return {
      ok: true,
      twin_state_version: doc.version,
      twin_state: doc,
      storage: saved.storage,
    };
  },
};

module.exports = {
  DigitalTwinEngine,
};

