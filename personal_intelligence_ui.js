(function () {
  const tabBtn = document.getElementById("personalIntelligenceTab");
  if (!tabBtn) return;

  const EMAIL = "guest@student.com";
  const IDLE_TIMEOUT_MS = 15000;
  let enabled = false;
  let recognition = null;
  let idleTimer = null;
  let tutorAudio = null;

  const panel = document.createElement("div");
  panel.className = "pi-panel";
  panel.innerHTML = `
    <div class="pi-header">
      <div class="pi-title-wrap">
        <div class="pi-section">Perosnla IIntelligence</div>
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
      args.unshift("[PerosnlaIIntelligence]");
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

  async function playTutorTTS(text) {
    stopTutorAudio();
    try {
      const res = await (window.Api && window.Api.apiFetch
        ? window.Api.apiFetch("/personal-intelligence/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
          })
        : fetch("/personal-intelligence/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
          }));

      if (!res.ok) throw new Error("Speechify TTS request failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      tutorAudio = new Audio(url);
      tutorAudio.onplay = function () {
        setAssistantState("speaking", "Speaking");
      };
      tutorAudio.onended = function () {
        setAssistantState("listening", "Listening");
        armIdleTimer();
      };
      await tutorAudio.play();
    } catch (e) {
      dbg("Speechify failed, fallback to browser TTS", e && e.message);
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
          title: "Perosnla IIntelligence",
        }),
      });
      const answer = data && data.answer ? String(data.answer) : "I did not get that. Please try again.";
      addLog("assistant", "Tutor: " + answer);
      await playTutorTTS(answer);
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

  setEnabled(false);
  try {
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  } catch (e) {}
})();
