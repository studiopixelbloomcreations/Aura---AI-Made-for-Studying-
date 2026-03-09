const { EvolutionEngine } = require("./personal_intelligence_evolution/evolution_engine");
const { autoEvolveToGitHub } = require("./personal_intelligence_evolution/cloud_deployer");
const { CloudStateStore } = require("./personal_intelligence_evolution/cloud_state_store");
const { appendObservabilityEvent } = require("./personal_intelligence_evolution/observability");
const { enforceRateLimit } = require("./personal_intelligence_evolution/security_ops");

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
  if (src.best_friend_name) out.best_friend_name = sanitizeFactValue(src.best_friend_name, 80);
  if (src.favorite_sport) out.favorite_sport = sanitizeFactValue(src.favorite_sport, 80);
  if (src.favorite_color) out.favorite_color = sanitizeFactValue(src.favorite_color, 60);
  if (src.hobbies) out.hobbies = sanitizeFactValue(src.hobbies, 140);
  if (src.goal) out.goal = sanitizeFactValue(src.goal, 160);
  if (src.preferred_language) out.preferred_language = sanitizeFactValue(src.preferred_language, 20);
  if (src.grade) out.grade = sanitizeFactValue(src.grade, 8);
  if (src.country) out.country = sanitizeFactValue(src.country, 80);
  if (typeof src.spotify_connected === "boolean") out.spotify_connected = src.spotify_connected;
  Object.keys(src).forEach((k) => {
    if (/^fact_[a-z0-9_]{1,32}$/i.test(k)) {
      out[k] = sanitizeFactValue(src[k], 180);
    }
  });
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
  m = text.match(/\b(?:my best friend(?:'s)? name is|my bff(?:'s)? name is)\s+([A-Za-z][A-Za-z .'-]{1,80})/i);
  if (m && m[1]) updates.best_friend_name = sanitizeFactValue(m[1], 80);
  m = text.match(/\b(?:my (?:favorite|favourite|fav) sport is|i like to play)\s+([A-Za-z][A-Za-z .'-]{2,60})/i);
  if (m && m[1]) updates.favorite_sport = sanitizeFactValue(m[1], 80);
  m = text.match(/\b(?:my (?:favorite|favourite|fav) subject is)\s+([A-Za-z][A-Za-z0-9 .'-]{1,60})/i);
  if (m && m[1]) updates.favorite_subject = sanitizeFactValue(m[1], 80);
  m = text.match(/\b(?:my (?:favorite|favourite|fav) color is)\s+([A-Za-z][A-Za-z .'-]{2,40})/i);
  if (m && m[1]) updates.favorite_color = sanitizeFactValue(m[1], 60);
  m = text.match(/\b(?:my hobby is|my hobbies are|i like)\s+([A-Za-z0-9 ,.'&()-]{2,120})/i);
  if (m && m[1]) updates.hobbies = sanitizeFactValue(m[1], 140);
  m = text.match(/\b(?:my country is|i am from)\s+([A-Za-z .'-]{2,80})/i);
  if (m && m[1]) updates.country = sanitizeFactValue(m[1], 80);
  m = text.match(/\b(?:i am in grade|my grade is)\s+([0-9]{1,2})/i);
  if (m && m[1]) updates.grade = sanitizeFactValue(m[1], 8);
  m = text.match(/\b(?:i prefer|my preferred language is)\s+([A-Za-z]{3,20})/i);
  if (m && m[1]) updates.preferred_language = sanitizeFactValue(m[1], 20);

  m = text.match(/\b(?:my name is|i am|i'm)\s+([A-Za-z][A-Za-z .'-]{1,60})$/i);
  if (m && m[1] && !low.startsWith("i am doing") && !low.startsWith("i am studying")) {
    updates.name = sanitizeFactValue(m[1], 80);
  }

  m = text.match(/\bmy\s+([A-Za-z][A-Za-z0-9 _-]{1,30})\s+is\s+(.{1,120})$/i);
  if (m && m[1] && m[2]) {
    let rawKey = String(m[1]).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    if (/^(fav|favourite|favorite)_subject$/.test(rawKey)) rawKey = "favorite_subject";
    if (/^(fav|favourite|favorite)_color$/.test(rawKey)) rawKey = "favorite_color";
    if (/^(fav|favourite|favorite)_sport$/.test(rawKey)) rawKey = "favorite_sport";
    const key = rawKey ? ("fact_" + rawKey).slice(0, 42) : "";
    if (key && !updates[key] && !updates[rawKey]) updates[key] = sanitizeFactValue(m[2], 180);
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
  const spotifyConnected = !!(knownFacts && knownFacts.spotify_connected);
  const homeFromMsg = extractHomeAddress(message);
  const home = homeFromMsg || sanitizeFactValue(knownFacts && knownFacts.home_address, 220) || findHomeFromHistory(history);

  const openExplorerTrigger =
    text.includes("open file explorer") ||
    text.includes("open files explorer") ||
    text.includes("open my files") ||
    text.includes("open file manager") ||
    text.includes("browse files");
  if (openExplorerTrigger) {
    return {
      type: "open_file_explorer",
      requires_confirmation: true,
      requires_connection: false,
      service: "system",
      execute_via: "browser_file_picker",
      message: "I can open your file picker. Please confirm to continue.",
    };
  }

  if (text.includes("connect spotify") || text.includes("link spotify")) {
    return {
      type: "connect_spotify",
      requires_confirmation: true,
      requires_connection: true,
      service: "spotify",
      oauth_url: spotifyAuthUrl || null,
      message: "I can connect Spotify now. Please authorize Spotify to continue.",
    };
  }

  if (text.includes("play") && (text.includes("liked playlist") || text.includes("liked songs") || text.includes("spotify"))) {
    if (spotifyConnected) {
      return {
        type: "play_spotify_liked",
        requires_confirmation: true,
        requires_connection: false,
        service: "spotify",
        spotify_url: "https://open.spotify.com/collection/tracks",
        message: "I can open your Spotify Liked Songs now. Please confirm.",
      };
    }
    return {
      type: "play_spotify_liked",
      requires_confirmation: true,
      requires_connection: true,
      service: "spotify",
      oauth_url: spotifyAuthUrl || null,
      message: "I need Spotify connected first. Please connect Spotify.",
    };
  }

  if (homeFromMsg) {
    return {
      type: "save_home_address",
      requires_confirmation: false,
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
        requires_confirmation: false,
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
      requires_confirmation: true,
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

function sanitizeModelId(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  if (!/^[A-Za-z0-9._-]{3,120}$/.test(s)) return "";
  return s;
}

async function puterChatReplyFromPayload(message, payload) {
  const p = payload && typeof payload === "object" ? payload : {};
  const puterReply = p.puter_reply && typeof p.puter_reply === "object" ? p.puter_reply : {};
  const answer = String(puterReply.answer || "").trim();
  const model = sanitizeModelId(puterReply.model || p.model || "gemini-3-pro-preview");
  if (!answer) {
    return {
      ok: false,
      error: "PUTER_REQUIRED: send puter_reply.answer from frontend Puter call",
      answer: fallbackReply(message),
      speak_text: buildSpeakText(fallbackReply(message)),
      provider: "none",
      model,
    };
  }
  return {
    ok: true,
    error: "",
    answer,
    speak_text: buildSpeakText(answer),
    provider: `puter:${model || "gemini-3-pro-preview"}`,
    model,
  };
}

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  const rate = enforceRateLimit(event, "ask", Number(process.env.PI_ASK_RATE_LIMIT_PER_MIN || 90), 60000);
  if (!rate.allowed) {
    return json(429, { error: "Rate limit exceeded", rate_limit: rate });
  }

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
  const startedAt = Date.now();
  const cloudEvolveOnly = !!(payload && payload.cloud_evolve_only);

  const extractedUpdates = detectMemoryUpdates(message);
  const combinedKnownFacts = mergeKnownFacts(incomingKnownFacts, extractedUpdates);
  const action = detectAction(message, history, combinedKnownFacts);
  const actionUpdates = {};
  if (action && action.home_address) actionUpdates.home_address = String(action.home_address);
  const mergedKnownFacts = mergeKnownFacts(combinedKnownFacts, actionUpdates);
  const llm = action || cloudEvolveOnly ? null : await puterChatReplyFromPayload(message, payload);
  const answer = cloudEvolveOnly
    ? String(((payload && payload.puter_reply && payload.puter_reply.answer) || "Cloud evolution sync accepted.")).trim()
    : (action && action.message ? String(action.message) : llm.answer);
  const speakText = cloudEvolveOnly
    ? buildSpeakText(answer)
    : (action && action.message ? buildSpeakText(action.message) : String(llm.speak_text || buildSpeakText(answer)));
  const aiProvider = cloudEvolveOnly ? "puter_client" : (action ? "local_action" : String(llm.provider || "puter"));
  const aiOk = cloudEvolveOnly ? true : (action ? true : !!llm.ok);
  const aiError = cloudEvolveOnly ? "" : (action ? "" : String(llm.error || ""));
  const latencyMs = Math.max(0, Date.now() - startedAt);
  const runtimeMode = "cloud_only";

  let evolutionMeta = null;
  try {
    evolutionMeta = await EvolutionEngine.processInteraction({
      timestamp: new Date().toISOString(),
      message,
      response: answer,
      success: aiOk,
      corrected: false,
      latency_ms: latencyMs,
      module_id: action && action.type ? String(action.type) : "brain.main",
      action,
      ai_provider: aiProvider,
      ai_error: aiError,
      language,
      subject,
      history,
      known_facts: mergedKnownFacts,
      profile: payload && payload.profile,
      current_task: action && action.type ? String(action.type) : "conversation",
      runtime_mode: runtimeMode,
    });
  } catch (e) {
    evolutionMeta = null;
  }

  let cloudEvolution = null;
  try {
    const cloudEnabled = String(process.env.PI_CLOUD_AUTO_EVOLVE || "").trim().toLowerCase() === "true";
    if (cloudEnabled) {
      cloudEvolution = await autoEvolveToGitHub({
        uid: payload && payload.uid,
        email: payload && payload.email,
        user_id: payload && payload.user_id,
        message,
        known_facts: mergedKnownFacts,
        memory_updates: mergeKnownFacts(extractedUpdates, actionUpdates),
        puter_generated_code: payload && payload.puter_generated_code,
        puter_model: payload && payload.puter_model,
        schema_candidates: payload && payload.schema_candidates,
      });
    }
  } catch (e) {
    cloudEvolution = {
      ok: false,
      stage: "runtime",
      error: String(e && e.message ? e.message : e),
    };
  }

  try {
    const store = new CloudStateStore();
    await appendObservabilityEvent(store, "ask_response", {
      ai_provider: aiProvider,
      ai_ok: aiOk,
      latency_ms: latencyMs,
      action_type: action && action.type ? String(action.type) : "",
      evolution: evolutionMeta && evolutionMeta.evolution_status ? true : false,
      phase2: evolutionMeta && evolutionMeta.phase2_status ? true : false,
      phase3to9: evolutionMeta && evolutionMeta.phases_3_to_9_status ? true : false,
    });
  } catch (e) {}

  return json(200, {
    answer,
    speak_text: speakText,
    ai_provider: aiProvider,
    ai_ok: aiOk,
    ai_error: aiError,
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
    evolution_status: evolutionMeta && evolutionMeta.evolution_status ? evolutionMeta.evolution_status : undefined,
    active_module_versions: evolutionMeta && evolutionMeta.active_module_versions ? evolutionMeta.active_module_versions : undefined,
    proposal_trace_id: evolutionMeta && evolutionMeta.proposal_trace_id ? evolutionMeta.proposal_trace_id : undefined,
    pi_os_status: evolutionMeta && evolutionMeta.pi_os_status ? evolutionMeta.pi_os_status : undefined,
    phase2_status: evolutionMeta && evolutionMeta.phase2_status ? evolutionMeta.phase2_status : undefined,
    phases_3_to_9_status: evolutionMeta && evolutionMeta.phases_3_to_9_status ? evolutionMeta.phases_3_to_9_status : undefined,
    pcos_status: evolutionMeta && evolutionMeta.pcos_status ? evolutionMeta.pcos_status : undefined,
    cognitive_trace_id: evolutionMeta && evolutionMeta.cognitive_trace_id ? evolutionMeta.cognitive_trace_id : undefined,
    twin_state_version: evolutionMeta && evolutionMeta.twin_state_version ? evolutionMeta.twin_state_version : undefined,
    research_report_id: evolutionMeta && evolutionMeta.research_report_id ? evolutionMeta.research_report_id : undefined,
    governance_decision_id: evolutionMeta && evolutionMeta.governance_decision_id ? evolutionMeta.governance_decision_id : undefined,
    runtime_mode: runtimeMode,
    cloud_evolution: cloudEvolution || undefined,
  });
};
