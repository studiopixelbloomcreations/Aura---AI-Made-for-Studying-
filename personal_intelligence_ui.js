(function () {
  const tabBtn = document.getElementById("personalIntelligenceTab");
  if (!tabBtn) return;

  const EMAIL = "guest@student.com";
  const IDLE_TIMEOUT_MS = 15000;
  const TTS_TIMEOUT_MS = 12000;
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

  const panel = document.createElement("div");
  panel.className = "pi-panel";
  panel.innerHTML = `
    <div class="pi-header">
      <div class="pi-title-wrap">
        <div class="pi-section">Personal Intelligence</div>
        <div class="pi-name">Tutor</div>
      </div>
      <button class="pi-close" type="button" aria-label="Close assistant">x</button>
    </div>
    <div class="pi-orb-wrap">
      <button class="pi-orb idle" type="button" aria-label="Activate Tutor">
        <canvas class="pi-orb-canvas" aria-hidden="true"></canvas>
        <span class="pi-orb-glow"></span>
      </button>
      <div class="pi-state">Idle</div>
    </div>
    <div class="pi-log" aria-live="polite"></div>
    <input class="pi-hidden-file-input" type="file" multiple style="display:none" />
  `;
  document.body.appendChild(panel);

  const closeBtn = panel.querySelector(".pi-close");
  const orbBtn = panel.querySelector(".pi-orb");
  const orbCanvas = panel.querySelector(".pi-orb-canvas");
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
    if (!orbCanvas) return;
    const rect = orbCanvas.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    vizW = Math.max(64, Math.floor(rect.width));
    vizH = Math.max(64, Math.floor(rect.height));
    orbCanvas.width = Math.floor(vizW * dpr);
    orbCanvas.height = Math.floor(vizH * dpr);
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
    const cy = h / 2;

    vizCtx.clearRect(0, 0, w, h);

    const ringR = 64 + vizEnergy * 18;
    const ringGrad = vizCtx.createRadialGradient(cx, cy, 10, cx, cy, ringR + 24);
    ringGrad.addColorStop(0, "rgba(255,198,113,0.45)");
    ringGrad.addColorStop(0.45, "rgba(255,145,74,0.28)");
    ringGrad.addColorStop(1, "rgba(255,100,38,0.02)");
    vizCtx.fillStyle = ringGrad;
    vizCtx.beginPath();
    vizCtx.arc(cx, cy, ringR + 24, 0, Math.PI * 2);
    vizCtx.fill();

    vizCtx.strokeStyle = "rgba(255,168,92,0.36)";
    vizCtx.lineWidth = 1.2 + vizEnergy * 0.9;
    vizCtx.beginPath();
    vizCtx.arc(cx, cy, ringR, vizRotation, vizRotation + Math.PI * 1.65);
    vizCtx.stroke();

    const t = performance.now() * 0.001;
    for (let i = 0; i < vizParticles.length; i += 1) {
      const p = vizParticles[i];
      p.angle += p.speed * (1 + vizEnergy * 1.6);
      const wave = Math.sin(t * 3.1 + p.seed) * (3 + vizEnergy * 12);
      const r = p.radius + wave;
      const a = p.angle + vizRotation + (assistantState === "speaking" ? Math.sin(t * 4 + p.seed) * 0.03 : 0);
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      const alpha = Math.min(1, p.alpha * (0.72 + vizEnergy * 0.9));
      vizCtx.fillStyle = `rgba(255,176,96,${alpha.toFixed(3)})`;
      vizCtx.beginPath();
      vizCtx.arc(x, y, p.size + vizEnergy * 1.2, 0, Math.PI * 2);
      vizCtx.fill();
    }

    vizRaf = window.requestAnimationFrame(drawOrb);
  }

  function startOrbVisualization() {
    if (!orbCanvas) return;
    if (!vizCtx) {
      vizCanvas = orbCanvas;
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
      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timerId = controller ? setTimeout(function () { controller.abort(); }, TTS_TIMEOUT_MS) : null;
      const res = await (window.Api && window.Api.apiFetch
        ? window.Api.apiFetch("/personal-intelligence/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
            signal: controller ? controller.signal : undefined,
          })
        : fetch("/personal-intelligence/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
            signal: controller ? controller.signal : undefined,
          }));
      if (timerId) clearTimeout(timerId);

      if (!res.ok) {
        let detail = "Gemini TTS request failed";
        try {
          const err = await res.json();
          if (err && (err.error || err.detail)) detail = String(err.error || err.detail);
        } catch (e) {}
        throw new Error(detail);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      tutorAudio = new Audio(url);
      tutorAudio.preload = "auto";
      stopSpeakerAnalyser();
      connectSpeakerAnalyserForAudioElement(tutorAudio);
      tutorAudio.onplay = function () {
        setAssistantState("speaking", "Speaking");
      };
      tutorAudio.onended = function () {
        setAssistantState("listening", "Listening");
        armIdleTimer();
        try { URL.revokeObjectURL(url); } catch (e) {}
      };
      await tutorAudio.play();
    } catch (e) {
      dbg("Gemini TTS failed, fallback to browser TTS", e && e.message);
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
    setAssistantState("thinking", "Thinking");
    armIdleTimer();
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
        }),
      });
      const answer = data && data.answer ? String(data.answer) : "I did not get that. Please try again.";
      const speakText = data && data.speak_text ? String(data.speak_text) : buildSpeakText(answer);
      addLog("assistant", "Tutor: " + answer);
      pushHistory("assistant", answer);
      if (data && data.learned_facts) mergeKnownFacts(data.learned_facts);
      if (data && data.memory_updates) mergeKnownFacts(data.memory_updates);
      if (data && data.action) {
        executeAssistantAction(data.action);
      }
      if (data && data.ai_provider && data.ai_provider !== "local_action") {
        dbg("AI provider:", data.ai_provider, "ok:", data.ai_ok, "error:", data.ai_error || "");
      }
      await playTutorTTS(speakText);
    } catch (e) {
      addLog("assistant", "Tutor: Request failed. Please try again.");
      setAssistantState("idle", "Idle");
    }
  }

  function startListening() {
    if (!enabled) return;
    if (!recognition) {
      const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!Rec) {
        addLog("assistant", "Tutor: Voice recognition is not supported in this browser.");
        return;
      }
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

  function executeAssistantAction(action) {
    if (!action || !action.type) return;
    const confirmText = "Tutor wants to run: " + action.type.replace(/_/g, " ") + ". Continue?";
    if (shouldConfirmAction(action)) {
      const ok = window.confirm(confirmText);
      if (!ok) {
        addLog("assistant", "Tutor: Action cancelled.");
        return;
      }
    }

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
    if (enabled) startListening();
  });

  closeBtn.addEventListener("click", function () {
    setEnabled(false);
  });

  orbBtn.addEventListener("click", function () {
    startListening();
  });

  loadMemory();
  setEnabled(false);
  try {
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  } catch (e) {}
})();
