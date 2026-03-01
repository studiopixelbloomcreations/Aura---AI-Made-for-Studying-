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
          } else if (event.type === "conversation.item.input_audio_transcription.completed") {
            if (event.transcript) addLog("user", "You: " + event.transcript);
            armIdleTimer();
          } else if (event.type === "conversation.item.input_audio_transcription.failed") {
            // Non-fatal: audio response can still continue without transcription text.
            dbg("transcription failed (non-fatal)");
          } else if (event.type === "response.done") {
            setAssistantState("listening", "Listening");
            armIdleTimer();
          } else if (event.type === "error") {
            const err = event.error || {};
            const code = String(err.code || "");
            const msg = String(err.message || "");
            dbg("realtime error event", code, msg, event);
            // Ignore known non-fatal transcription failures.
            if (code.toLowerCase().includes("transcription") || msg.toLowerCase().includes("transcription")) {
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
    if (enabled) connectRealtimeVoice();
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
