"use strict";

function initRegistries() {
  return {
    tools: {
      open_file_explorer: {
        version: "v1",
        score: 0,
        capabilities: ["file_explorer_open"],
        required_permissions: ["system"],
        tests: ["shape", "compatibility", "behavior"],
        behavior_rules: { confirmation_required: true },
      },
      directions_home: {
        version: "v1",
        score: 0,
        capabilities: ["maps_navigation"],
        required_permissions: ["network"],
        tests: ["shape", "compatibility", "behavior"],
        behavior_rules: { confirmation_required: true },
      },
      connect_spotify: {
        version: "v1",
        score: 0,
        capabilities: ["oauth_connect"],
        required_permissions: ["network"],
        tests: ["shape", "compatibility", "behavior"],
        behavior_rules: { confirmation_required: true },
      },
      play_spotify_liked: {
        version: "v1",
        score: 0,
        capabilities: ["music_playback"],
        required_permissions: ["network"],
        tests: ["shape", "compatibility", "behavior"],
        behavior_rules: { confirmation_required: true },
      },
    },
    plugins: {},
    behavior_rules: {
      personal_response_style: {
        version: "v1",
        score: 0,
        capabilities: ["tone_control", "brevity_control"],
        required_permissions: [],
        tests: ["shape", "compatibility", "behavior"],
        behavior_rules: { default_reply_sentences: 2 },
      },
    },
    workflows: {},
  };
}

function getModule(registries, domain, moduleId) {
  if (!registries || !domain || !moduleId) return null;
  if (!registries[domain]) return null;
  return registries[domain][moduleId] || null;
}

function ensureDomain(registries, domain) {
  if (!registries[domain]) registries[domain] = {};
}

function applyRuntimePatch(registries, proposal) {
  const domain = String(proposal && proposal.patch_spec && proposal.patch_spec.domain || "").trim();
  const moduleId = String(proposal && proposal.module_responsible || "").trim();
  const patch = proposal && proposal.patch_spec && typeof proposal.patch_spec.patch === "object"
    ? proposal.patch_spec.patch
    : {};
  if (!domain || !moduleId) {
    return { ok: false, error: "Invalid patch target" };
  }
  ensureDomain(registries, domain);
  const current = registries[domain][moduleId] || {
    version: "v0",
    score: 0,
    capabilities: [],
    required_permissions: [],
    tests: ["shape", "compatibility", "behavior"],
    behavior_rules: {},
  };

  const next = {
    ...current,
    ...patch,
    behavior_rules: {
      ...(current.behavior_rules || {}),
      ...((patch && patch.behavior_rules) || {}),
    },
  };

  registries[domain][moduleId] = next;
  return { ok: true, module: next };
}

function listActiveVersions(registries) {
  const out = {};
  Object.keys(registries || {}).forEach((domain) => {
    const modules = registries[domain] || {};
    Object.keys(modules).forEach((moduleId) => {
      out[`${domain}.${moduleId}`] = String((modules[moduleId] && modules[moduleId].version) || "v1");
    });
  });
  return out;
}

module.exports = {
  initRegistries,
  getModule,
  applyRuntimePatch,
  listActiveVersions,
};
