"use strict";

const { generateStageText } = require("./model_router");

const Analyzer = {
  detectWeaknesses(experienceBatch, scoreCards) {
    const list = Array.isArray(experienceBatch) ? experienceBatch : [];
    const scores = scoreCards && typeof scoreCards === "object" ? scoreCards : {};
    const failuresByModule = {};
    const latencyByModule = {};
    const correctionsByModule = {};

    list.forEach((e) => {
      const moduleId = String(e && e.module_id ? e.module_id : "brain.main");
      if (!e || e.success) return;
      failuresByModule[moduleId] = (failuresByModule[moduleId] || 0) + 1;
    });

    list.forEach((e) => {
      const moduleId = String(e && e.module_id ? e.module_id : "brain.main");
      latencyByModule[moduleId] = latencyByModule[moduleId] || { sum: 0, n: 0 };
      latencyByModule[moduleId].sum += Number(e && e.latency_ms ? e.latency_ms : 0);
      latencyByModule[moduleId].n += 1;
      if (e && e.corrected) correctionsByModule[moduleId] = (correctionsByModule[moduleId] || 0) + 1;
    });

    const weaknesses = [];

    Object.keys(failuresByModule).forEach((moduleId) => {
      const fails = failuresByModule[moduleId];
      if (fails >= 2) {
        weaknesses.push({
          type: "repeated_failures",
          severity: fails >= 5 ? "high" : "medium",
          module_id: moduleId,
          problem: `${moduleId} failed ${fails} times recently`,
          metric: fails,
        });
      }
    });

    Object.keys(latencyByModule).forEach((moduleId) => {
      const v = latencyByModule[moduleId];
      const avg = v.n > 0 ? v.sum / v.n : 0;
      if (v.n >= 3 && avg >= 2600) {
        weaknesses.push({
          type: "slow_response",
          severity: avg > 4200 ? "high" : "medium",
          module_id: moduleId,
          problem: `${moduleId} average latency is ${Math.round(avg)}ms`,
          metric: avg,
        });
      }
    });

    Object.keys(correctionsByModule).forEach((moduleId) => {
      const c = correctionsByModule[moduleId];
      if (c >= 2) {
        weaknesses.push({
          type: "user_corrections",
          severity: c >= 4 ? "high" : "medium",
          module_id: moduleId,
          problem: `${moduleId} received ${c} user corrections`,
          metric: c,
        });
      }
    });

    Object.keys(scores).forEach((moduleId) => {
      const score = Number(scores[moduleId] && scores[moduleId].score || 0);
      if (score <= -6) {
        weaknesses.push({
          type: "low_reinforcement_score",
          severity: score <= -12 ? "high" : "medium",
          module_id: moduleId,
          problem: `${moduleId} reinforcement score is ${score}`,
          metric: score,
        });
      }
    });

    weaknesses.sort((a, b) => {
      const sa = a.severity === "high" ? 3 : a.severity === "medium" ? 2 : 1;
      const sb = b.severity === "high" ? 3 : b.severity === "medium" ? 2 : 1;
      if (sb !== sa) return sb - sa;
      return Number(b.metric || 0) - Number(a.metric || 0);
    });

    return weaknesses.slice(0, 8);
  },

  async summarizeWithBrain(weaknesses, context) {
    const list = Array.isArray(weaknesses) ? weaknesses : [];
    if (!list.length) return { ok: true, summary: "No critical weaknesses detected.", model_used: "none", error: "" };
    const ctx = context && typeof context === "object" ? context : {};
    const prompt = [
      "You are the Experience Analysis Brain for an autonomous personal intelligence.",
      "Summarize weaknesses and give concise priorities.",
      "Return 3 lines max.",
      `Weaknesses: ${JSON.stringify(list).slice(0, 4000)}`,
      `Context: ${JSON.stringify({ subject: ctx.subject, language: ctx.language }).slice(0, 500)}`,
    ].join("\n");

    const out = await generateStageText("analysis", prompt, {});
    if (!out.ok) return { ok: false, summary: "Analysis brain unavailable; using local prioritization.", model_used: out.model_used, error: out.error };
    return { ok: true, summary: out.text.slice(0, 900), model_used: out.model_used, error: "" };
  },
};

module.exports = {
  Analyzer,
};
