"use strict";

function runPerception(envelope) {
  const e = envelope && typeof envelope === "object" ? envelope : {};
  const message = String(e.message || "").trim();
  const lang = String(e.language || "English");
  const tokens = message ? message.split(/\s+/).slice(0, 300) : [];
  const intents = [];
  if (/research|compare|roadmap|deep/i.test(message)) intents.push("research");
  if (/goal|plan|strategy|long term/i.test(message)) intents.push("planning");
  if (/my |i am |i'm |favorite|school|friend|hobby/i.test(message)) intents.push("personal_fact");
  if (!intents.length) intents.push("general");
  return {
    message,
    language: lang,
    token_count: tokens.length,
    intents,
    at: new Date().toISOString(),
  };
}

module.exports = {
  runPerception,
};

