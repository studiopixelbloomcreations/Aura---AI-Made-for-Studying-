"use strict";

function validatePluginManifest(manifest) {
  const m = manifest && typeof manifest === "object" ? manifest : {};
  const errors = [];
  if (!m.id || typeof m.id !== "string") errors.push("id is required");
  if (!m.name || typeof m.name !== "string") errors.push("name is required");
  if (!Array.isArray(m.capabilities)) errors.push("capabilities must be an array");
  if (!Array.isArray(m.triggers)) errors.push("triggers must be an array");
  if (!Array.isArray(m.required_permissions)) errors.push("required_permissions must be an array");
  if (!Array.isArray(m.test_suite_refs)) errors.push("test_suite_refs must be an array");
  return { ok: errors.length === 0, errors };
}

module.exports = {
  validatePluginManifest,
};
