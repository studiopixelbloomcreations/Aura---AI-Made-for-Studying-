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
  let recognitionRunning = false;
  let keepListening = false;
  let userSpeaking = false;
  let idleTimer = null;
  let tutorAudio = null;
  let knownFacts = {};
  let convoHistory = [];

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
        <span class="pi-orb-core"></span>
      </button>
      <div class="pi-state">Idle</div>
    </div>
    <div class="pi-log" aria-live="polite"></div>
  `;
  document.body.appendChild(panel);

  const closeBtn = panel.querySelector(".pi-close");
  const orbBtn = panel.querySelector(".pi-orb");
  const stateEl = panel.querySelector(".pi-state");
  const logEl = panel.querySelector(".pi-log");

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
      keepListening = false;
      try {
        if (recognition && recognitionRunning) recognition.stop();
      } catch (e) {}
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

  function setEnabled(next) {
    enabled = !!next;
    panel.classList.toggle("show", enabled);
    tabBtn.classList.toggle("active", enabled);
    tabBtn.setAttribute("aria-pressed", enabled ? "true" : "false");
    if (!enabled) {
      keepListening = false;
      clearIdleTimer();
      stopTutorAudio();
      try {
        if (recognition) recognition.abort();
      } catch (e) {}
      setAssistantState("idle", "Idle");
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
      tutorAudio.onplay = function () {
        setAssistantState("speaking", "Speaking");
      };
      tutorAudio.onended = function () {
        setAssistantState("listening", "Listening");
        armIdleTimer();
        try { URL.revokeObjectURL(url); } catch (e) {}
        if (enabled) startListening(true);
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
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.onstart = function () {
        recognitionRunning = true;
        setAssistantState("listening", "Listening");
        armIdleTimer();
      };
      recognition.onresult = function (ev) {
        userSpeaking = false;
        armIdleTimer();
        const text = ev && ev.results && ev.results[0] && ev.results[0][0] ? ev.results[0][0].transcript : "";
        if (text) askTutorText(String(text));
      };
      recognition.onerror = function (ev) {
        dbg("recognition error", ev && ev.error);
        recognitionRunning = false;
        userSpeaking = false;
        if (enabled && keepListening) {
          setTimeout(function () { startListening(true); }, 250);
          return;
        }
        setAssistantState("idle", "Idle");
      };
      recognition.onspeechstart = function () {
        userSpeaking = true;
        armIdleTimer();
      };
      recognition.onspeechend = function () {
        userSpeaking = false;
        armIdleTimer();
      };
      recognition.onend = function () {
        recognitionRunning = false;
        if (enabled && keepListening) {
          setTimeout(function () { startListening(true); }, 120);
        } else {
          armIdleTimer();
        }
      };
    }
    try {
      keepListening = true;
      if (recognitionRunning) return;
      recognition.start();
    } catch (e) {}
  }

  tabBtn.addEventListener("click", function () {
    setEnabled(!enabled);
    if (enabled) startListening();
  });

  closeBtn.addEventListener("click", function () {
    setEnabled(false);
  });

  orbBtn.addEventListener("click", function () {
    startListening(true);
  });

  loadMemory();
  setEnabled(false);
  try {
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  } catch (e) {}
})();
