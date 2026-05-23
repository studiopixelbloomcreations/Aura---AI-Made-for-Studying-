const axios = require("axios");
const { getProviderConfig } = require("../../core/config_loader");
const { analyzeInput } = require("../../core/observatory");
const { detectSystemState, buildCognitiveBlueprint, compileCognitivePrompt, updateCognitivePerformance } = require("../../core/ncs_engine");

function json(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type,authorization"
    },
    body: JSON.stringify(obj)
  };
}

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  const groqConfig = getProviderConfig("groq");
  const GROQ_API_KEY = groqConfig.apiKey || process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) {
    return json(500, { error: "Missing Groq API key in AEVRA_MASTER_CONFIG or Netlify environment variables" });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  const subject = payload.subject || "General";
  const language = payload.language || "English";
  let student_question = payload.student_question || "";
  const history = Array.isArray(payload.history) ? payload.history : [];

  const rawQuestionLower = String(student_question || "").toLowerCase();
  const overrideOutOfSyllabus =
    rawQuestionLower.includes("go out of syllabus") ||
    rawQuestionLower.includes("out of syllabus") ||
    rawQuestionLower.includes("out-of-syllabus") ||
    rawQuestionLower.includes("off syllabus") ||
    rawQuestionLower.includes("off-syllabus");

  if (overrideOutOfSyllabus) {
    student_question = String(student_question)
      .replace(/\bgo\s*out\s*of\s*syllabus\b\s*[:,\-]?\s*/ig, "")
      .replace(/\bout\s*of\s*syllabus\b\s*[:,\-]?\s*/ig, "")
      .replace(/\boff\s*-?\s*syllabus\b\s*[:,\-]?\s*/ig, "")
      .trim();
  }

  const allowedSubjects = new Set([
    "general",
    "math",
    "maths",
    "mathematics",
    "science",
    "english",
    "sinhala",
    "history",
    "geography",
    "health",
    "civics"
  ]);
  const subjKey = String(subject || "general").trim().toLowerCase();
  const offSyllabusHeuristic = !!overrideOutOfSyllabus;

  const cleanedHistory = history
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && m.content)
    .slice(-20)
    .map(m => ({ role: m.role, content: String(m.content).slice(0, 1200) }));
  const observatory = analyzeInput(student_question);
  const ncsContext = {
    userMessage: student_question,
    observatoryOutput: observatory,
    activeModules: ["observatory", "ncs", "grade9_tutor", "points", "memory_context"],
    recentCalls: ["ask"],
    metadata: { subject, language, off_syllabus: overrideOutOfSyllabus },
    sessionData: { history: cleanedHistory },
  };
  const ncsState = detectSystemState(ncsContext);
  const ncsBlueprint = buildCognitiveBlueprint(ncsContext, ncsState);
  const ncsPrompt = compileCognitivePrompt(ncsBlueprint);

  try {
    const response = await axios.post(
      `${String(groqConfig.baseUrl || "https://api.groq.com/openai/v1").replace(/\/$/, "")}/chat/completions`,
      {
        model: groqConfig.model || "llama-3.1-8b-instant",
        messages: [
          {
            role: "system",
            content: `${ncsPrompt}` + `\n\nYou are Aura AI, a very sweet, friendly, charming Grade 9 teacher in Sri Lanka. Your teaching must be strictly aligned to the official 2024 Sri Lankan Grade 9 print textbooks. Speak in ${language}.

Scope rules (VERY IMPORTANT):
- You MUST stay strictly within the Grade 9 Sri Lankan syllabus by default.
- You may ONLY go beyond the Grade 9 syllabus if the student explicitly requested it ("go out of syllabus" / "out of syllabus" / "off syllabus").
- If the student did NOT explicitly request out-of-syllabus and their question is outside Grade 9 scope, do NOT answer the out-of-syllabus content. Instead, kindly say it is outside Grade 9 and offer:
  - a Grade-9-appropriate related explanation, OR
  - ask one short clarifying question to bring it back to Grade 9.
- If the student DID explicitly request out-of-syllabus, start your reply with a short line: "Scope note: You asked to go out of syllabus, so here is a helpful answer." Then continue normally.
- If you stay within Grade 9, do NOT include a scope note.

Question-asking rules (VERY IMPORTANT):
- Only ask the student questions that are strictly from the Grade 9 Sri Lankan syllabus (textbook-aligned).
- Do NOT ask questions that require knowledge beyond Grade 9 unless the student explicitly requested out-of-syllabus.

Style rules:
- Be super kind, encouraging, and clear. Sound like a cute, sweet, charming teacher.
- Use a few appropriate emojis (1–2 per message) to make it delightful, not noisy.
- Keep sentences natural and pleasant to hear (TTS-friendly). Avoid long walls of text.
- If you use emojis, put them at the end of sentences, not in the middle of words.
- If the student answers a question you asked, briefly say whether it is correct.

Points rule (VERY IMPORTANT):
- You MUST ALWAYS include EXACTLY ONE final line at the very end of your message in this exact format: AWARD_POINTS: N
- N must be an integer.
- Only award points when BOTH are true:
  1) In your previous assistant message, you asked the student a specific question/problem to answer, AND
  2) The student is now answering that question.
- If you are NOT currently evaluating the student's answer to a question you previously asked, set N = 0.
- If you are evaluating their answer and it is correct, set N to an integer > 0 based on difficulty (5, 10, 15, 20).
- If you are evaluating their answer and it is wrong, set N = 0.
- This must be the LAST line. Do not add anything after it.`
          },
          ...cleanedHistory,
          {
            role: "user",
            content: `Subject: ${subject}\nOut-of-syllabus override: ${overrideOutOfSyllabus ? "YES" : "NO"}\nStudent question: ${student_question}`
          }
        ],
        temperature: 0.45
      },
      {
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 60000
      }
    );

    const answer =
      response &&
      response.data &&
      response.data.choices &&
      response.data.choices[0] &&
      response.data.choices[0].message &&
      response.data.choices[0].message.content
        ? response.data.choices[0].message.content
        : null;

    if (!answer) return json(500, { error: "AI request failed" });

    let finalAnswer = String(answer).trim();
    if(!/\bAWARD_POINTS\s*:\s*\d+\b/i.test(finalAnswer)){
      finalAnswer = finalAnswer + "\n\nAWARD_POINTS: 0";
    }

    try {
      await updateCognitivePerformance({
        user_id: "main_chat",
        system_type: ncsState.systemType,
        confidence: ncsState.confidence,
        model_used: groqConfig.model || "llama-3.1-8b-instant",
        routing_success: true,
        response_quality: 0.8,
        metadata: { subject, language, off_syllabus: !!offSyllabusHeuristic },
      });
    } catch (e) {}

    return json(200, {
      answer: finalAnswer,
      off_syllabus: !!offSyllabusHeuristic,
      observatory,
      ncs: {
        system_state: ncsState,
        cognitive_blueprint: ncsBlueprint,
        prompt_preview: ncsPrompt.slice(0, 600),
      },
    });
  } catch (e) {
    return json(500, { error: "AI request failed" });
  }
};
