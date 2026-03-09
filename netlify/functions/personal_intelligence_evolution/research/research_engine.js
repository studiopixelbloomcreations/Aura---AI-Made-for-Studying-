"use strict";

const { runDeepResearch } = require("../deep_research_engine");

function normalizePolicy(policy) {
  const p = policy && typeof policy === "object" ? policy : {};
  return {
    timeout_ms: Math.max(1000, Number(p.timeout_ms || process.env.PI_RESEARCH_FETCH_TIMEOUT_MS || 6000)),
    max_depth: Math.max(1, Math.min(5, Number(p.max_depth || 2))),
    budget: Math.max(1, Math.min(20, Number(p.budget || 6))),
    allowlist: Array.isArray(p.allowlist) ? p.allowlist.map((s) => String(s).toLowerCase()) : [],
    denylist: Array.isArray(p.denylist) ? p.denylist.map((s) => String(s).toLowerCase()) : [],
    trust_threshold: Math.max(0, Math.min(1, Number(p.trust_threshold || 0.25))),
  };
}

function domainFromUrl(url) {
  try {
    const u = new URL(String(url || ""));
    return String(u.hostname || "").toLowerCase();
  } catch (e) {
    return "";
  }
}

function trustScoreForCitation(citation) {
  const domain = domainFromUrl(citation && citation.url);
  if (!domain) return 0.1;
  if (domain.includes(".gov")) return 0.95;
  if (domain.includes(".edu")) return 0.9;
  if (domain.includes("wikipedia.org")) return 0.65;
  return 0.5;
}

function applyPolicy(citations, policy) {
  const src = Array.isArray(citations) ? citations : [];
  return src
    .map((c) => Object.assign({}, c, { domain: domainFromUrl(c.url), trust_score: trustScoreForCitation(c) }))
    .filter((c) => {
      if (policy.allowlist.length && !policy.allowlist.some((a) => c.domain.includes(a))) return false;
      if (policy.denylist.length && policy.denylist.some((d) => c.domain.includes(d))) return false;
      if (Number(c.trust_score || 0) < policy.trust_threshold) return false;
      return true;
    })
    .slice(0, policy.budget);
}

const ResearchEngine = {
  async run(query, policy, store) {
    const normalizedPolicy = normalizePolicy(policy);
    const envelope = typeof query === "string" ? { message: query } : (query && typeof query === "object" ? query : {});
    const base = await runDeepResearch(store, envelope, { policy: normalizedPolicy });
    if (!base.ok) return base;
    const filteredCitations = applyPolicy(base.citations || [], normalizedPolicy);

    const idxLoaded = await store.readDoc("research_index", { items: [] });
    if (!idxLoaded.ok) return { ok: false, error: idxLoaded.error };
    const idx = idxLoaded.doc && typeof idxLoaded.doc === "object" ? idxLoaded.doc : { items: [] };
    idx.items = Array.isArray(idx.items) ? idx.items : [];
    filteredCitations.forEach((c) => {
      idx.items.push({
        id: `src_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
        title: String(c.title || ""),
        url: String(c.url || ""),
        domain: String(c.domain || ""),
        trust_score: Number(c.trust_score || 0),
        at: new Date().toISOString(),
      });
    });
    if (idx.items.length > 5000) idx.items = idx.items.slice(-5000);
    const idxSaved = await store.writeDoc("research_index", idx, idxLoaded.sha || "", "pcos: update research index");
    if (!idxSaved.ok) return { ok: false, error: idxSaved.error };

    const traceLoaded = await store.readDoc("citation_traces", { traces: [] });
    if (!traceLoaded.ok) return { ok: false, error: traceLoaded.error };
    const traces = traceLoaded.doc && typeof traceLoaded.doc === "object" ? traceLoaded.doc : { traces: [] };
    traces.traces = Array.isArray(traces.traces) ? traces.traces : [];
    traces.traces.push({
      id: `trace_${Date.now().toString(36)}`,
      report_id: String(base.report_id || ""),
      query: String(envelope.message || "").slice(0, 600),
      policy: normalizedPolicy,
      citation_count: filteredCitations.length,
      at: new Date().toISOString(),
    });
    if (traces.traces.length > 2000) traces.traces = traces.traces.slice(-2000);
    const traceSaved = await store.writeDoc("citation_traces", traces, traceLoaded.sha || "", "pcos: append citation trace");
    if (!traceSaved.ok) return { ok: false, error: traceSaved.error };

    return {
      ok: true,
      triggered: !!base.triggered,
      summary: base.summary || "",
      report_id: base.report_id || "",
      citations: filteredCitations,
      policy: normalizedPolicy,
    };
  },
};

module.exports = {
  ResearchEngine,
};

