"use strict";

function makeEvent(interaction, outcomes) {
  const i = interaction && typeof interaction === "object" ? interaction : {};
  const o = outcomes && typeof outcomes === "object" ? outcomes : {};
  return {
    id: `life_evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    at: new Date().toISOString(),
    message: String(i.message || "").slice(0, 600),
    success: !!i.success,
    latency_ms: Number(i.latency_ms || 0),
    tags: Array.isArray(o.tags) ? o.tags.slice(0, 10) : [],
  };
}

const LifeDataEngine = {
  async record(eventLike, store) {
    const loaded = await store.readDoc("life_timeline", { events: [] });
    if (!loaded.ok) return { ok: false, error: loaded.error };
    const doc = loaded.doc && typeof loaded.doc === "object" ? loaded.doc : { events: [] };
    doc.events = Array.isArray(doc.events) ? doc.events : [];
    const event = makeEvent(eventLike, eventLike && eventLike.outcomes ? eventLike.outcomes : {});
    doc.events.push(event);
    if (doc.events.length > 4000) doc.events = doc.events.slice(-4000);
    const saved = await store.writeDoc("life_timeline", doc, loaded.sha || "", "pcos: append life timeline event");
    if (!saved.ok) return { ok: false, error: saved.error };
    return { ok: true, event_id: event.id, total_events: doc.events.length, storage: saved.storage };
  },
};

module.exports = {
  LifeDataEngine,
};

