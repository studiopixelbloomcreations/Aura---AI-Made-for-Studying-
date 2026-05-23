const { getModelApiKey } = require("./model_api_registry");
const { SIGNALS } = require("./ncs_engine");

function buildBrainPrompt(context) {
  const signalNames = SIGNALS.map(s => s.key).join(", ");
  
  return [
    "You are the Neural Command System (NCS) Brain. You orchestrate the Aura AI system.",
    "Your job is NOT to answer the user directly. Your job is to analyze the user's message and the system context, and output a JSON decision that configures the downstream AI.",
    "",
    "## INPUT CONTEXT",
    `User Message: ${context.message}`,
    `Known Facts: ${JSON.stringify(context.known_facts || {})}`,
    `LUMEN Memory Exists: ${!!context.lumen_memory}`,
    `Observatory Analysis: ${JSON.stringify(context.observatory || {})}`,
    "",
    "## YOUR DECISION JSON SCHEMA",
    "You MUST output ONLY valid JSON matching this schema:",
    "{",
    '  "system_type": "string", // One of: ' + signalNames,
    '  "confidence": 0.0 to 1.0, // Your confidence in this classification',
    '  "memory_commands": { // Facts the system MUST memorize in LUMEN (family names, preferences, personal info). Empty object if nothing to save.',
    '     "fact_key": "fact_value"',
    "  },",
    '  "prompt_injection": "string", // Specific instructions to prepend to the downstream AI prompt (e.g. \"Act as a therapist\", or \"Speak like a pirate\"). Leave empty if normal.',
    '  "response_directives": {',
    '     "tone": "string", // e.g. "warm", "clinical", "encouraging"',
    '     "depth": "string", // e.g. "simple", "detailed", "step-by-step"',
    '     "length": "string" // e.g. "concise", "verbose"',
    "  },",
    '  "model_override": "string" // Which model should answer? (grok, groq, openrouter, mistral, deepseek). Leave empty to let system decide.',
    "}"
  ].join("\n");
}

async function invokeBrain(context) {
  // 1. Try Groq (llama-3.3-70b-versatile) first because it's fast
  let apiKey = getModelApiKey("groq");
  let url = "https://api.groq.com/openai/v1/chat/completions";
  let model = "llama-3.3-70b-versatile";

  // 2. Fallback to Grok
  if (!apiKey) {
    apiKey = getModelApiKey("grok");
    url = "https://api.x.ai/v1/chat/completions";
    model = "grok-3-mini";
  }

  // 3. Fallback to DeepSeek
  if (!apiKey) {
    apiKey = getModelApiKey("deepseek");
    url = "https://api.deepseek.com/chat/completions";
    model = "deepseek-chat";
  }

  // 4. Fallback to rule-based engine if no API keys exist
  if (!apiKey) {
    return { error: "no_brain_models_configured" };
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: "system", content: buildBrainPrompt(context) },
          { role: "user", content: "Analyze the context and provide the JSON decision." }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      })
    });

    if (!response.ok) {
      throw new Error(`Brain API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    const decision = JSON.parse(content);
    return decision;
  } catch (err) {
    return { error: err.message };
  }
}

module.exports = {
  invokeBrain
};
