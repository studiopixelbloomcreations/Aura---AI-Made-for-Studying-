(function () {
  function onReady(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  }

  onReady(function () {
    const headerButton = document.getElementById("personalIntelligenceTab");
    if (!headerButton) return;

    const panel = document.createElement("section");
    panel.className = "pi-voice-panel";
    panel.hidden = true;
    panel.innerHTML = `
      <div class="pi-voice-card">
        <button class="pi-voice-close" type="button" aria-label="Close Personal Intelligence">x</button>
        <div class="pi-voice-eyebrow">Personal Intelligence</div>
        <div class="pi-voice-title">Voice System</div>
        <button class="pi-voice-orb" type="button" aria-label="Start voice interaction">
          <span class="pi-voice-orb-core"></span>
          <span class="pi-voice-orb-ring"></span>
          <span class="pi-voice-orb-glow"></span>
        </button>
        <div class="pi-voice-status" aria-live="polite">Ready</div>
        <div class="pi-voice-log" aria-live="polite"></div>
        <div class="pi-voice-controls">
          <button class="pi-voice-mic" type="button">Talk</button>
          <button class="pi-voice-text" type="button">Open Text PI</button>
        </div>
        <div class="pi-voice-input-row">
          <input class="pi-voice-input" type="text" placeholder="Or type a message here..." />
          <button class="pi-voice-send" type="button">Send</button>
        </div>
      </div>
    `;

    const style = document.createElement("style");
    style.textContent = `
      .pi-voice-panel{position:fixed;inset:0;z-index:10030;display:flex;align-items:flex-end;justify-content:flex-end;padding:22px;background:rgba(15,23,42,.2);backdrop-filter:blur(6px)}
      .pi-voice-card{width:min(420px,calc(100vw - 24px));border-radius:28px;padding:22px;background:radial-gradient(circle at top,#1e293b 0%,#0f172a 55%,#020617 100%);color:#e2e8f0;box-shadow:0 30px 90px rgba(2,6,23,.45);border:1px solid rgba(148,163,184,.18)}
      .pi-voice-close{margin-left:auto;display:block;border:0;background:rgba(148,163,184,.16);color:#e2e8f0;border-radius:999px;padding:8px 11px;cursor:pointer}
      .pi-voice-eyebrow{margin-top:4px;font:700 11px/1.1 system-ui,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#94a3b8}
      .pi-voice-title{margin-top:8px;font:700 26px/1.05 system-ui,sans-serif;color:#f8fafc}
      .pi-voice-orb{position:relative;margin:22px auto 16px;display:block;width:154px;height:154px;border:0;background:transparent;cursor:pointer}
      .pi-voice-orb-core,.pi-voice-orb-ring,.pi-voice-orb-glow{position:absolute;inset:0;border-radius:50%}
      .pi-voice-orb-core{inset:18px;background:radial-gradient(circle at 35% 30%,#f8fafc 0%,#7dd3fc 18%,#38bdf8 38%,#0284c7 62%,#0f172a 100%);box-shadow:inset 0 0 28px rgba(255,255,255,.38)}
      .pi-voice-orb-ring{border:1px solid rgba(125,211,252,.55);animation:piVoicePulse 2.4s infinite ease-in-out}
      .pi-voice-orb-glow{background:radial-gradient(circle,rgba(56,189,248,.35) 0%,rgba(14,165,233,.08) 45%,rgba(2,6,23,0) 75%);transform:scale(1.12)}
      .pi-voice-orb.is-listening .pi-voice-orb-ring{animation-duration:1.1s;border-color:rgba(251,191,36,.8)}
      .pi-voice-orb.is-speaking .pi-voice-orb-ring{animation-duration:.8s;border-color:rgba(74,222,128,.8)}
      .pi-voice-status{font:600 14px/1.2 system-ui,sans-serif;text-align:center;color:#cbd5e1}
      .pi-voice-log{margin-top:14px;min-height:96px;max-height:180px;overflow:auto;padding:14px;border-radius:18px;background:rgba(15,23,42,.52);font:500 14px/1.45 system-ui,sans-serif}
      .pi-voice-row{margin:0 0 10px}
      .pi-voice-row strong{color:#f8fafc}
      .pi-voice-controls{display:flex;gap:10px;margin-top:14px}
      .pi-voice-controls button,.pi-voice-send{border:0;border-radius:14px;padding:12px 14px;background:#e2e8f0;color:#0f172a;font:700 13px/1.1 system-ui,sans-serif;cursor:pointer}
      .pi-voice-mic{flex:1;background:linear-gradient(135deg,#f8fafc 0%,#7dd3fc 100%)}
      .pi-voice-text{flex:1;background:rgba(148,163,184,.2);color:#f8fafc}
      .pi-voice-input-row{display:flex;gap:10px;margin-top:12px}
      .pi-voice-input{flex:1;border:1px solid rgba(148,163,184,.22);border-radius:14px;padding:12px 14px;background:rgba(15,23,42,.56);color:#f8fafc;font:500 14px/1.2 system-ui,sans-serif}
      @keyframes piVoicePulse{0%,100%{transform:scale(.96);opacity:.55}50%{transform:scale(1.06);opacity:1}}
    `;

    document.head.appendChild(style);
    document.body.appendChild(panel);

    const closeBtn = panel.querySelector(".pi-voice-close");
    const orbBtn = panel.querySelector(".pi-voice-orb");
    const micBtn = panel.querySelector(".pi-voice-mic");
    const textBtn = panel.querySelector(".pi-voice-text");
    const sendBtn = panel.querySelector(".pi-voice-send");
    const input = panel.querySelector(".pi-voice-input");
    const log = panel.querySelector(".pi-voice-log");
    const status = panel.querySelector(".pi-voice-status");

    function setOpen(open) {
      panel.hidden = !open;
      headerButton.classList.toggle("active", !!open);
      headerButton.setAttribute("aria-pressed", open ? "true" : "false");
      if (open && input) input.focus();
    }

    function setStatus(text, mode) {
      status.textContent = String(text || "Ready");
      orbBtn.classList.remove("is-listening", "is-speaking");
      if (mode) orbBtn.classList.add(mode);
    }

    function addLog(role, text) {
      const row = document.createElement("div");
      row.className = "pi-voice-row";
      row.innerHTML = `<strong>${role}:</strong> ${String(text || "").replace(/[<>&]/g, function (ch) { return ch === "<" ? "&lt;" : (ch === ">" ? "&gt;" : "&amp;"); })}`;
      log.appendChild(row);
      log.scrollTop = log.scrollHeight;
    }

    async function askPI(message) {
      const runtime = window.PersonalIntelligenceRuntime;
      if (!runtime || typeof runtime.request !== "function") {
        addLog("System", "Personal Intelligence runtime is not ready yet.");
        return;
      }
      const text = String(message || "").trim();
      if (!text) return;
      addLog("You", text);
      setStatus("Thinking...", "is-speaking");
      try {
        const result = await runtime.request(text, []);
        const answer = result && result.answer ? String(result.answer) : "I could not generate a response.";
        addLog("Aura AI", answer);
        setStatus("Speaking", "is-speaking");
        if (typeof runtime.speakText === "function") runtime.speakText(answer);
        window.setTimeout(function () {
          setStatus("Ready");
        }, 900);
      } catch (error) {
        addLog("System", String((error && error.message) || error || "Request failed"));
        setStatus("Ready");
      }
    }

    function startVoiceCapture() {
      const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!Rec) {
        setStatus("Voice unavailable in this browser");
        addLog("System", "Speech recognition is not available. You can still type in the panel.");
        return;
      }
      const recognition = new Rec();
      recognition.lang = "en-US";
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.onstart = function () {
        setStatus("Listening...", "is-listening");
      };
      recognition.onresult = function (event) {
        const heard = event && event.results && event.results[0] && event.results[0][0]
          ? String(event.results[0][0].transcript || "").trim()
          : "";
        if (heard) askPI(heard);
      };
      recognition.onerror = function (event) {
        setStatus("Ready");
        addLog("System", "Voice input failed: " + String((event && event.error) || "unknown"));
      };
      recognition.onend = function () {
        if (status.textContent === "Listening...") setStatus("Ready");
      };
      recognition.start();
    }

    window.addEventListener("pi:open-voice-panel", function () {
      setOpen(true);
      setStatus("Ready");
    });

    closeBtn.addEventListener("click", function () { setOpen(false); });
    panel.addEventListener("click", function (event) {
      if (event.target === panel) setOpen(false);
    });
    orbBtn.addEventListener("click", startVoiceCapture);
    micBtn.addEventListener("click", startVoiceCapture);
    textBtn.addEventListener("click", function () {
      setOpen(false);
      if (window.PersonalIntelligenceRuntime && typeof window.PersonalIntelligenceRuntime.openTextMode === "function") {
        window.PersonalIntelligenceRuntime.openTextMode();
      }
    });
    sendBtn.addEventListener("click", function () {
      const text = String(input.value || "").trim();
      if (!text) return;
      input.value = "";
      askPI(text);
    });
    input.addEventListener("keydown", function (event) {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendBtn.click();
      }
    });
  });
})();
