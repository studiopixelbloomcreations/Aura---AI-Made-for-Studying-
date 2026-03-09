"use strict";

async function runMetaLearning(store, envelope) {
  const loaded = await store.readDoc("meta_learning_state", { style: "mixed", history: [] });
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const doc = loaded.doc && typeof loaded.doc === "object" ? loaded.doc : { style: "mixed", history: [] };
  doc.history = Array.isArray(doc.history) ? doc.history : [];
  const text = String(envelope && envelope.message || "");
  if (/diagram|visual|chart|image/i.test(text)) doc.style = "visual";
  else if (/example|step by step|simple/i.test(text)) doc.style = "guided";
  else if (/quick|summary|brief/i.test(text)) doc.style = "compact";
  doc.history.push({ at: new Date().toISOString(), style: doc.style });
  if (doc.history.length > 1000) doc.history = doc.history.slice(-1000);
  const saved = await store.writeDoc("meta_learning_state", doc, loaded.sha || "", "pcos agi: update meta learning state");
  if (!saved.ok) return { ok: false, error: saved.error };
  return { ok: true, preferred_style: doc.style };
}

module.exports = {
  runMetaLearning,
};

