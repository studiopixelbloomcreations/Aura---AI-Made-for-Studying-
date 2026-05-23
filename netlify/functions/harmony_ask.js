const { env, allowedOrigin } = require("../../core/env");
const { buildHarmonyAdapters } = require("../../core/model_adapters");
const logger = require("../../core/logger");

function json(statusCode, obj) {
  const normalized = Object.prototype.hasOwnProperty.call(obj || {}, "success") ? obj : { success: statusCode < 400, data: statusCode < 400 ? obj : null, error: statusCode < 400 ? null : (obj && obj.error || "Request failed") };
  return { statusCode, headers: { "content-type": "application/json", "access-control-allow-origin": allowedOrigin(), "access-control-allow-methods": "POST,OPTIONS", "access-control-allow-headers": "content-type,authorization,x-aevra-csrf" }, body: JSON.stringify(normalized) };
}
async function callGroq(model, messages, systemPrompt) {
  const key = env("GROQ_API_KEY");
  if (!key) throw new Error("GROQ_API_KEY is not configured");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ model, messages: [{ role: "system", content: systemPrompt }].concat(messages || []), temperature: 0.6 }), signal: controller.signal }).finally(() => clearTimeout(timer));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error && data.error.message || `Groq HTTP ${res.status}`);
  return data.choices[0].message.content;
}
async function callConfiguredProvider(model, messages, systemPrompt) {
  const [provider, modelId] = String(model || "").split(":");
  if (provider === "groq") return callGroq(modelId || "llama-3.1-8b-instant", messages, systemPrompt);
  if (provider === "puter") {
    throw new Error(env("PUTER_API_KEY") ? "puter_server_key_not_supported" : "puter_client_fallback_required");
  }
  const adapters = buildHarmonyAdapters();
  const adapter = adapters[provider];
  if (!adapter) throw new Error(`Provider ${provider || "unknown"} is not configured`);
  const result = await adapter({
    query: (messages || []).map((message) => message.content).filter(Boolean).join("\n\n"),
    council_prompt: `${systemPrompt}\n\n${(messages || []).map((message) => `${message.role}: ${message.content}`).join("\n")}`,
    analysis: { type: "harmony", complexity: "medium", requires_multi_models: true },
    requested_model: modelId || "",
  });
  if (result && result.answer) return result.answer;
  throw new Error(result && result.error || `${provider}_empty_response`);
}
exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  try {
    const payload = JSON.parse(event.body || "{}");
    const model = String(payload.model || "groq:llama-3.1-70b-versatile");
    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    const systemPrompt = String(payload.systemPrompt || "You are Aura, a warm and intelligent AI study companion designed for students.");
    if (!messages.length) return json(422, { error: "messages are required" });
    return json(200, { success: true, data: { response: await callConfiguredProvider(model, messages, systemPrompt), model }, error: null });
  } catch (error) {
    logger.error("harmony_ask", { error: String(error && error.stack || error) });
    return json(500, { success: false, data: null, error: "Aura Harmony is unavailable right now." });
  }
};
