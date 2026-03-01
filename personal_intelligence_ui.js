(function () {
  const tabBtn = document.getElementById("personalIntelligenceTab");
  if (!tabBtn) return;

  const STORAGE_KEY = "g9_personal_intelligence_enabled";
  const EMAIL = "guest@student.com";
  const IDLE_TIMEOUT_MS = 15000;

  let enabled = localStorage.getItem(STORAGE_KEY) === "true";
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
  const stateEl = panel.querySelector(".pi-state");
  const logEl = panel.querySelector(".pi-log");

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
  }

  function setEnabled(next) {
    enabled = !!next;
    localStorage.setItem(STORAGE_KEY, enabled ? "true" : "false");
    tabBtn.classList.toggle("active", enabled);
    tabBtn.setAttribute("aria-pressed", enabled ? "true" : "false");
    panel.classList.toggle("show", enabled);
    if (!enabled) disconnectRealtimeVoice();
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
      return;
    }

    if (!session || !session.ok || !session.client_secret || !session.client_secret.value) {
      setAssistantState("idle", "Idle");
      addLog("assistant", "Tutor: " + (session && session.error ? String(session.error) : "Realtime session unavailable."));
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
          setAssistantState("speaking", "Speaking");
          armIdleTimer();
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
                },
              },
            })
          );
        } catch (e) {}
      };

      realtimeDc.onmessage = function (ev) {
        try {
          const event = JSON.parse(ev.data);
          if (!event || !event.type) return;
          if (event.type === "input_audio_buffer.speech_started") {
            setAssistantState("listening", "Listening");
            armIdleTimer();
          } else if (event.type === "input_audio_buffer.speech_stopped") {
            setAssistantState("thinking", "Thinking");
            armIdleTimer();
            try {
              realtimeDc.send(JSON.stringify({ type: "response.create" }));
            } catch (e) {}
          } else if (event.type === "response.audio_transcript.done") {
            if (event.transcript) addLog("assistant", "Tutor: " + event.transcript);
            setAssistantState("speaking", "Speaking");
            armIdleTimer();
          } else if (event.type === "conversation.item.input_audio_transcription.completed") {
            if (event.transcript) addLog("user", "You: " + event.transcript);
            armIdleTimer();
          } else if (event.type === "response.done") {
            setAssistantState("listening", "Listening");
            armIdleTimer();
          }
        } catch (e) {}
      };

      realtimeDc.onclose = function () {
        realtimeConnected = false;
        setAssistantState("idle", "Idle");
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
    } catch (e) {
      addLog("assistant", "Tutor: Realtime voice connection failed.");
      disconnectRealtimeVoice();
    }
  }

  tabBtn.addEventListener("click", function () {
    setEnabled(!enabled);
    if (enabled) connectRealtimeVoice();
  });

  orbBtn.addEventListener("click", function () {
    activateListening();
  });

  setEnabled(enabled);
  if (enabled) connectRealtimeVoice();
  try {
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  } catch (e) {}
})();
