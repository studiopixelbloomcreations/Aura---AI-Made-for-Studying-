"use strict";

async function appendArchitectureRfc(store, envelope, governance) {
  const loaded = await store.readDoc("architecture_rfc", { proposals: [] });
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const doc = loaded.doc && typeof loaded.doc === "object" ? loaded.doc : { proposals: [] };
  doc.proposals = Array.isArray(doc.proposals) ? doc.proposals : [];
  const text = String(envelope && envelope.message || "");
  const trigger = /improve architecture|new module|optimize system|upgrade pipeline/i.test(text);
  if (!trigger) return { ok: true, triggered: false, rfc_id: "" };
  const rfc = {
    id: `rfc_${Date.now().toString(36)}`,
    at: new Date().toISOString(),
    title: "Runtime architecture optimization proposal",
    summary: text.slice(0, 240),
    governance_mode: governance && governance.mode ? governance.mode : "canary",
    status: "proposed",
  };
  doc.proposals.push(rfc);
  if (doc.proposals.length > 1200) doc.proposals = doc.proposals.slice(-1200);
  const saved = await store.writeDoc("architecture_rfc", doc, loaded.sha || "", "pcos agi: append architecture rfc");
  if (!saved.ok) return { ok: false, error: saved.error };
  return { ok: true, triggered: true, rfc_id: rfc.id };
}

module.exports = {
  appendArchitectureRfc,
};

