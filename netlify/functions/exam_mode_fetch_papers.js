const fs = require("fs");
const path = require("path");
const { allowedOrigin } = require("../../core/env");
const logger = require("../../core/logger");

function json(statusCode, obj) {
  const normalized = Object.prototype.hasOwnProperty.call(obj || {}, "success") ? obj : { success: statusCode < 400, data: statusCode < 400 ? obj : null, error: statusCode < 400 ? null : (obj && obj.error || "Request failed") };
  return { statusCode, headers: { "content-type": "application/json", "access-control-allow-origin": allowedOrigin(), "access-control-allow-methods": "POST,OPTIONS", "access-control-allow-headers": "content-type,authorization,x-aevra-csrf" }, body: JSON.stringify(normalized) };
}
function subjectKey(subject) {
  const s = String(subject || "Mathematics").trim().toLowerCase();
  if (["math", "maths", "mathematics"].includes(s)) return "Mathematics";
  if (s === "ict" || s.includes("communication")) return "ICT";
  return s.charAt(0).toUpperCase() + s.slice(1);
}
exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  try {
    const payload = JSON.parse(event.body || "{}");
    const subject = subjectKey(payload.subject);
    const termTest = Number(payload.termTest || payload.term || 3);
    const bankPath = path.join(process.cwd(), "..", "exam_mode", "question_bank.json");
    const localPath = fs.existsSync(bankPath) ? bankPath : path.join(process.cwd(), "exam_mode", "question_bank.json");
    const bank = JSON.parse(fs.readFileSync(localPath, "utf8"));
    const questions = (bank[subject] || []).map((q) => ({
      id: q.id,
      subject,
      termTest,
      question: q.question,
      options: ["A", "B", "C", "D"].map((key) => `${key}. ${q.options[key]}`),
      correctAnswer: q.correct_answer,
      explanation: q.explanation,
      difficulty: q.difficulty,
      topic: q.topic,
    }));
    return json(200, { success: true, data: { subject, termTest, questions }, error: null });
  } catch (error) {
    logger.error("exam_mode_fetch_papers", { error: String(error && error.stack || error) });
    return json(500, { success: false, data: null, error: "Exam questions are unavailable right now." });
  }
};
