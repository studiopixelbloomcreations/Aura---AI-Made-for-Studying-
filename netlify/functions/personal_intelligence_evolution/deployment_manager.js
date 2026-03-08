"use strict";

const { createModuleVersionRecord } = require("./contracts");
const { applyRuntimePatch, listActiveVersions } = require("./tool_registry");

function nextVersion(prev) {
  const s = String(prev || "v0");
  const m = s.match(/^v(\d+)$/i);
  const n = m ? Number(m[1]) : 0;
  return `v${n + 1}`;
}

const DeploymentManager = {
  promote(proposalId, state, evaluationReport) {
    const st = state && typeof state === "object" ? state : {};
    const evalReport = evaluationReport && typeof evaluationReport === "object" ? evaluationReport : {};
    const proposals = Array.isArray(st.proposals) ? st.proposals : [];
    const proposal = proposals.find((p) => p && p.id === proposalId);

    if (!proposal) {
      return { ok: false, error: "proposal not found" };
    }
    if (!evalReport.passed) {
      proposal.status = "rejected";
      proposal.evaluation = evalReport;
      proposal.promotion = { ok: false, reason: "sandbox rejected" };
      return { ok: false, error: "sandbox rejected", proposal };
    }

    const domain = String(proposal.patch_spec && proposal.patch_spec.domain || "");
    const moduleId = String(proposal.module_responsible || "");

    const patchResult = applyRuntimePatch(st.registries, proposal);
    if (!patchResult.ok) {
      proposal.status = "rejected";
      proposal.evaluation = evalReport;
      proposal.promotion = { ok: false, reason: patchResult.error || "patch failed" };
      return { ok: false, error: patchResult.error || "patch failed", proposal };
    }

    const currentVersion = String((patchResult.module && patchResult.module.version) || "v0");
    const newVersion = nextVersion(currentVersion);
    patchResult.module.version = newVersion;

    st.module_versions = Array.isArray(st.module_versions) ? st.module_versions : [];
    st.module_versions.push(
      createModuleVersionRecord(moduleId, newVersion, proposal.id, {
        domain,
        patch_spec: proposal.patch_spec,
      })
    );

    proposal.status = "deployed";
    proposal.evaluation = evalReport;
    proposal.promotion = {
      ok: true,
      promoted_module: `${domain}.${moduleId}`,
      version: newVersion,
      active_versions: listActiveVersions(st.registries),
    };

    return {
      ok: true,
      proposal,
      active_versions: proposal.promotion.active_versions,
    };
  },
};

module.exports = {
  DeploymentManager,
};
