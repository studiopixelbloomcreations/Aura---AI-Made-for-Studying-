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

function findHomeFromHistory(history) {
  const list = Array.isArray(history) ? history : [];
  for (let i = list.length - 1; i >= 0; i--) {
    const c = list[i] && list[i].content ? String(list[i].content) : "";
    const home = extractHomeAddress(c);
    if (home) return home;
  }
  return "";
}

function detectAction(message, history) {
  const text = String(message || "").toLowerCase();
  const spotifyAuthUrl = String(process.env.SPOTIFY_AUTH_URL || "").trim();
  const homeFromMsg = extractHomeAddress(message);
  const home = homeFromMsg || findHomeFromHistory(history);

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

async function groqChatReply(message, history, language, subject) {
  const apiKey = String(process.env.GROQ_API_KEY || "").trim();
  if (!apiKey) return fallbackReply(message);

  const msgs = [];
  msgs.push({
    role: "system",
    content:
      `You are Tutor, a warm and capable personal assistant for a student. Speak in ${language}. Keep responses short, natural, and conversational. Be helpful for daily tasks and study support in ${subject}.`,
  });
  const h = Array.isArray(history) ? history.slice(-8) : [];
  for (const item of h) {
    if (!item || !item.role || !item.content) continue;
    const role = item.role === "assistant" ? "assistant" : "user";
    msgs.push({ role, content: String(item.content).slice(0, 1200) });
  }
  msgs.push({ role: "user", content: String(message || "") });

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.GROQ_PERSONAL_MODEL || process.env.GROQ_MODEL || "llama-3.1-8b-instant",
        messages: msgs,
        temperature: 0.6,
        max_tokens: 350,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return fallbackReply(message);
    return (
      data &&
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content
    )
      ? String(data.choices[0].message.content)
      : fallbackReply(message);
  } catch (e) {
    return fallbackReply(message);
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
  if (!message) return json(200, { error: "Message cannot be empty" });

  const action = detectAction(message, history);
  const answer = action && action.message ? String(action.message) : await groqChatReply(message, history, language, subject);

  return json(200, {
    answer,
    used_google_context: false,
    google_results: [],
    learned_facts: {},
    action,
    integration_state: {
      spotify_connected: false,
      google_maps_connected: true,
      home_address: extractHomeAddress(message) || findHomeFromHistory(history) || "",
    },
  });
};
