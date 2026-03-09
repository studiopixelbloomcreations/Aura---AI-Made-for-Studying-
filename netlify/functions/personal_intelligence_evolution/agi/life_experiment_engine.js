"use strict";

async function runLifeExperiment(store, envelope) {
  const loaded = await store.readDoc("life_experiments", { experiments: [] });
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const doc = loaded.doc && typeof loaded.doc === "object" ? loaded.doc : { experiments: [] };
  doc.experiments = Array.isArray(doc.experiments) ? doc.experiments : [];
  const text = String(envelope && envelope.message || "");
  const trigger = /try|experiment|for 2 weeks|pomodoro|routine/i.test(text);
  if (!trigger) return { ok: true, triggered: false, experiment_id: "" };
  const exp = {
    id: `exp_${Date.now().toString(36)}`,
    at: new Date().toISOString(),
    hypothesis: "structured_method_improves_productivity",
    message: text.slice(0, 260),
    predicted_gain_pct: 10,
  };
  doc.experiments.push(exp);
  if (doc.experiments.length > 1200) doc.experiments = doc.experiments.slice(-1200);
  const saved = await store.writeDoc("life_experiments", doc, loaded.sha || "", "pcos agi: append life experiment");
  if (!saved.ok) return { ok: false, error: saved.error };
  return { ok: true, triggered: true, experiment_id: exp.id };
}

module.exports = {
  runLifeExperiment,
};

