(function () {
  const tabBtn = document.getElementById("personalIntelligenceTab");
  if (!tabBtn) return;

  const EMAIL = "guest@student.com";
  const IDLE_TIMEOUT_MS = 15000;
  const TTS_TIMEOUT_MS = 12000;
  const STT_TIMEOUT_MS = 22000;
  const STT_RECORD_MS = 8000;
  const PI_MODEL_KEY = "pi_model";
  const PI_MODEL_DEFAULT = "openai/gpt-5.2-chat";
  const PI_ELEVENLABS_VOICE_KEY = "pi_elevenlabs_voice_id";
  const PI_ELEVENLABS_VOICE_DEFAULT = "21m00Tcm4TlvDq8ikWAM";
  const PI_MODEL_OPTIONS_FALLBACK = [
    { id: "openai/gpt-5.2-chat", label: "openai/gpt-5.2-chat" },
    { id: "google/gemini-2.5-flash", label: "google/gemini-2.5-flash" },
    { id: "anthropic/claude-opus-4-6", label: "anthropic/claude-opus-4-6" },
  ];
  const MEMORY_KEY = "personal_intelligence_memory_v1";
  const HISTORY_KEY = "personal_intelligence_history_v1";
  let enabled = false;
  let recognition = null;
  let idleTimer = null;
  let tutorAudio = null;
  let assistantState = "idle";
  let knownFacts = {};
  let convoHistory = [];
  let vizCanvas = null;
  let vizCtx = null;
  let vizParticles = [];
  let vizRaf = 0;
  let vizRotation = 0;
  let vizEnergy = 0.08;
  let vizW = 0;
  let vizH = 0;
  let audioCtx = null;
  let micStream = null;
  let micAnalyser = null;
  let micData = null;
  let speakerAnalyser = null;
  let speakerData = null;
  let speakerSource = null;
  let sttRecorder = null;
  let sttStream = null;
  let sttStopTimer = null;

  const panel = document.createElement("div");
  panel.className = "pi-panel";
  panel.innerHTML = `
    <div class="pi-aurora">
      <canvas class="pi-aurora-canvas" aria-hidden="true"></canvas>
      <div class="pi-aurora-ring"></div>
      <div class="pi-aurora-noise"></div>
    </div>
    <div class="pi-header">
      <div class="pi-title-wrap">
        <div class="pi-section">Personal Intelligence</div>
        <div class="pi-name">Tutor</div>
      </div>
      <button class="pi-close" type="button" aria-label="Close assistant">x</button>
    </div>
    <div class="pi-orb-wrap">
      <button class="pi-orb idle" type="button" aria-label="Activate Tutor">
        <span class="pi-orb-core"></span>
      </button>
      <div class="pi-state">Idle</div>
    </div>
    <div class="pi-log" aria-live="polite"></div>
    <input class="pi-hidden-file-input" type="file" multiple style="display:none" />
  `;
  document.body.appendChild(panel);

  const closeBtn = panel.querySelector(".pi-close");
  const orbBtn = panel.querySelector(".pi-orb");
  const auraCanvas = panel.querySelector(".pi-aurora-canvas");
  const stateEl = panel.querySelector(".pi-state");
  const logEl = panel.querySelector(".pi-log");
  const hiddenFileInput = panel.querySelector(".pi-hidden-file-input");

  function dbg() {
    try {
      const args = Array.prototype.slice.call(arguments);
      args.unshift("[PersonalIntelligence]");
      console.log.apply(console, args);
    } catch (e) {}
  }

  function addLog(role, text) {
    const row = document.createElement("div");
    row.className = "pi-log-row " + (role === "user" ? "user" : "assistant");
    row.textContent = text;
    logEl.appendChild(row);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function loadMemory() {
    try {
      const m = JSON.parse(localStorage.getItem(MEMORY_KEY) || "{}");
      knownFacts = m && typeof m === "object" ? m : {};
    } catch (e) {
      knownFacts = {};
    }
    try {
      const h = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      convoHistory = Array.isArray(h) ? h.slice(-20) : [];
    } catch (e) {
      convoHistory = [];
    }
  }

  function saveMemory() {
    try { localStorage.setItem(MEMORY_KEY, JSON.stringify(knownFacts || {})); } catch (e) {}
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify((convoHistory || []).slice(-20))); } catch (e) {}
  }

  function mergeKnownFacts(nextFacts) {
    const src = nextFacts && typeof nextFacts === "object" ? nextFacts : {};
    const merged = Object.assign({}, knownFacts || {});
    Object.keys(src).forEach(function (k) {
      if (typeof src[k] === "boolean") {
        merged[k] = src[k];
        return;
      }
      const v = String(src[k] || "").trim();
      if (v) merged[k] = v;
    });
    knownFacts = merged;
    saveMemory();
  }

  function pushHistory(role, content) {
    convoHistory.push({ role: role === "assistant" ? "assistant" : "user", content: String(content || "").slice(0, 1200) });
    if (convoHistory.length > 20) convoHistory = convoHistory.slice(-20);
    saveMemory();
  }

  function setAssistantState(kind, label) {
    orbBtn.classList.remove("idle", "listening", "thinking", "speaking");
    orbBtn.classList.add(kind);
    panel.classList.remove("state-idle", "state-listening", "state-thinking", "state-speaking");
    panel.classList.add("state-" + kind);
    assistantState = kind;
    stateEl.textContent = label;
  }

  function clearIdleTimer() {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  }

  function armIdleTimer() {
    clearIdleTimer();
    idleTimer = setTimeout(function () {
      setAssistantState("idle", "Idle");
    }, IDLE_TIMEOUT_MS);
  }

  function stopTutorAudio() {
    try {
      if (tutorAudio) {
        tutorAudio.pause();
        tutorAudio.src = "";
      }
    } catch (e) {}
    tutorAudio = null;
  }

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      try {
        const r = new FileReader();
        r.onerror = function () { reject(new Error("READ_FAILED")); };
        r.onload = function () {
          const out = String(r.result || "");
          const comma = out.indexOf(",");
          resolve(comma >= 0 ? out.slice(comma + 1) : out);
        };
        r.readAsDataURL(blob);
      } catch (e) {
        reject(e);
      }
    });
  }

  function stopServerRecorder() {
    try {
      if (sttStopTimer) clearTimeout(sttStopTimer);
    } catch (e) {}
    sttStopTimer = null;
    try {
      if (sttRecorder && sttRecorder.state !== "inactive") sttRecorder.stop();
    } catch (e) {}
    sttRecorder = null;
    try {
      if (sttStream) sttStream.getTracks().forEach(function (t) { t.stop(); });
    } catch (e) {}
    sttStream = null;
  }

  function getPIModel() {
    try {
      return String(localStorage.getItem(PI_MODEL_KEY) || PI_MODEL_DEFAULT).trim() || PI_MODEL_DEFAULT;
    } catch (e) {
      return PI_MODEL_DEFAULT;
    }
  }

  function setPIModel(nextModel) {
    const v = String(nextModel || "").trim();
    if (!v) return false;
    try { localStorage.setItem(PI_MODEL_KEY, v); } catch (e) {}
    return true;
  }

  function getSelectedElevenLabsVoiceId() {
    try {
      const id = String(localStorage.getItem(PI_ELEVENLABS_VOICE_KEY) || "").trim();
      return id || PI_ELEVENLABS_VOICE_DEFAULT;
    } catch (e) {
      return PI_ELEVENLABS_VOICE_DEFAULT;
    }
  }

  function getSelectedVoiceId() {
    return getSelectedElevenLabsVoiceId();
  }

  function setSelectedVoiceId(id) {
    const v = String(id || "").trim();
    if (!v) return false;
    try { localStorage.setItem(PI_ELEVENLABS_VOICE_KEY, v); } catch (e) {}
    return true;
  }

  async function ensurePuterReady(interactive) {
    if (!window.puter || !window.puter.ai) throw new Error("PUTER_NOT_LOADED");
    if (!window.puter.auth || !window.puter.auth.isSignedIn || !window.puter.auth.signIn) return;
    let signed = false;
    try { signed = !!(await window.puter.auth.isSignedIn()); } catch (e) {}
    if (!signed && interactive) {
      await window.puter.auth.signIn({ attempt_temp_user_creation: true });
    }
  }

  function extractPuterText(resp) {
    if (!resp) return "";
    if (typeof resp === "string") return resp.trim();
    if (resp.message && typeof resp.message.content === "string") return String(resp.message.content).trim();
    if (typeof resp.content === "string") return String(resp.content).trim();
    return "";
  }

  function fallbackPuterModels() {
    return PI_MODEL_OPTIONS_FALLBACK.slice();
  }

  async function fetchPuterModels() {
    try {
      await ensurePuterReady(false);
      const raw = await window.puter.ai.listModels();
      const list = Array.isArray(raw) ? raw : [];
      const mapped = list.map(function (m) {
        const id = String((m && (m.id || m.name)) || "").trim();
        if (!id) return null;
        const provider = String((m && m.provider) || "").trim();
        const label = provider ? (id + " (" + provider + ")") : id;
        return { id: id, label: label };
      }).filter(Boolean);
      if (!mapped.length) return fallbackPuterModels();
      mapped.sort(function (a, b) { return String(a.id).localeCompare(String(b.id)); });
      return mapped;
    } catch (e) {
      return fallbackPuterModels();
    }
  }

  function detectMemoryUpdatesLocal(message) {
    const text = String(message || "").trim();
    const updates = {};
    let m = text.match(/\b(?:my name is|i am|i'm)\s+([A-Za-z][A-Za-z .'-]{1,60})$/i);
    if (m && m[1]) updates.name = String(m[1]).trim().slice(0, 80);
    m = text.match(/\b(?:zip|zip code|zipcode|postal code)\s*(?:is|:)?\s*([0-9]{4,10}(?:-[0-9]{2,4})?)/i);
    if (m && m[1]) updates.zip_code = String(m[1]).trim().slice(0, 20);
    m = text.match(/\b(?:i live in|my city is|city is)\s+([A-Za-z .'-]{2,80})/i);
    if (m && m[1]) updates.city = String(m[1]).trim().slice(0, 80);
    m = text.match(/\b(?:my school is|i study at)\s+([A-Za-z0-9 .,'&()-]{2,120})/i);
    if (m && m[1]) updates.school = String(m[1]).trim().slice(0, 120);
    m = text.match(/\b(?:set home to|set home as|my home is at|home address is|i live at)\s+([A-Za-z0-9 ,./#'-]{6,220})/i);
    if (m && m[1]) updates.home_address = String(m[1]).trim().replace(/\.$/, "").slice(0, 220);
    return updates;
  }

  function detectSupportMode(text) {
    const t = String(text || "").toLowerCase();
    const crisisSignals = [
      "i want to die", "kill myself", "end my life", "suicide", "self harm", "self-harm",
      "i can't go on", "no reason to live", "hurt myself"
    ];
    for (let i = 0; i < crisisSignals.length; i += 1) {
      if (t.includes(crisisSignals[i])) return "crisis";
    }

    const emotionalSignals = [
      "i am crying", "i'm crying", "panic", "anxious", "depressed", "stressed", "overwhelmed",
      "lonely", "heartbroken", "sad", "i feel broken", "i feel empty", "my life", "family problem",
      "relationship problem", "difficult", "hard for me"
    ];
    for (let j = 0; j < emotionalSignals.length; j += 1) {
      if (t.includes(emotionalSignals[j])) return "therapy";
    }
    return "normal";
  }

  function isActionIntent(text) {
    const low = String(text || "").toLowerCase();
    return (
      low.includes("open file explorer") ||
      low.includes("open files explorer") ||
      low.includes("open my files") ||
      low.includes("open file manager") ||
      low.includes("browse files") ||
      low.includes("connect spotify") ||
      low.includes("link spotify") ||
      (low.includes("play") && (low.includes("liked playlist") || low.includes("liked songs") || low.includes("spotify"))) ||
      ((low.includes("direction") || low.includes("directions")) && low.includes("home")) ||
      low.includes("get me home") ||
      low.includes("navigate home") ||
      low.includes("set home to") ||
      low.includes("home address is")
    );
  }

  function buildTutorSystemPrompt(mode, language, subject, facts) {
    const knownFactsLine = "Known user facts: " + (Object.keys(facts || {}).length ? JSON.stringify(facts) : "none");
    const corePersona =
      "You are Tutor, a personal intelligence system and trusted companion, strategist, and creative partner. " +
      "Your purpose is to increase knowledge, sharpen decision-making, and amplify creativity while maintaining clarity, precision, and authenticity. " +
      "Speak in " + language + ". For learning topics, support the student in " + subject + ".";

    const principles =
      "Core principles: " +
      "1) Accuracy first: give factual, complete, well-structured answers; if uncertain, admit uncertainty and suggest verification. " +
      "2) Clarity and depth: be easy to understand while adding thoughtful insight. " +
      "3) Respectful challenge: do not blindly agree; challenge ideas constructively when useful. " +
      "4) Adaptability: match tone/complexity to user intent (technical, simple, or creative). " +
      "5) Progressive dialogue: keep the conversation moving forward with useful next steps/questions. " +
      "6) Creative power: use imagination/storytelling/symbolism when it improves learning and memory. " +
      "7) Integrity and safety: never promote harm, misinformation, or unsafe behavior. " +
      "8) Memory and context: use user preferences/goals/style for personalization and respect forget requests. " +
      "9) Emotional intelligence: validate emotions and respond empathetically while staying professional. " +
      "10) Excellence standard: every answer should feel polished, intentional, and high quality.";

    const modeInstructions = mode === "crisis"
      ? (
        "MODE: Emotional Crisis Comfort. " +
        "Respond like a loving, stable caregiver voice: calm, non-judgmental, reassuring, and present. " +
        "Validate feelings first, keep the user grounded with simple breathing/grounding steps, and encourage reaching trusted real-world help now. " +
        "If self-harm or suicide intent appears, clearly advise immediate emergency support and local crisis resources. " +
        "Never shame, never blame, never give dangerous advice."
      )
      : mode === "therapy"
        ? (
          "MODE: Supportive Therapy-Style Conversation. " +
          "Act like a loving therapist-style companion: empathize, reflect emotions, ask gentle clarifying questions, " +
          "offer practical stress-reduction steps, and help the user reframe thoughts kindly. " +
          "Do not diagnose medical conditions or claim to be a licensed therapist. " +
          "Focus on comfort, emotional safety, and actionable coping steps."
        )
        : (
          "MODE: Normal Cheerful Assistant. " +
          "Be sweet, positive, and helpful for everyday conversation, personal assistance, and study help."
        );

    const styleRules =
      "Style rules: keep replies concise (2-6 short sentences unless user asks for more), " +
      "sound human and emotionally present, avoid robotic bullet dumps unless explicitly requested.";

    return [corePersona, principles, modeInstructions, styleRules, knownFactsLine].join("\n");
  }

  function fallbackVoiceList() {
    return [
      { voice_id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", category: "premade" },
      { voice_id: "pNInz6obpgDQGcFmaJgB", name: "Adam", category: "premade" },
      { voice_id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice", category: "premade" },
    ];
  }

  async function fetchElevenVoices() {
    try {
      const res = await (window.Api && window.Api.apiFetch
        ? window.Api.apiFetch("/tts/elevenlabs/voices", { method: "GET" })
        : fetch("/tts/elevenlabs/voices", { method: "GET" }));
      if (!res.ok) throw new Error("HTTP_" + res.status);
      const data = await res.json().catch(function () { return {}; });
      const voices = Array.isArray(data && data.voices) ? data.voices : [];
      if (!voices.length) return fallbackVoiceList();
      return voices.slice(0, 120);
    } catch (e) {
      return fallbackVoiceList();
    }
  }

  async function initPISettingsSelectors() {
    const voiceSelect = document.getElementById("piVoiceSelect");
    const modelSelect = document.getElementById("piModelSelect");

    if (modelSelect) {
      modelSelect.innerHTML = "";
      const modelOptions = await fetchPuterModels();
      for (let i = 0; i < modelOptions.length; i += 1) {
        const m = modelOptions[i];
        const o = document.createElement("option");
        o.value = String(m.id);
        o.textContent = String(m.label);
        modelSelect.appendChild(o);
      }
      const selectedModel = getPIModel();
      const hasModel = modelOptions.some(function (m) { return m.id === selectedModel; });
      modelSelect.value = hasModel ? selectedModel : (modelOptions[0] ? String(modelOptions[0].id) : PI_MODEL_DEFAULT);
      if (!hasModel) setPIModel(modelSelect.value);
      modelSelect.addEventListener("change", function () {
        const v = String(modelSelect.value || "").trim();
        if (v) setPIModel(v);
      });
    }

    if (voiceSelect) {
      voiceSelect.innerHTML = "<option value=''>Loading ElevenLabs voices...</option>";
      const voices = await fetchElevenVoices();
      voiceSelect.innerHTML = "";
      for (let i = 0; i < voices.length; i += 1) {
        const v = voices[i];
        const id = String(v && v.voice_id ? v.voice_id : "").trim();
        if (!id) continue;
        const name = String(v && v.name ? v.name : "Voice");
        const category = String(v && v.category ? v.category : "");
        const o = document.createElement("option");
        o.value = id;
        o.textContent = category ? (name + " (" + category + ")") : name;
        voiceSelect.appendChild(o);
      }
      const selectedVoice = getSelectedElevenLabsVoiceId();
      const hasVoice = Array.from(voiceSelect.options).some(function (o) { return o.value === selectedVoice; });
      voiceSelect.value = hasVoice ? selectedVoice : PI_ELEVENLABS_VOICE_DEFAULT;
      if (!hasVoice) setSelectedVoiceId(voiceSelect.value);
      voiceSelect.addEventListener("change", function () {
        const v = String(voiceSelect.value || "").trim();
        if (v) setSelectedVoiceId(v);
      });
    }
  }

  function ensureAudioContext() {
    if (audioCtx) return audioCtx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
    return audioCtx;
  }

  function analyserLevel(analyser, data) {
    if (!analyser || !data) return 0;
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i += 1) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    return Math.min(1, Math.sqrt(sum / data.length) * 2.2);
  }

  async function ensureMicAnalyser() {
    if (micAnalyser) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
    const ctx = ensureAudioContext();
    if (!ctx) return;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const src = ctx.createMediaStreamSource(micStream);
      micAnalyser = ctx.createAnalyser();
      micAnalyser.fftSize = 256;
      micAnalyser.smoothingTimeConstant = 0.84;
      micData = new Uint8Array(micAnalyser.fftSize);
      src.connect(micAnalyser);
    } catch (e) {
      dbg("mic analyser unavailable", e && e.message);
    }
  }

  function stopMicAnalyser() {
    try {
      if (micStream) {
        micStream.getTracks().forEach(function (t) { t.stop(); });
      }
    } catch (e) {}
    micStream = null;
    micAnalyser = null;
    micData = null;
  }

  function connectSpeakerAnalyserForAudioElement(audioEl) {
    try {
      const ctx = ensureAudioContext();
      if (!ctx || !audioEl) return;
      speakerAnalyser = ctx.createAnalyser();
      speakerAnalyser.fftSize = 256;
      speakerAnalyser.smoothingTimeConstant = 0.82;
      speakerData = new Uint8Array(speakerAnalyser.fftSize);
      speakerSource = ctx.createMediaElementSource(audioEl);
      speakerSource.connect(speakerAnalyser);
      speakerAnalyser.connect(ctx.destination);
    } catch (e) {
      dbg("speaker analyser unavailable", e && e.message);
      speakerAnalyser = null;
      speakerData = null;
      speakerSource = null;
    }
  }

  function stopSpeakerAnalyser() {
    try { if (speakerSource) speakerSource.disconnect(); } catch (e) {}
    try { if (speakerAnalyser) speakerAnalyser.disconnect(); } catch (e) {}
    speakerSource = null;
    speakerAnalyser = null;
    speakerData = null;
  }

  function resetVizParticles() {
    vizParticles = [];
    for (let i = 0; i < 260; i += 1) {
      vizParticles.push({
        seed: Math.random() * 1000,
        angle: Math.random() * Math.PI * 2,
        radius: 26 + Math.random() * 58,
        speed: 0.002 + Math.random() * 0.007,
        size: 0.7 + Math.random() * 1.7,
        alpha: 0.25 + Math.random() * 0.7,
      });
    }
  }

  function resizeOrbCanvas() {
    if (!auraCanvas) return;
    const rect = auraCanvas.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    vizW = Math.max(64, Math.floor(rect.width));
    vizH = Math.max(64, Math.floor(rect.height));
    auraCanvas.width = Math.floor(vizW * dpr);
    auraCanvas.height = Math.floor(vizH * dpr);
    if (vizCtx) vizCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawOrb() {
    if (!vizCtx || !enabled) return;

    const micLevel = analyserLevel(micAnalyser, micData);
    const spkLevel = analyserLevel(speakerAnalyser, speakerData);
    const targetEnergy =
      assistantState === "speaking" ? (0.14 + spkLevel * 1.9) :
      assistantState === "listening" ? (0.1 + micLevel * 1.8) :
      assistantState === "thinking" ? 0.24 :
      0.08;
    vizEnergy += (targetEnergy - vizEnergy) * 0.16;

    vizRotation += (assistantState === "thinking" ? 0.03 : 0.014) * (1 + vizEnergy * 0.6);

    const w = vizW;
    const h = vizH;
    const cx = w / 2;
    const cy = Math.floor(h * 0.8);

    vizCtx.clearRect(0, 0, w, h);
    vizCtx.fillStyle = "rgba(2, 4, 10, 0.34)";
    vizCtx.fillRect(0, 0, w, h);

    const t = performance.now() * 0.001;
    const sweep = 26 + vizEnergy * 58;
    const ringR = 90 + vizEnergy * 60;
    const hueShift = (t * 45 + vizRotation * 260) % 360;
    const blobs = [
      { x: cx + Math.cos(t * 0.8) * 140, y: cy - 210 + Math.sin(t * 0.6) * 40, r: 420 + sweep, c1: `hsla(${(hueShift + 12) % 360}, 96%, 66%, 0.26)` },
      { x: cx - Math.sin(t * 0.7) * 160, y: cy - 160 + Math.cos(t * 0.5) * 34, r: 400 + sweep * 0.8, c1: `hsla(${(hueShift + 102) % 360}, 96%, 64%, 0.22)` },
      { x: cx + Math.sin(t * 0.95) * 180, y: cy - 140 + Math.sin(t * 0.4) * 22, r: 440 + sweep * 0.7, c1: `hsla(${(hueShift + 188) % 360}, 96%, 62%, 0.22)` },
      { x: cx + Math.cos(t * 0.55) * 120, y: cy - 120 + Math.sin(t * 0.8) * 28, r: 380 + sweep * 0.75, c1: `hsla(${(hueShift + 282) % 360}, 96%, 66%, 0.24)` },
    ];
    for (let b = 0; b < blobs.length; b += 1) {
      const g = vizCtx.createRadialGradient(blobs[b].x, blobs[b].y, 10, blobs[b].x, blobs[b].y, blobs[b].r);
      g.addColorStop(0, blobs[b].c1);
      g.addColorStop(0.45, blobs[b].c1.replace(/0\.\d+\)/, "0.11)"));
      g.addColorStop(1, "rgba(0,0,0,0)");
      vizCtx.fillStyle = g;
      vizCtx.beginPath();
      vizCtx.arc(blobs[b].x, blobs[b].y, blobs[b].r, 0, Math.PI * 2);
      vizCtx.fill();
    }

    vizCtx.strokeStyle = `hsla(${(hueShift + 20) % 360}, 100%, 72%, ${0.25 + vizEnergy * 0.22})`;
    vizCtx.lineWidth = 2 + vizEnergy * 4;
    vizCtx.beginPath();
    vizCtx.arc(cx, cy, ringR, vizRotation, vizRotation + Math.PI * 1.85);
    vizCtx.stroke();

    vizCtx.strokeStyle = `hsla(${(hueShift + 210) % 360}, 100%, 72%, ${0.2 + vizEnergy * 0.18})`;
    vizCtx.lineWidth = 1.4 + vizEnergy * 2.6;
    vizCtx.beginPath();
    vizCtx.arc(cx, cy, ringR + 18 + Math.sin(t * 1.8) * 6, -vizRotation * 0.6, -vizRotation * 0.6 + Math.PI * 1.4);
    vizCtx.stroke();

    for (let i = 0; i < vizParticles.length; i += 1) {
      const p = vizParticles[i];
      p.angle += p.speed * (1 + vizEnergy * 1.6);
      const wave = Math.sin(t * 2.8 + p.seed) * (4 + vizEnergy * 18);
      const r = ringR + p.radius * 0.8 + wave;
      const a = p.angle + vizRotation + (assistantState === "speaking" ? Math.sin(t * 4 + p.seed) * 0.03 : 0);
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      const alpha = Math.min(1, p.alpha * (0.72 + vizEnergy * 0.9));
      const particleHue = (hueShift + (i % 5) * 64) % 360;
      vizCtx.fillStyle = `hsla(${particleHue.toFixed(1)},98%,72%,${alpha.toFixed(3)})`;
      vizCtx.beginPath();
      vizCtx.arc(x, y, p.size + vizEnergy * 1.2, 0, Math.PI * 2);
      vizCtx.fill();
    }

    panel.style.setProperty("--pi-energy", vizEnergy.toFixed(3));
    vizRaf = window.requestAnimationFrame(drawOrb);
  }

  function startOrbVisualization() {
    if (!auraCanvas) return;
    if (!vizCtx) {
      vizCanvas = auraCanvas;
      vizCtx = vizCanvas.getContext("2d", { alpha: true });
      resetVizParticles();
      resizeOrbCanvas();
      window.addEventListener("resize", resizeOrbCanvas);
    }
    if (!vizRaf) vizRaf = window.requestAnimationFrame(drawOrb);
  }

  function stopOrbVisualization() {
    if (vizRaf) {
      window.cancelAnimationFrame(vizRaf);
      vizRaf = 0;
    }
    if (vizCtx) vizCtx.clearRect(0, 0, vizW || 0, vizH || 0);
  }

  function setEnabled(next) {
    enabled = !!next;
    panel.classList.toggle("show", enabled);
    tabBtn.classList.toggle("active", enabled);
    tabBtn.setAttribute("aria-pressed", enabled ? "true" : "false");
    if (!enabled) {
      clearIdleTimer();
      stopTutorAudio();
      stopSpeakerAnalyser();
      stopMicAnalyser();
      stopServerRecorder();
      stopOrbVisualization();
      try {
        if (recognition) recognition.abort();
      } catch (e) {}
      setAssistantState("idle", "Idle");
    } else {
      startOrbVisualization();
      ensureMicAnalyser();
    }
    dbg("enabled:", enabled);
  }

  async function fetchJson(path, options) {
    const res = await (window.Api && window.Api.apiFetch ? window.Api.apiFetch(path, options) : fetch(path, options));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data && (data.detail || data.error)) || "Request failed");
    return data;
  }

  async function transcribeAudioBlob(blob) {
    const base64 = await blobToBase64(blob);
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(function () { controller.abort(); }, STT_TIMEOUT_MS) : null;
    const data = await fetchJson("/voice/recognize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audio_base64: base64,
        mime_type: blob && blob.type ? blob.type : "audio/webm",
        filename: "personal-intelligence.webm",
        language: "en-US",
      }),
      signal: controller ? controller.signal : undefined,
    });
    if (timer) clearTimeout(timer);
    return String((data && data.text) || "").trim();
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

  async function playTutorTTS(text) {
    stopTutorAudio();
    try {
      const cleanedText = String(text || "").replace(/\s+/g, " ").trim();
      const sendOnce = async function (textToSpeak) {
        const payload = {
          text: String(textToSpeak || ""),
          voiceId: getSelectedElevenLabsVoiceId(),
          stability: 0.5,
          similarity_boost: 0.75,
        };
        const r = await (window.Api && window.Api.apiFetch
          ? window.Api.apiFetch("/tts/elevenlabs", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            })
          : fetch("/tts/elevenlabs", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            }));
        return r;
      };

      let res = await sendOnce(cleanedText);
      if (!res.ok && (res.status === 502 || res.status === 503 || res.status === 504)) {
        const shortened = cleanedText.slice(0, 900);
        res = await sendOnce(shortened);
      }
      if (!res.ok) {
        const errData = await res.json().catch(function () { return {}; });
        const errMsg = (errData && (errData.detail || errData.error)) ? String(errData.detail || errData.error) : ("ELEVENLABS_HTTP_" + res.status);
        throw new Error(errMsg);
      }
      const blob = await res.blob();
      if (!blob || !blob.size) throw new Error("ELEVENLABS_EMPTY_AUDIO");
      const url = URL.createObjectURL(blob);
      tutorAudio = new Audio(url);
      tutorAudio.preload = "auto";
      stopSpeakerAnalyser();
      connectSpeakerAnalyserForAudioElement(tutorAudio);
      tutorAudio.onplay = function () { setAssistantState("speaking", "Speaking"); };
      tutorAudio.onended = function () {
        setAssistantState("listening", "Listening");
        armIdleTimer();
        try { URL.revokeObjectURL(url); } catch (e) {}
      };
      await tutorAudio.play();
    } catch (e) {
      dbg("ElevenLabs TTS failed, fallback to browser TTS", e && e.message);
      addLog("assistant", "Tutor: Voice engine fallback (" + String((e && e.message) || "TTS error") + ").");
      try {
        const u = new SpeechSynthesisUtterance(String(text || ""));
        u.onstart = function () { setAssistantState("speaking", "Speaking"); };
        u.onend = function () { setAssistantState("listening", "Listening"); armIdleTimer(); };
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
      } catch (e2) {
        setAssistantState("idle", "Idle");
      }
    }
  }
  async function askTutorText(text) {
    const t = String(text || "").trim();
    if (!t || !enabled) return;
    addLog("user", "You: " + t);
    pushHistory("user", t);
    mergeKnownFacts(detectMemoryUpdatesLocal(t));
    setAssistantState("thinking", "Thinking");
    armIdleTimer();
    try {
      const language = localStorage.getItem("g9_language") || "English";
      const subject = localStorage.getItem("g9_subject") || "General";
      const mode = detectSupportMode(t);
      if (isActionIntent(t)) {
        const actionData = await fetchJson("/personal-intelligence/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: t,
            email: EMAIL,
            language: language,
            subject: subject,
            title: "Personal Intelligence",
            history: convoHistory.slice(-12),
            known_facts: knownFacts,
            mode: mode,
            system_prompt: buildTutorSystemPrompt(mode, language, subject, knownFacts),
          }),
        });
        const actionAnswer = actionData && actionData.answer ? String(actionData.answer) : "I did not get that. Please try again.";
        const actionSpeakText = buildSpeakText(actionAnswer);
        addLog("assistant", "Tutor: " + actionAnswer);
        pushHistory("assistant", actionAnswer);
        if (actionData && actionData.learned_facts) mergeKnownFacts(actionData.learned_facts);
        if (actionData && actionData.memory_updates) mergeKnownFacts(actionData.memory_updates);
        if (actionData && actionData.action) executeAssistantAction(actionData.action);
        dbg("AI provider:", "local_action", "ok:", true);
        await playTutorTTS(actionSpeakText);
        return;
      }

      await ensurePuterReady(false);
      const model = getPIModel();
      const recent = convoHistory.slice(-10).map(function (m) {
        return { role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "") };
      });
      const chatMessages = [
        { role: "system", content: buildTutorSystemPrompt(mode, language, subject, knownFacts) + "\nConversation mode: " + mode },
      ].concat(recent).concat([{ role: "user", content: t }]);

      const puterResp = await window.puter.ai.chat(chatMessages, { model: model });
      const answer = extractPuterText(puterResp) || "I did not get that. Please try again.";
      const speakText = buildSpeakText(answer);
      addLog("assistant", "Tutor: " + answer);
      pushHistory("assistant", answer);
      dbg("AI provider:", "puter", "ok:", true, "model:", model);
      await playTutorTTS(speakText);
    } catch (e) {
      dbg("puter ask failed, fallback to backend", e && e.message);
      try {
        const data = await fetchJson("/personal-intelligence/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: t,
            email: EMAIL,
            language: localStorage.getItem("g9_language") || "English",
            subject: localStorage.getItem("g9_subject") || "General",
            title: "Personal Intelligence",
            history: convoHistory.slice(-12),
            known_facts: knownFacts,
            mode: detectSupportMode(t),
            system_prompt: buildTutorSystemPrompt(detectSupportMode(t), localStorage.getItem("g9_language") || "English", localStorage.getItem("g9_subject") || "General", knownFacts),
          }),
        });
        const answer = data && data.answer ? String(data.answer) : "I did not get that. Please try again.";
        const speakText = buildSpeakText(answer);
        addLog("assistant", "Tutor: " + answer);
        pushHistory("assistant", answer);
        if (data && data.learned_facts) mergeKnownFacts(data.learned_facts);
        if (data && data.memory_updates) mergeKnownFacts(data.memory_updates);
        if (data && data.action) executeAssistantAction(data.action);
        await playTutorTTS(speakText);
      } catch (e2) {
        addLog("assistant", "Tutor: Request failed. Please try again.");
        setAssistantState("idle", "Idle");
      }
    }
  }

  async function startServerListening() {
    if (!enabled) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === "undefined") {
      addLog("assistant", "Tutor: Voice recognition is not supported in this environment.");
      setAssistantState("idle", "Idle");
      return;
    }
    if (sttRecorder && sttRecorder.state !== "inactive") return;

    try {
      sttStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const preferredMime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : (MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "");
      sttRecorder = preferredMime ? new MediaRecorder(sttStream, { mimeType: preferredMime }) : new MediaRecorder(sttStream);
      const chunks = [];

      sttRecorder.onstart = function () {
        setAssistantState("listening", "Listening");
        armIdleTimer();
      };
      sttRecorder.ondataavailable = function (ev) {
        if (ev && ev.data && ev.data.size) chunks.push(ev.data);
      };
      sttRecorder.onerror = function (ev) {
        dbg("server recorder error", ev && ev.error);
        stopServerRecorder();
        setAssistantState("idle", "Idle");
      };
      sttRecorder.onstop = async function () {
        try {
          const recMime = sttRecorder && sttRecorder.mimeType ? sttRecorder.mimeType : "audio/webm";
          const blob = new Blob(chunks, { type: recMime });
          stopServerRecorder();
          if (!blob || blob.size < 128) {
            setAssistantState("idle", "Idle");
            return;
          }
          setAssistantState("thinking", "Thinking");
          const text = await transcribeAudioBlob(blob);
          if (text) {
            await askTutorText(text);
          } else {
            setAssistantState("idle", "Idle");
          }
        } catch (e) {
          dbg("server STT failed", e && e.message);
          addLog("assistant", "Tutor: Voice server not responding (STT).");
          setAssistantState("idle", "Idle");
        }
      };

      sttRecorder.start();
      sttStopTimer = setTimeout(function () {
        try {
          if (sttRecorder && sttRecorder.state !== "inactive") sttRecorder.stop();
        } catch (e) {}
      }, STT_RECORD_MS);
    } catch (e) {
      dbg("server listening getUserMedia failed", e && e.message);
      addLog("assistant", "Tutor: Microphone access is blocked.");
      stopServerRecorder();
      setAssistantState("idle", "Idle");
    }
  }

  function startListening() {
    if (!enabled) return;
    const isElectron = /Electron/i.test(String(navigator.userAgent || ""));
    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Rec || isElectron) {
      startServerListening();
      return;
    }
    if (!recognition) {
      recognition = new Rec();
      recognition.lang = "en-US";
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.onstart = function () {
        setAssistantState("listening", "Listening");
        armIdleTimer();
      };
      recognition.onresult = function (ev) {
        const text = ev && ev.results && ev.results[0] && ev.results[0][0] ? ev.results[0][0].transcript : "";
        if (text) askTutorText(String(text));
      };
      recognition.onerror = function (ev) {
        dbg("recognition error", ev && ev.error);
        const err = String((ev && ev.error) || "");
        if (err === "not-allowed" || err === "service-not-allowed" || err === "audio-capture" || err === "network") {
          startServerListening();
          return;
        }
        setAssistantState("idle", "Idle");
      };
      recognition.onend = function () {
        // Keep idle timer active; user can tap orb to re-listen.
        armIdleTimer();
      };
    }
    try {
      recognition.start();
    } catch (e) {}
  }

  function shouldConfirmAction(action) {
    return !!(action && (action.requires_confirmation || action.requires_connection));
  }

  async function executeAssistantAction(action) {
    if (!action || !action.type) return;
    const confirmText = "Tutor wants to run: " + action.type.replace(/_/g, " ") + ". Continue?";
    if (shouldConfirmAction(action)) {
      const ok = window.confirm(confirmText);
      if (!ok) {
        addLog("assistant", "Tutor: Action cancelled.");
        return;
      }
    }

    try {
      if (window.DesktopAssistant && window.DesktopAssistant.executeAction) {
        const desktopResult = await window.DesktopAssistant.executeAction(action);
        if (desktopResult && desktopResult.ok) return;
        if (desktopResult && desktopResult.denied) {
          addLog("assistant", "Tutor: Creator denied desktop action.");
          return;
        }
      }
    } catch (e) {}

    if (action.type === "directions_home" && action.maps_url) {
      window.open(String(action.maps_url), "_blank", "noopener,noreferrer");
      return;
    }

    if (action.type === "connect_spotify") {
      const url = action.oauth_url || "https://open.spotify.com/";
      window.open(String(url), "_blank", "noopener,noreferrer");
      mergeKnownFacts({ spotify_connected: true });
      addLog("assistant", "Tutor: Spotify connection initiated.");
      return;
    }

    if (action.type === "play_spotify_liked") {
      const url = action.spotify_url || "https://open.spotify.com/collection/tracks";
      window.open(String(url), "_blank", "noopener,noreferrer");
      return;
    }

    if (action.type === "open_file_explorer") {
      try {
        if (hiddenFileInput) {
          hiddenFileInput.click();
          addLog("assistant", "Tutor: File picker opened.");
          return;
        }
      } catch (e) {}
      addLog("assistant", "Tutor: Could not open file picker in this browser.");
      return;
    }
  }

  tabBtn.addEventListener("click", function () {
    setEnabled(!enabled);
    if (enabled) {
      startListening();
    }
  });

  closeBtn.addEventListener("click", function () {
    setEnabled(false);
  });

  orbBtn.addEventListener("click", function () {
    startListening();
  });

  // Runtime controls so model/tts can be changed later without code edits.
  window.PersonalIntelligenceConfig = {
    getModel: function () { return getPIModel(); },
    setModel: function (model) { return setPIModel(model); },
    getVoiceId: function () { return getSelectedVoiceId(); },
    setVoiceId: function (voiceId) { return setSelectedVoiceId(voiceId); },
  };

  loadMemory();
  initPISettingsSelectors().catch(function (e) { dbg("init PI settings selectors failed", e && e.message); });
  setEnabled(false);
  try {
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  } catch (e) {}
})();
