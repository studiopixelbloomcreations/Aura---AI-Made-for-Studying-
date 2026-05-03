(function (global) {
  "use strict";

  const MODELS = [
    "groq:llama-3.1-70b-versatile",
    "groq:mixtral-8x7b-32768",
    "openrouter:claude-3-haiku",
    "puter:claude-3-5-sonnet",
    "deepseek:deepseek-chat",
  ];
  const status = MODELS.map((model) => ({ model, status: "ok" }));

  function analyzeIntent(message) {
    const text = String(message || "").toLowerCase();
    if (/\b(exam|past paper|term test|quiz me|marks?)\b/.test(text)) return "exam_prep";
    if (/\b(sad|stressed|overwhelmed|anxious|worried|tired)\b/.test(text)) return "emotional_support";
    if (/\b(research|compare|sources|deep dive|investigate)\b/.test(text)) return "deep_research";
    if ((text.match(/\?/g) || []).length > 1 || /\b(first|second|third).+\?/.test(text)) return "multi_question";
    if (/\b(explain|teach|step by step|tutorial|show me how)\b/.test(text)) return "tutorial";
    return "simple_qa";
  }

  function selectModel(intent, userConfig) {
    if (intent === "deep_research" || intent === "multi_question") return MODELS[1];
    if (intent === "emotional_support") return MODELS[0];
    if (userConfig && userConfig.model === "advanced") return MODELS[1];
    return MODELS[0];
  }

  async function sendToModel(model, messages, systemPrompt) {
    const payload = { model, messages, systemPrompt };
    if (model.startsWith("puter:") && global.puter && global.puter.ai) {
      const prompt = [systemPrompt].concat((messages || []).map((m) => m.content)).filter(Boolean).join("\n\n");
      return global.puter.ai.chat(prompt, { model: model.split(":")[1] });
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch("/harmony/ask", {
      method: "POST",
      headers: { "content-type": "application/json", "x-aevra-csrf": sessionStorage.getItem("aevra_csrf") || "browser" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = await res.json().catch(() => ({}));
    const body = data.data || data;
    if (!res.ok || data.success === false || data.error) {
      const row = status.find((s) => s.model === model);
      if (row) row.status = res.status === 429 ? "rate_limited" : "error";
      throw new Error(data.error || "Model request failed");
    }
    return body.response || body.answer || "";
  }

  async function harmonize(userMessage, userProfile) {
    const intent = analyzeIntent(userMessage);
    const systemPrompt = `You are Aevra, a warm and intelligent AI study companion designed for students. Adapt to ${userProfile && userProfile.displayName ? userProfile.displayName : "the student"} and answer with the ${intent} intent in mind.`;
    const messages = [{ role: "user", content: userMessage }];
    const preferred = selectModel(intent, userProfile && userProfile.ai_behavior_configuration);
    const ordered = [preferred].concat(MODELS.filter((m) => m !== preferred));
    let lastError = null;
    for (const model of ordered) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await sendToModel(model, messages, systemPrompt);
          const row = status.find((s) => s.model === model);
          if (row) row.status = "ok";
          return response;
        } catch (error) {
          lastError = error;
          if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }
    }
    throw lastError || new Error("All Aevra models are unavailable.");
  }

  function getModelStatus() {
    return status.slice();
  }

  global.AevraHarmonySystem = { analyzeIntent, selectModel, sendToModel, harmonize, getModelStatus };
})(window);
