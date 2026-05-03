const fs = require("fs");
const path = require("path");

function json(statusCode, obj) {
  return { statusCode, headers: { "content-type": "application/json", "access-control-allow-origin": process.env.ALLOWED_ORIGINS || "http://localhost:5500", "access-control-allow-methods": "POST,OPTIONS", "access-control-allow-headers": "content-type,authorization,x-aevra-csrf" }, body: JSON.stringify(obj) };
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
    return json(200, { ok: true, subject, termTest, questions });
  } catch (error) {
    console.error(JSON.stringify({ at: new Date().toISOString(), fn: "exam_mode_fetch_papers", error: String(error && error.stack || error) }));
    return json(500, { error: "Exam questions are unavailable right now.", questions: [] });
  }
};
