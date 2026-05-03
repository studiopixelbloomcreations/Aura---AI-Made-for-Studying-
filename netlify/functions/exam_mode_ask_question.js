const { env, allowedOrigin } = require("../../core/env");
const logger = require("../../core/logger");

function json(statusCode, obj) {
  const normalized = Object.prototype.hasOwnProperty.call(obj || {}, "success") ? obj : { success: statusCode < 400, data: statusCode < 400 ? obj : null, error: statusCode < 400 ? null : (obj && obj.error || "Request failed") };
  return { statusCode, headers: { "content-type": "application/json", "access-control-allow-origin": allowedOrigin(), "access-control-allow-methods": "POST,OPTIONS", "access-control-allow-headers": "content-type,authorization,x-aevra-csrf" }, body: JSON.stringify(normalized) };
}
function normalize(v) { return String(v || "").trim().toLowerCase().replace(/^[a-d][\).]\s*/, ""); }
exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  try {
    const payload = JSON.parse(event.body || "{}");
    const question = payload.question || {};
    const userAnswer = String(payload.userAnswer || payload.user_answer || "").trim();
    if (!userAnswer || !question) return json(422, { error: "question and userAnswer are required" });
    const correct = String(question.correctAnswer || question.correct_answer || question.answer || "").trim();
    const isCorrect = correct ? normalize(userAnswer) === normalize(correct) || normalize(userAnswer).includes(normalize(correct)) : false;
    let explanation = question.explanation || (isCorrect ? "Correct. Your answer matches the expected answer." : "Review the concept and try a similar question.");
    let feedback = isCorrect ? "Great work. Keep going." : "Not quite yet. Read the explanation and try another example.";
    if (env("GROQ_API_KEY")) {
      try {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { authorization: `Bearer ${env("GROQ_API_KEY")}`, "content-type": "application/json" },
          body: JSON.stringify({ model: "llama-3.1-70b-versatile", temperature: 0.2, messages: [
            { role: "system", content: "You are Aevra, an exam coach. Evaluate briefly and give encouraging Grade 9 feedback." },
            { role: "user", content: `Question: ${question.question || question.text}\nExpected answer: ${correct}\nStudent answer: ${userAnswer}\nIs correct by strict check: ${isCorrect}\nReturn short feedback and explanation.` },
          ] }),
        });
        const data = await res.json().catch(() => ({}));
        const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
        if (res.ok && text) feedback = text;
      } catch (error) {}
    }
    return json(200, { success: true, data: { isCorrect, explanation, score: isCorrect ? 1 : 0, feedback, sessionId: payload.sessionId || payload.session_id || null }, error: null });
  } catch (error) {
    logger.error("exam_mode_ask_question", { error: String(error && error.stack || error) });
    return json(500, { success: false, data: null, error: "Aevra could not evaluate that answer right now." });
  }
};
