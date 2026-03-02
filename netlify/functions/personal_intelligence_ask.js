function json(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type,authorization",
    },
    body: JSON.stringify(obj),
  };
}

function extractHomeAddress(text) {
  const t = String(text || "");
  const patterns = [
    /\bset home (?:to|as) ([A-Za-z0-9 ,./#'-]{6,180})/i,
    /\bmy home is at ([A-Za-z0-9 ,./#'-]{6,180})/i,
    /\bhome address is ([A-Za-z0-9 ,./#'-]{6,180})/i,
    /\bi live at ([A-Za-z0-9 ,./#'-]{6,180})/i,
  ];
  for (const p of patterns) {
    const m = t.match(p);
    if (m && m[1]) return String(m[1]).trim().replace(/\.$/, "");
  }
  return "";
}

function sanitizeFactValue(v, maxLen) {
  const t = String(v || "").trim().replace(/\s+/g, " ");
  if (!t) return "";
  return t.slice(0, maxLen || 180);
}

function sanitizeKnownFacts(input) {
  const src = input && typeof input === "object" ? input : {};
  const out = {};

  if (src.name) out.name = sanitizeFactValue(src.name, 80);
  if (src.home_address) out.home_address = sanitizeFactValue(src.home_address, 220);
  if (src.zip_code) out.zip_code = sanitizeFactValue(src.zip_code, 20);
  if (src.city) out.city = sanitizeFactValue(src.city, 80);
  if (src.school) out.school = sanitizeFactValue(src.school, 120);
  if (src.country) out.country = sanitizeFactValue(src.country, 80);
  return out;
}

function detectMemoryUpdates(message) {
  const text = String(message || "").trim();
  const low = text.toLowerCase();
  const updates = {};

  const home = extractHomeAddress(text);
  if (home) updates.home_address = sanitizeFactValue(home, 220);

  let m = text.match(/\b(?:zip|zip code|zipcode|postal code)\s*(?:is|:)?\s*([0-9]{4,10}(?:-[0-9]{2,4})?)/i);
  if (m && m[1]) updates.zip_code = sanitizeFactValue(m[1], 20);

  m = text.match(/\b(?:i live in|my city is|city is)\s+([A-Za-z .'-]{2,80})/i);
  if (m && m[1]) updates.city = sanitizeFactValue(m[1], 80);

  m = text.match(/\b(?:my school is|i study at)\s+([A-Za-z0-9 .,'&()-]{2,120})/i);
  if (m && m[1]) updates.school = sanitizeFactValue(m[1], 120);

  m = text.match(/\b(?:my name is|i am|i'm)\s+([A-Za-z][A-Za-z .'-]{1,60})$/i);
  if (m && m[1] && !low.startsWith("i am doing") && !low.startsWith("i am studying")) {
    updates.name = sanitizeFactValue(m[1], 80);
  }

  return updates;
}

function mergeKnownFacts(baseFacts, updates) {
  const base = sanitizeKnownFacts(baseFacts);
  const add = sanitizeKnownFacts(updates);
  return Object.assign({}, base, add);
}

function findHomeFromHistory(history) {
  const list = Array.isArray(history) ? history : [];
  for (let i = list.length - 1; i >= 0; i--) {
    const c = list[i] && list[i].content ? String(list[i].content) : "";
    const home = extractHomeAddress(c);
    if (home) return home;
  }
  return "";
}

function detectAction(message, history, knownFacts) {
  const text = String(message || "").toLowerCase();
  const spotifyAuthUrl = String(process.env.SPOTIFY_AUTH_URL || "").trim();
  const homeFromMsg = extractHomeAddress(message);
  const home = homeFromMsg || sanitizeFactValue(knownFacts && knownFacts.home_address, 220) || findHomeFromHistory(history);

  if (text.includes("connect spotify") || text.includes("link spotify")) {
    return {
      type: "connect_spotify",
      requires_connection: true,
      service: "spotify",
      oauth_url: spotifyAuthUrl || null,
      message: "I can connect Spotify now. Please authorize Spotify to continue.",
    };
  }

  if (text.includes("play") && (text.includes("liked playlist") || text.includes("liked songs") || text.includes("spotify"))) {
    return {
      type: "play_spotify_liked",
      requires_connection: true,
      service: "spotify",
      oauth_url: spotifyAuthUrl || null,
      message: "I need Spotify connected first. Please connect Spotify.",
    };
  }

  if (homeFromMsg) {
    return {
      type: "save_home_address",
      requires_connection: false,
      service: "maps",
      home_address: homeFromMsg,
      message: `Got it. I saved your home as ${homeFromMsg}.`,
    };
  }

  const directionsTrigger =
    ((text.includes("direction") || text.includes("directions")) && text.includes("home")) ||
    text.includes("get me home") ||
    text.includes("navigate home");

  if (directionsTrigger) {
    if (!home) {
      return {
        type: "directions_home",
        requires_connection: false,
        service: "maps",
        message: "I need your home address first. Say: set home to <your address>.",
      };
    }
    const mapsUrl =
      "https://www.google.com/maps/dir/?api=1&destination=" +
      encodeURIComponent(home) +
      "&travelmode=driving";
    return {
      type: "directions_home",
      requires_connection: false,
      service: "maps",
      maps_url: mapsUrl,
      message: "Opening Google Maps directions to your home.",
    };
  }

  return null;
}

function fallbackReply(message) {
  const low = String(message || "").toLowerCase();
  if (["hi", "hello", "hey tutor", "how are you"].some((x) => low.includes(x))) {
    return "Hey, I am Tutor. I am here with you. We can chat, plan your day, or handle tasks like directions and music.";
  }
  if (low.includes("homework") || low.includes("study") || low.includes("exam")) {
    return "Absolutely. Tell me the subject and exact question, and I will teach it step by step.";
  }
  return "I am here and listening. Tell me what you want to do, and I will help you right away.";
}

function buildSpeakText(text) {
  const cleaned = String(text || "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned;
}

function knownFactsToPrompt(facts) {
  const f = sanitizeKnownFacts(facts);
  const rows = [];
  if (f.name) rows.push(`name: ${f.name}`);
  if (f.home_address) rows.push(`home_address: ${f.home_address}`);
  if (f.zip_code) rows.push(`zip_code: ${f.zip_code}`);
  if (f.city) rows.push(`city: ${f.city}`);
  if (f.school) rows.push(`school: ${f.school}`);
  if (f.country) rows.push(`country: ${f.country}`);
  return rows.length ? rows.join("\n") : "none";
}

async function geminiChatReply(message, history, language, subject, knownFacts) {
  const apiKey = String(process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) {
    return {
      ok: false,
      error: "GEMINI_API_KEY missing in Netlify environment.",
      answer: fallbackReply(message),
    };
  }

  const model = String(process.env.GEMINI_PERSONAL_MODEL || "gemini-2.5-flash").trim();
  const maxOutputTokens = Number(process.env.GEMINI_PERSONAL_MAX_TOKENS || 140);
  const baseUrl = String(process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com").trim();
  const systemInstruction =
    `You are Tutor, a warm and capable personal assistant for a student. Speak in ${language}. ` +
    `Keep replies short, natural, and practical. Default to 1-2 short sentences unless the user asks for detailed steps. ` +
    `Help with daily tasks and study support in ${subject}. ` +
    `Use known user facts when relevant to personalize responses naturally.`;

  const contents = [];
  const h = Array.isArray(history) ? history.slice(-8) : [];
  for (const item of h) {
    if (!item || !item.role || !item.content) continue;
    contents.push({
      role: item.role === "assistant" ? "model" : "user",
      parts: [{ text: String(item.content).slice(0, 1200) }],
    });
  }
  contents.push({ role: "user", parts: [{ text: String(message || "") }] });

  try {
    const endpoint = `${baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents: [
          {
            role: "user",
            parts: [{ text: `Known user facts:\n${knownFactsToPrompt(knownFacts)}` }],
          },
          ...contents,
        ],
        generationConfig: {
          temperature: 0.6,
          maxOutputTokens: Number.isFinite(maxOutputTokens) ? maxOutputTokens : 140,
        },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail =
        (data && data.error && data.error.message) ? String(data.error.message) : `HTTP ${res.status}`;
      return {
        ok: false,
        error: `Gemini request failed: ${detail}`,
        answer: fallbackReply(message),
      };
    }

    const parts =
      data &&
      data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      Array.isArray(data.candidates[0].content.parts)
        ? data.candidates[0].content.parts
        : [];
    const answer = parts.map((p) => (p && p.text ? String(p.text) : "")).join("").trim();
    if (!answer) {
      return {
        ok: false,
        error: "Gemini returned an empty answer.",
        answer: fallbackReply(message),
      };
    }
    return { ok: true, answer, speak_text: buildSpeakText(answer), error: "" };
  } catch (e) {
    return {
      ok: false,
      error: `Gemini request failed: ${String(e.message || e)}`,
      answer: fallbackReply(message),
      speak_text: buildSpeakText(fallbackReply(message)),
    };
  }
}

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  let payload = {};
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return json(400, { error: "Invalid JSON body" });
  }

  const message = String((payload && payload.message) || "").trim();
  const history = payload && payload.history ? payload.history : [];
  const language = String((payload && payload.language) || "English");
  const subject = String((payload && payload.subject) || "General");
  const incomingKnownFacts = sanitizeKnownFacts(payload && payload.known_facts);
  if (!message) return json(200, { error: "Message cannot be empty" });

  const extractedUpdates = detectMemoryUpdates(message);
  const combinedKnownFacts = mergeKnownFacts(incomingKnownFacts, extractedUpdates);
  const action = detectAction(message, history, combinedKnownFacts);
  const actionUpdates = action && action.home_address ? { home_address: String(action.home_address) } : {};
  const mergedKnownFacts = mergeKnownFacts(combinedKnownFacts, actionUpdates);
  const gemini = action ? null : await geminiChatReply(message, history, language, subject, mergedKnownFacts);
  const answer = action && action.message ? String(action.message) : gemini.answer;
  const speakText = action && action.message ? buildSpeakText(action.message) : String(gemini.speak_text || buildSpeakText(answer));

  return json(200, {
    answer,
    speak_text: speakText,
    ai_provider: action ? "local_action" : "gemini",
    ai_ok: action ? true : !!gemini.ok,
    ai_error: action ? "" : String(gemini.error || ""),
    used_google_context: false,
    google_results: [],
    learned_facts: mergedKnownFacts,
    memory_updates: mergeKnownFacts(extractedUpdates, actionUpdates),
    action,
    integration_state: {
      spotify_connected: false,
      google_maps_connected: true,
      home_address: sanitizeFactValue(mergedKnownFacts.home_address, 220) || findHomeFromHistory(history) || "",
    },
  });
};
