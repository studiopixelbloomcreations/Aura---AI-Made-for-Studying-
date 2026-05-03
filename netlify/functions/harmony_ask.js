const { env, allowedOrigin } = require("../../core/env");
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
exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  try {
    const payload = JSON.parse(event.body || "{}");
    const model = String(payload.model || "groq:llama-3.1-70b-versatile");
    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    const systemPrompt = String(payload.systemPrompt || "You are Aevra, a warm and intelligent AI study companion designed for students.");
    if (!messages.length) return json(422, { error: "messages are required" });
    if (model.startsWith("groq:")) return json(200, { success: true, data: { response: await callGroq(model.split(":")[1], messages, systemPrompt), model }, error: null });
    return json(502, { error: "Requested model provider is not configured on this deployment." });
  } catch (error) {
    logger.error("harmony_ask", { error: String(error && error.stack || error) });
    return json(500, { success: false, data: null, error: "Aevra Harmony is unavailable right now." });
  }
};
