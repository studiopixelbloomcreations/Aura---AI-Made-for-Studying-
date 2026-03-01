(function () {
  const tabBtn = document.getElementById("personalIntelligenceTab");
  if (!tabBtn) return;

  const STORAGE_KEY = "g9_personal_intelligence_enabled";
  const EMAIL = "guest@student.com";
  const IDLE_TIMEOUT_MS = 15000;

  // Start closed by default on every page load.
  let enabled = false;
  let realtimeConnected = false;
  let realtimePc = null;
  let realtimeDc = null;
  let realtimeStream = null;
  let realtimeAudio = null;
  let realtimeFailures = 0;
  let fallbackVoiceMode = false;
  let localRecognition = null;
  let idleTimer = null;

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

  const orbBtn = panel.querySelector(".pi-orb");
  const closeBtn = panel.querySelector(".pi-close");
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

  async function askTutorFallback(text) {
    const t = String(text || "").trim();
    if (!t) return;
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
      const answer = data && data.answer ? String(data.answer) : "I am here. Tell me again.";
      addLog("assistant", "Tutor: " + answer);
      try {
        const u = new SpeechSynthesisUtterance(answer);
        u.rate = 1.0;
        u.pitch = 1.0;
        u.onstart = function () { setAssistantState("speaking", "Speaking"); };
        u.onend = function () { setAssistantState("listening", "Listening"); armIdleTimer(); };
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
      } catch (e) {
        setAssistantState("listening", "Listening");
      }
    } catch (e) {
      addLog("assistant", "Tutor: I could not answer just now. Try again.");
      setAssistantState("idle", "Idle");
    }
  }

  function initLocalRecognition() {
    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Rec) return null;
    const r = new Rec();
    r.lang = "en-US";
    r.continuous = false;
    r.interimResults = false;
    r.onstart = function () {
      setAssistantState("listening", "Listening");
      armIdleTimer();
      dbg("local recognition start");
    };
    r.onresult = function (ev) {
      const txt = ev && ev.results && ev.results[0] && ev.results[0][0] ? ev.results[0][0].transcript : "";
      if (txt) askTutorFallback(String(txt));
    };
    r.onerror = function (ev) {
      dbg("local recognition error", ev && ev.error);
      setAssistantState("idle", "Idle");
    };
    r.onend = function () {
      // Stay active-looking; user can tap orb again.
      if (enabled) armIdleTimer();
    };
    return r;
  }

  function startFallbackListening() {
    if (!localRecognition) localRecognition = initLocalRecognition();
    if (!localRecognition) {
      addLog("assistant", "Tutor: Voice recognition not supported in this browser.");
      setAssistantState("idle", "Idle");
      return;
    }
    try {
      localRecognition.start();
    } catch (e) {}
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

  async function fetchJson(path, options) {
    const res = await (window.Api && window.Api.apiFetch ? window.Api.apiFetch(path, options) : fetch(path, options));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data && (data.detail || data.error)) || "Request failed");
    return data;
  }

  function disconnectRealtimeVoice() {
    clearIdleTimer();
    try { if (realtimeDc) realtimeDc.close(); } catch (e) {}
    try { if (realtimePc) realtimePc.close(); } catch (e) {}
    try {
      if (realtimeStream) {
        realtimeStream.getTracks().forEach(function (t) { t.stop(); });
      }
    } catch (e) {}
    try {
      if (realtimeAudio) {
        realtimeAudio.pause();
        realtimeAudio.srcObject = null;
      }
    } catch (e) {}
    realtimeConnected = false;
    realtimeDc = null;
    realtimePc = null;
    realtimeStream = null;
    realtimeAudio = null;
    realtimeFailures = 0;
    setAssistantState("idle", "Idle");
    dbg("realtime disconnected");
  }

  function setEnabled(next) {
    enabled = !!next;
    localStorage.setItem(STORAGE_KEY, enabled ? "true" : "false");
    tabBtn.classList.toggle("active", enabled);
    tabBtn.setAttribute("aria-pressed", enabled ? "true" : "false");
    panel.classList.toggle("show", enabled);
    if (!enabled) disconnectRealtimeVoice();
    dbg("enabled:", enabled);
  }

  function activateListening() {
    if (!enabled) return;
    if (fallbackVoiceMode) {
      startFallbackListening();
      return;
    }
    if (!realtimeConnected) {
      connectRealtimeVoice();
      return;
    }
    setAssistantState("listening", "Listening");
    armIdleTimer();
    addLog("assistant", "Tutor: Listening...");
    dbg("manual activate listening");
  }

  async function connectRealtimeVoice() {
    if (!enabled || realtimeConnected) return;
    if (fallbackVoiceMode) {
      startFallbackListening();
      return;
    }
    setAssistantState("thinking", "Connecting...");
    addLog("assistant", "Tutor: Connecting ChatGPT voice...");

    let session;
    try {
      session = await fetchJson("/personal-intelligence/realtime/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: EMAIL }),
      });
    } catch (e) {
      setAssistantState("idle", "Idle");
      addLog("assistant", "Tutor: Could not create realtime session.");
      dbg("session create failed", e);
      return;
    }

    if (!session || !session.ok || !session.client_secret || !session.client_secret.value) {
      setAssistantState("idle", "Idle");
      addLog("assistant", "Tutor: " + (session && session.error ? String(session.error) : "Realtime session unavailable."));
      dbg("session invalid", session);
      return;
    }

    const ephemeralKey = session.client_secret.value;
    const model = session.model || "gpt-realtime";
    const realtimeUrl = "https://api.openai.com/v1/realtime?model=" + encodeURIComponent(model);

    try {
      realtimePc = new RTCPeerConnection();
      realtimeAudio = document.createElement("audio");
      realtimeAudio.autoplay = true;
      realtimeAudio.style.display = "none";
      document.body.appendChild(realtimeAudio);

      realtimePc.ontrack = function (ev) {
        try {
          realtimeAudio.srcObject = ev.streams[0];
          realtimeAudio.play().catch(function(){});
          setAssistantState("speaking", "Speaking");
          armIdleTimer();
          dbg("ontrack received");
        } catch (e) {}
      };

      realtimeStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      realtimeStream.getTracks().forEach(function (track) {
        realtimePc.addTrack(track, realtimeStream);
      });

      realtimeDc = realtimePc.createDataChannel("oai-events");
      realtimeDc.onopen = function () {
        realtimeConnected = true;
        realtimeFailures = 0;
        setAssistantState("listening", "Listening");
        addLog("assistant", "Tutor: Connected. Speak now.");
        armIdleTimer();
        dbg("datachannel open");
        try {
          realtimeDc.send(
            JSON.stringify({
              type: "session.update",
              session: {
                instructions:
                  "You are Tutor, a warm personal assistant. Keep responses natural and concise.",
                turn_detection: {
                  type: "server_vad",
                  threshold: 0.5,
                  prefix_padding_ms: 300,
                  silence_duration_ms: 200,
                  create_response: true,
                  interrupt_response: true
                }
              },
            })
          );
          dbg("session.update sent");
        } catch (e) {}
      };

      realtimeDc.onmessage = function (ev) {
        try {
          const event = JSON.parse(ev.data);
          if (!event || !event.type) return;
          dbg("event", event.type);
          if (event.type === "input_audio_buffer.speech_started") {
            setAssistantState("listening", "Listening");
            armIdleTimer();
          } else if (event.type === "input_audio_buffer.speech_stopped") {
            setAssistantState("thinking", "Thinking");
            armIdleTimer();
          } else if (event.type === "input_audio_buffer.committed") {
            setAssistantState("thinking", "Thinking");
            armIdleTimer();
          } else if (event.type === "response.audio_transcript.done") {
            if (event.transcript) addLog("assistant", "Tutor: " + event.transcript);
            setAssistantState("speaking", "Speaking");
            armIdleTimer();
            realtimeFailures = 0;
          } else if (event.type === "response.output_text.done") {
            if (event.text) {
              addLog("assistant", "Tutor: " + event.text);
              try {
                const u = new SpeechSynthesisUtterance(String(event.text));
                window.speechSynthesis.cancel();
                window.speechSynthesis.speak(u);
              } catch (e) {}
            }
            realtimeFailures = 0;
          } else if (event.type === "conversation.item.input_audio_transcription.completed") {
            if (event.transcript) addLog("user", "You: " + event.transcript);
            armIdleTimer();
          } else if (event.type === "conversation.item.input_audio_transcription.failed") {
            // Non-fatal: audio response can still continue without transcription text.
            dbg("transcription failed (non-fatal)");
          } else if (event.type === "response.done") {
            setAssistantState("listening", "Listening");
            armIdleTimer();
            const status = event && event.response && event.response.status ? String(event.response.status) : "";
            const outputs = event && event.response && Array.isArray(event.response.output) ? event.response.output : [];
            const hasTextLike = outputs.some(function (o) {
              return o && o.type && String(o.type).toLowerCase().includes("text");
            });
            if (status && status !== "completed" && status !== "incomplete") {
              realtimeFailures += 1;
            } else if (!hasTextLike) {
              realtimeFailures += 1;
            } else {
              realtimeFailures = 0;
            }
            if (realtimeFailures >= 2) {
              dbg("switching to fallback voice mode");
              addLog("assistant", "Tutor: Switching to local voice mode for reliability.");
              fallbackVoiceMode = true;
              disconnectRealtimeVoice();
              startFallbackListening();
            }
          } else if (event.type === "error") {
            const err = event.error || {};
            const code = String(err.code || "");
            const msg = String(err.message || "");
            dbg("realtime error event", code, msg, event);
            // Ignore known non-fatal transcription failures.
            if (code.toLowerCase().includes("transcription") || msg.toLowerCase().includes("transcription")) {
              return;
            }
            realtimeFailures += 1;
            if (realtimeFailures >= 2) {
              fallbackVoiceMode = true;
              addLog("assistant", "Tutor: Realtime voice is unstable. Switching to local voice mode.");
              disconnectRealtimeVoice();
              startFallbackListening();
              return;
            }
            setAssistantState("idle", "Idle");
            addLog("assistant", "Tutor: Voice error. Tap the orb to retry.");
          }
        } catch (e) {}
      };

      realtimeDc.onclose = function () {
        realtimeConnected = false;
        setAssistantState("idle", "Idle");
        dbg("datachannel closed");
      };

      const offer = await realtimePc.createOffer();
      await realtimePc.setLocalDescription(offer);
      const sdpResp = await fetch(realtimeUrl, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: "Bearer " + ephemeralKey,
          "Content-Type": "application/sdp",
        },
      });
      if (!sdpResp.ok) throw new Error("Failed realtime SDP");
      const answerSdp = await sdpResp.text();
      await realtimePc.setRemoteDescription({ type: "answer", sdp: answerSdp });
      dbg("remote description set, realtime connected");
    } catch (e) {
      addLog("assistant", "Tutor: Realtime voice connection failed.");
      dbg("connectRealtimeVoice failed", e);
      disconnectRealtimeVoice();
    }
  }

  tabBtn.addEventListener("click", function () {
    setEnabled(!enabled);
    if (enabled) {
      if (fallbackVoiceMode) startFallbackListening();
      else connectRealtimeVoice();
    }
  });

  closeBtn.addEventListener("click", function () {
    setEnabled(false);
  });

  orbBtn.addEventListener("click", function () {
    activateListening();
  });

  setEnabled(false);
  try {
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  } catch (e) {}
})();
