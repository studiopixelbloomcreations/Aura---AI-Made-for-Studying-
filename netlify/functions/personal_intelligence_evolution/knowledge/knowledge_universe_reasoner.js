"use strict";

function defaultUniverse() {
  return {
    schema_version: 1,
    updated_at: new Date().toISOString(),
    layers: {
      user: {},
      skills: {},
      tasks: {},
      interests: {},
      emotion: {},
    },
    hints: [],
  };
}

function addFactLayer(universe, facts) {
  const f = facts && typeof facts === "object" ? facts : {};
  universe.layers.user.self = {
    name: String(f.name || ""),
    school: String(f.school || ""),
    city: String(f.city || ""),
  };
  if (f.favorite_subject) {
    universe.layers.interests[`subject_${String(f.favorite_subject).toLowerCase()}`] = {
      label: String(f.favorite_subject),
      weight: 0.8,
    };
  }
  if (f.goal) {
    universe.layers.tasks.goal = { label: String(f.goal), horizon: "long" };
  }
}

function inferHints(universe) {
  const hints = [];
  const goal = universe.layers.tasks && universe.layers.tasks.goal ? universe.layers.tasks.goal.label : "";
  if (goal) hints.push(`Prioritize roadmap actions toward "${goal}".`);
  const subjectKeys = Object.keys(universe.layers.interests || {});
  if (subjectKeys.length) hints.push(`Use interest-adapted examples for ${subjectKeys.length} key interests.`);
  if (!hints.length) hints.push("Maintain balanced tutoring strategy.");
  return hints;
}

async function updateKnowledgeUniverse(store, envelope) {
  const loaded = await store.readDoc("knowledge_universe", defaultUniverse());
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const doc = loaded.doc && typeof loaded.doc === "object" ? loaded.doc : defaultUniverse();
  const facts = envelope && envelope.known_facts && typeof envelope.known_facts === "object" ? envelope.known_facts : {};
  addFactLayer(doc, facts);
  doc.hints = inferHints(doc);
  doc.updated_at = new Date().toISOString();
  const saved = await store.writeDoc("knowledge_universe", doc, loaded.sha || "", "pcos: update knowledge universe");
  if (!saved.ok) return { ok: false, error: saved.error };
  return { ok: true, hints: doc.hints, storage: saved.storage };
}

module.exports = {
  updateKnowledgeUniverse,
};

