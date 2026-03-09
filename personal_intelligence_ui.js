(function () {
  const tabBtn = document.getElementById("personalIntelligenceTab");
  if (!tabBtn) return;

  const EMAIL = "guest@student.com";
  const IDLE_TIMEOUT_MS = 15000;
  const TTS_TIMEOUT_MS = 12000;
  const STT_TIMEOUT_MS = 22000;
  const STT_RECORD_MS = 8000;
  const PI_BATCH_WAIT_MS = 10000;
  const PI_BATCH_MAX_MESSAGES = 10;
  const WAKE_WORD_RE = /\b(hey\s+tutor|tutor)\b/i;
  const PI_MODEL_KEY = "pi_model";
  const PI_MODEL_DEFAULT = "gemini-3-pro-preview";
  const PI_TTS_VOICE_KEY = (window.PuterVoiceCatalog && window.PuterVoiceCatalog.storageKey) ? String(window.PuterVoiceCatalog.storageKey) : "g9_tts_voice";
  const PI_TTS_VOICE_DEFAULT = (window.PuterVoiceCatalog && window.PuterVoiceCatalog.defaultId) ? String(window.PuterVoiceCatalog.defaultId) : "openai:alloy";
  const PI_MODEL_OPTIONS_FALLBACK = [
    { id: "openai/gpt-5.2-chat", label: "openai/gpt-5.2-chat" },
    { id: "google/gemini-2.5-flash", label: "google/gemini-2.5-flash" },
    { id: "anthropic/claude-opus-4-6", label: "anthropic/claude-opus-4-6" },
  ];
  const MEMORY_KEY = "personal_intelligence_memory_v1";
  const HISTORY_KEY = "personal_intelligence_history_v1";
  const HISTORY_MAX_ITEMS = 3000;
  const HISTORY_RETENTION_DAYS = 3650; // ~10 years
  const HISTORY_MODEL_WINDOW = 120;
  const HISTORY_BACKEND_WINDOW = 120;
  const VIS_PROFILE_EXTENSION = ".piuser.json";
  const VIS_RECOGNITION_THRESHOLD = 0.93;
  const VIS_MATCH_STABLE_COUNT = 3;
  const VIS_SCAN_INTERVAL_MS = 120;
  const VIS_SCAN_FRAME_COUNT = 18;
  const VIS_PROFILE_DOC_LIMIT = 100;
  let enabled = false;
  let recognition = null;
  let wakeRecognition = null;
  let wakeWordArmed = false;
  let wakeWordRestartTimer = null;
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
  let audioUnlocked = false;
  let memoryUid = "";
  let memoryCloudLoaded = false;
  let pendingFactsSaveTimer = null;
  let autoLocalEvolutionBusy = false;
  let autoLocalEvolutionLastSig = "";
  let autoLocalEvolutionLastAt = 0;
  let pendingPiMessages = [];
  let pendingPiTimer = null;
  let pendingPiFlushBusy = false;
  let pendingPiFlushAgain = false;
  let uiMode = "text";
  let typingRowEl = null;
  let visVideoEl = null;
  let visCanvasEl = null;
  let visSetupEl = null;
  let visDetector = null;
  let visRuntime = null;
  let visMonitorTimer = null;
  let visDetectBusy = false;
  let visFacePresent = false;
  let visOffline = true;
  let visSetupOpen = false;
  let visScanning = false;
  let visRecognitionIndex = [];
  let visIndexLoaded = false;
  let visRecognitionCandidate = { profileFile: "", count: 0 };
  let visNoMatchCount = 0;
  let visActiveProfile = null;
  let visLastKnownUserLabel = "Unknown";
  let visPausedAudioByOffline = false;
  let visPendingResponse = null;
  let visLastOfflineReason = "";
  let visBehaviorConfig = {
    preferred_conversation_tone: "adaptive",
    formality_level: "balanced",
    response_length_preference: "balanced",
    technical_explanation_depth: "adaptive",
    humor_professional_balance: "balanced",
  };
  let visPersonalizationProfile = {
    interests: [],
    behavior_patterns: [],
    conversation_habits: [],
    preferred_interaction_style: "balanced",
    frequently_discussed_topics: [],
    tone_preferences: "adaptive",
  };
  let visSpeechState = {
    active: false,
    text: "",
    started_at_ms: 0,
    provider: "",
  };
  let visUserInstance = null;
  let visCloudLoadInFlight = false;
  let visUseLegacySetupFallback = false;
  let visDebugLogs = [];
  let visPendingEnrollmentPayload = null;
  let visTestEl = null;
  let visVerificationBusy = false;
  let visVerificationProfile = null;
  let visAllowTestingStage = false;
  let visProfileSaveTimer = null;
  let visSetupState = {
    step: 1,
    agreed: false,
    infrared: false,
    username: "",
  };
  const SILENT_WAV_DATA_URI = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=";

  const panel = document.createElement("div");
  panel.className = "pi-panel";
  panel.innerHTML = `
    <div class="pi-aurora">
      <canvas class="pi-aurora-canvas" aria-hidden="true"></canvas>
    </div>
    <div class="pi-header">
      <div class="pi-title-wrap">
        <div class="pi-section">Personal Intelligence</div>
        <div class="pi-name">Tutor</div>
      </div>
      <div class="pi-top-status">
        <span class="pi-top-dot"></span>
        <span class="pi-top-label">Online</span>
      </div>
      <button class="pi-mode-toggle" type="button" aria-label="Switch mode">
        <span class="pi-mode-pill active" data-mode="text">Text</span>
        <span class="pi-mode-pill" data-mode="voice">Voice</span>
      </button>
      <button class="pi-close" type="button" aria-label="Close assistant">x</button>
    </div>
    <div class="pi-main">
      <section class="pi-text-mode active" data-pi-mode="text">
        <div class="pi-log" aria-live="polite"></div>
        <div class="pi-evolution-board" aria-live="polite">
          <div class="pi-evolution-title">Cloud Evolution</div>
          <div class="pi-evolution-grid">
            <div class="pi-evolution-item"><span>Runtime</span><strong data-pi-field="runtime">-</strong></div>
            <div class="pi-evolution-item"><span>Graph</span><strong data-pi-field="graph">-</strong></div>
            <div class="pi-evolution-item"><span>Queue</span><strong data-pi-field="queue">-</strong></div>
            <div class="pi-evolution-item"><span>Research</span><strong data-pi-field="research">-</strong></div>
            <div class="pi-evolution-item"><span>Retries</span><strong data-pi-field="retries">0</strong></div>
            <div class="pi-evolution-item"><span>Dead-Letter</span><strong data-pi-field="dead">0</strong></div>
          </div>
        </div>
        <div class="pi-input-bar">
          <button class="pi-input-mic" type="button" aria-label="Voice input">Mic</button>
          <input class="pi-text-input" type="text" placeholder="Ask Personal Intelligence..." />
          <button class="pi-input-send" type="button" aria-label="Send text">Send</button>
        </div>
      </section>
      <section class="pi-voice-mode" data-pi-mode="voice">
        <div class="pi-orb-wrap">
          <button class="pi-orb idle" type="button" aria-label="Activate Tutor">
            <span class="pi-orb-shell"></span>
            <span class="pi-orb-core"></span>
            <span class="pi-orb-glint"></span>
          </button>
          <div class="pi-state">Idle</div>
        </div>
        <div class="pi-voice-log pi-log" aria-live="polite"></div>
        <div class="pi-voice-controls">
          <button class="pi-voice-btn" data-vc="mute" type="button">Mute</button>
          <button class="pi-voice-btn" data-vc="end" type="button">End</button>
          <button class="pi-voice-btn" data-vc="text" type="button">Text Mode</button>
        </div>
      </section>
    </div>
    <input class="pi-hidden-file-input" type="file" multiple style="display:none" />
    <video class="pi-vis-video" autoplay muted playsinline aria-hidden="true"></video>
    <canvas class="pi-vis-canvas" aria-hidden="true"></canvas>
    <div class="pi-vis-setup-backdrop" hidden>
      <div class="pi-vis-setup" role="dialog" aria-modal="true" aria-labelledby="piVisSetupTitle">
        <div class="pi-vis-setup-title" id="piVisSetupTitle">Visual Intelligence Setup</div>
        <div class="pi-vis-setup-body">
          <p><strong>Step 1 of 4: Visual Intelligence Introduction</strong></p>
          <p>Visual Intelligence Setup is preparing your enrollment flow...</p>
          <div class="pi-vis-actions">
            <button type="button" class="pi-vis-btn" data-vis-action="continue">Continue</button>
          </div>
        </div>
        <div class="pi-vis-debug" hidden></div>
      </div>
    </div>
    <div class="pi-vis-test-backdrop" hidden>
      <div class="pi-vis-test">
        <div class="pi-vis-test-title">Visual Intelligence Testing Stage</div>
        <div class="pi-vis-test-status">Preparing verification...</div>
        <div class="pi-vis-test-actions">
          <button type="button" class="pi-vis-btn ghost" data-vis-test="retry">Retry</button>
          <button type="button" class="pi-vis-btn" data-vis-test="activate" hidden>Activate AI</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(panel);

  const closeBtn = panel.querySelector(".pi-close");
  const modeToggleBtn = panel.querySelector(".pi-mode-toggle");
  const modePills = panel.querySelectorAll(".pi-mode-pill");
  const modeSections = panel.querySelectorAll("[data-pi-mode]");
  const orbBtn = panel.querySelector(".pi-orb");
  const auraCanvas = panel.querySelector(".pi-aurora-canvas");
  const stateEl = panel.querySelector(".pi-state");
  const topStatusDotEl = panel.querySelector(".pi-top-dot");
  const topStatusLabelEl = panel.querySelector(".pi-top-label");
  const textLogEl = panel.querySelector(".pi-text-mode .pi-log");
  const voiceLogEl = panel.querySelector(".pi-voice-log");
  const logEl = voiceLogEl || textLogEl;
  const hiddenFileInput = panel.querySelector(".pi-hidden-file-input");
  visVideoEl = panel.querySelector(".pi-vis-video");
  visCanvasEl = panel.querySelector(".pi-vis-canvas");
  visSetupEl = panel.querySelector(".pi-vis-setup-backdrop");
  visTestEl = panel.querySelector(".pi-vis-test-backdrop");
  if (visTestEl) visTestEl.hidden = true;
  const textInputEl = panel.querySelector(".pi-text-input");
  const textSendBtn = panel.querySelector(".pi-input-send");
  const textMicBtn = panel.querySelector(".pi-input-mic");
  const voiceControlBtns = panel.querySelectorAll(".pi-voice-btn");
  const evoFields = {
    runtime: panel.querySelector('[data-pi-field="runtime"]'),
    graph: panel.querySelector('[data-pi-field="graph"]'),
    queue: panel.querySelector('[data-pi-field="queue"]'),
    research: panel.querySelector('[data-pi-field="research"]'),
    retries: panel.querySelector('[data-pi-field="retries"]'),
    dead: panel.querySelector('[data-pi-field="dead"]'),
  };

  function syncVisSetupStateFromDom() {
    if (!visSetupEl) return;
    const usernameInput = visSetupEl.querySelector('[data-vis="username"]');
    if (usernameInput) visSetupState.username = sanitizeVisUsername(usernameInput.value || visSetupState.username);
    const agreeInput = visSetupEl.querySelector('[data-vis="agree"]');
    if (agreeInput) visSetupState.agreed = !!agreeInput.checked;
    const checkedRadio = visSetupEl.querySelector('input[name="pi-vis-ir"]:checked');
    if (checkedRadio) visSetupState.infrared = String(checkedRadio.value || "") === "yes";
  }

  function pushVisDebug(line) {
    const text = "[" + new Date().toLocaleTimeString() + "] " + String(line || "");
    visDebugLogs.push(text);
    if (visDebugLogs.length > 14) visDebugLogs = visDebugLogs.slice(-14);
    if (!visSetupEl) return;
    const debugEl = visSetupEl.querySelector(".pi-vis-debug");
    if (!debugEl) return;
    debugEl.hidden = false;
    debugEl.innerHTML = visDebugLogs.map(function (row) {
      return "<div>" + row.replace(/[<>&]/g, function (ch) {
        return ch === "<" ? "&lt;" : (ch === ">" ? "&gt;" : "&amp;");
      }) + "</div>";
    }).join("");
  }

  function shouldAutoEnableLegacySetupFromPlaceholder() {
    if (!visSetupEl) return false;
    const body = visSetupEl.querySelector(".pi-vis-setup-body");
    if (!body) return false;
    const txt = String(body.textContent || "").toLowerCase();
    return txt.includes("preparing your enrollment flow");
  }

  // Fail-safe delegated setup controls for legacy fallback flow only.
  if (visSetupEl) {
    visSetupEl.addEventListener("click", function (ev) {
      if (!visUseLegacySetupFallback) {
        if (!shouldAutoEnableLegacySetupFromPlaceholder()) return;
        visUseLegacySetupFallback = true;
        pushVisDebug("Auto-enabled legacy setup fallback from placeholder state.");
        try { renderVisSetup(); } catch (e) { pushVisDebug("renderVisSetup failed: " + String((e && e.message) || e)); }
      }
      const btn = ev && ev.target && ev.target.closest ? ev.target.closest("[data-vis-action]") : null;
      if (!btn) return;
      const action = String(btn.getAttribute("data-vis-action") || "").trim().toLowerCase();
      if (!action) return;
      pushVisDebug("Setup action: " + action + " (step " + String(visSetupState.step || 1) + ")");
      syncVisSetupStateFromDom();
      if (action === "continue") {
        if (visSetupState.step === 2 && !visSetupState.agreed) return;
        visSetupState.step = Math.min(3, Number(visSetupState.step || 1) + 1);
        try { renderVisSetup(); } catch (e) { pushVisDebug("continue->render failed: " + String((e && e.message) || e)); }
        return;
      }
      if (action === "back") {
        visSetupState.step = Math.max(1, Number(visSetupState.step || 1) - 1);
        try { renderVisSetup(); } catch (e) { pushVisDebug("back->render failed: " + String((e && e.message) || e)); }
        return;
      }
      if (action === "start" || action === "start-scan") {
        try { startVisEnrollment(); } catch (e) { pushVisDebug("start scan failed to launch: " + String((e && e.message) || e)); }
        return;
      }
      if (action === "complete-enrollment") {
        try { completeVisEnrollmentAndStartTesting(); } catch (e) { pushVisDebug("complete enrollment failed: " + String((e && e.message) || e)); }
      }
    });
    window.addEventListener("error", function (ev) {
      if (!visSetupOpen) return;
      pushVisDebug("Error: " + String(ev && ev.message ? ev.message : "unknown"));
    });
    window.addEventListener("unhandledrejection", function (ev) {
      if (!visSetupOpen) return;
      const reason = ev && ev.reason ? (ev.reason.message || String(ev.reason)) : "unknown";
      pushVisDebug("Promise rejection: " + String(reason));
    });
  }

  if (visTestEl) {
    visTestEl.addEventListener("click", function (ev) {
      const btn = ev && ev.target && ev.target.closest ? ev.target.closest("[data-vis-test]") : null;
      if (!btn) return;
      const action = String(btn.getAttribute("data-vis-test") || "").trim().toLowerCase();
      if (action === "retry") {
        if (visVerificationProfile) startVisVerificationStage(visVerificationProfile);
        return;
      }
      if (action === "activate") {
        if (visVerificationProfile) {
          visAllowTestingStage = false;
          closeVisTestStage();
          switchToVisProfile(visVerificationProfile);
        }
      }
    });
  }

  function dbg() {
    try {
      const args = Array.prototype.slice.call(arguments);
      args.unshift("[PersonalIntelligence]");
      console.log.apply(console, args);
    } catch (e) {}
  }

  function sanitizeVisUsername(raw) {
    return String(raw || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60);
  }

  function buildVisSystemUserId() {
    return "vis_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function getSignedInIdentityHints() {
    const out = {
      username: "",
      account_identifier: "",
    };
    try {
      const u = getFirebaseAuthedUser();
      if (u) {
        out.username = String(u.displayName || "").trim();
        out.account_identifier = String(u.email || u.uid || "").trim();
      }
    } catch (e) {}
    if (!out.username) {
      try {
        if (window.Auth && window.Auth.getUser) {
          const au = window.Auth.getUser();
          out.username = String((au && (au.name || au.displayName || au.username)) || "").trim();
          if (!out.account_identifier) out.account_identifier = String((au && (au.email || au.uid)) || "").trim();
        }
      } catch (e) {}
    }
    if (!out.username && out.account_identifier.includes("@")) {
      out.username = out.account_identifier.split("@")[0];
    }
    if (!out.account_identifier) out.account_identifier = getCurrentUid() || "anonymous";
    if (!out.username) out.username = "user_" + out.account_identifier.slice(0, 10);
    return out;
  }

  function visCanOperateAI() {
    const runtimeSetupOpen = !!(visRuntime && visRuntime.isSetupOpen && visRuntime.isSetupOpen());
    const testOpen = !!(visTestEl && !visTestEl.hidden);
    return !!(enabled && !visOffline && visActiveProfile && !visSetupOpen && !runtimeSetupOpen && !visScanning && !visVerificationBusy && !testOpen);
  }

  function maybeOpenVisSetupForFirstRun(reason) {
    const hasProfiles = Array.isArray(visRecognitionIndex) && visRecognitionIndex.length > 0;
    if (hasProfiles) return false;
    if (visSetupOpen) return false;
    if (visVerificationBusy) return false;
    if (visTestEl && !visTestEl.hidden) return false;
    pushVisDebug("Opening first-run setup (" + String(reason || "bootstrap") + ").");
    openVisSetup();
    return true;
  }

  function openVisTestStage(profile) {
    if (!visAllowTestingStage) return;
    if (!visTestEl) return;
    visVerificationProfile = profile || null;
    visVerificationBusy = true;
    visTestEl.hidden = false;
    const statusEl = visTestEl.querySelector(".pi-vis-test-status");
    const activateBtn = visTestEl.querySelector('[data-vis-test="activate"]');
    if (statusEl) statusEl.textContent = "Testing stage started. Look at the camera for verification...";
    if (activateBtn) activateBtn.hidden = true;
  }

  function closeVisTestStage() {
    visVerificationBusy = false;
    visVerificationProfile = null;
    if (visTestEl) visTestEl.hidden = true;
  }

  async function startVisVerificationStage(profile) {
    if (!visAllowTestingStage) return;
    if (!profile) return;
    openVisTestStage(profile);
    const statusEl = visTestEl ? visTestEl.querySelector(".pi-vis-test-status") : null;
    const activateBtn = visTestEl ? visTestEl.querySelector('[data-vis-test="activate"]') : null;
    const targetVector = profile && profile.facial_signature && Array.isArray(profile.facial_signature.feature_vector)
      ? profile.facial_signature.feature_vector
      : [];
    if (!targetVector.length) {
      if (statusEl) statusEl.textContent = "Verification failed: no biometric signature found in profile.";
      visVerificationBusy = false;
      return;
    }
    let stable = 0;
    let tries = 0;
    while (tries < 45) {
      tries += 1;
      await new Promise(function (resolve) { setTimeout(resolve, 140); });
      const faces = await detectFacesFromVideo();
      const face = faces && faces.length ? faces[0] : buildPseudoCenterFace();
      if (!face) continue;
      const probe = extractVisFaceVector(face);
      if (!probe.length) continue;
      const score = cosineSimilarity(probe, targetVector);
      if (statusEl) statusEl.textContent = "Testing recognition... score " + score.toFixed(3);
      if (score >= Math.max(0.9, VIS_RECOGNITION_THRESHOLD - 0.02)) {
        stable += 1;
      } else {
        stable = 0;
      }
      if (stable >= 3) {
        const uname = String((profile.user_identity && profile.user_identity.username) || "user");
        if (statusEl) statusEl.textContent = "Verification complete. Recognized user: " + uname;
        if (activateBtn) activateBtn.hidden = false;
        visVerificationBusy = false;
        visAllowTestingStage = false;
        return;
      }
    }
    if (statusEl) statusEl.textContent = "Verification timeout. Keep face centered and press Retry.";
    visVerificationBusy = false;
  }

  function setVisOfflineState(nextOffline, reason) {
    visOffline = !!nextOffline;
    panel.classList.toggle("pi-vis-offline", visOffline);
    if (topStatusDotEl) {
      topStatusDotEl.classList.toggle("is-offline", visOffline);
      topStatusDotEl.classList.toggle("is-online", !visOffline);
    }
    if (visOffline) {
      if (topStatusLabelEl) topStatusLabelEl.textContent = reason || "Offline";
    } else if (topStatusLabelEl) {
      topStatusLabelEl.textContent = "Online - " + String(visLastKnownUserLabel || "Unknown");
    }
  }

  function cosineSimilarity(a, b) {
    const x = Array.isArray(a) ? a : [];
    const y = Array.isArray(b) ? b : [];
    const n = Math.min(x.length, y.length);
    if (!n) return 0;
    let dot = 0;
    let ax = 0;
    let by = 0;
    for (let i = 0; i < n; i += 1) {
      const xv = Number(x[i] || 0);
      const yv = Number(y[i] || 0);
      dot += xv * yv;
      ax += xv * xv;
      by += yv * yv;
    }
    if (ax <= 0 || by <= 0) return 0;
    return dot / (Math.sqrt(ax) * Math.sqrt(by));
  }

  function averageVectors(vectors) {
    const src = Array.isArray(vectors) ? vectors.filter(Array.isArray) : [];
    if (!src.length) return [];
    const len = src[0].length;
    if (!len) return [];
    const out = new Array(len).fill(0);
    for (let i = 0; i < src.length; i += 1) {
      const v = src[i];
      for (let j = 0; j < len; j += 1) out[j] += Number(v[j] || 0);
    }
    for (let k = 0; k < len; k += 1) out[k] = out[k] / src.length;
    return out;
  }

  function addLog(role, text) {
    const row = document.createElement("div");
    row.className = "pi-log-row " + (role === "user" ? "user" : "assistant");
    const content = String(text || "")
      .replace(/^You:\s*/i, "")
      .replace(/^Tutor:\s*/i, "");
    row.textContent = content;
    logEl.appendChild(row);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function setUIMode(mode) {
    const next = "voice";
    uiMode = next;
    modeSections.forEach(function (sec) {
      const isActive = String(sec.getAttribute("data-pi-mode") || "") === next;
      sec.classList.toggle("active", isActive);
    });
    modePills.forEach(function (pill) {
      const isActive = String(pill.getAttribute("data-mode") || "") === next;
      pill.classList.toggle("active", isActive);
    });
  }

  function showTypingIndicator() {
    if (!logEl || typingRowEl) return;
    const row = document.createElement("div");
    row.className = "pi-log-row assistant pi-typing";
    row.innerHTML = '<span class="pi-dot"></span><span class="pi-dot"></span><span class="pi-dot"></span>';
    logEl.appendChild(row);
    logEl.scrollTop = logEl.scrollHeight;
    typingRowEl = row;
  }

  function hideTypingIndicator() {
    try {
      if (typingRowEl && typingRowEl.parentNode) typingRowEl.parentNode.removeChild(typingRowEl);
    } catch (e) {}
    typingRowEl = null;
  }

  function hasWakeWord(text) {
    return WAKE_WORD_RE.test(String(text || ""));
  }

  function clearWakeWordRestartTimer() {
    try {
      if (wakeWordRestartTimer) clearTimeout(wakeWordRestartTimer);
    } catch (e) {}
    wakeWordRestartTimer = null;
  }

  function stopWakeWordListener() {
    wakeWordArmed = false;
    clearWakeWordRestartTimer();
    try {
      if (wakeRecognition) wakeRecognition.onend = null;
      if (wakeRecognition) wakeRecognition.stop();
    } catch (e) {}
    wakeRecognition = null;
  }

  async function triggerFromWakeWord(transcript) {
    const heard = String(transcript || "").trim();
    if (heard) {
      addLog("assistant", "Tutor: Wake word detected (" + heard + ").");
    } else {
      addLog("assistant", "Tutor: Wake word detected.");
    }
    await primeAudioPlayback();
    if (!enabled) setEnabled(true);
    startListening();
  }

  function startWakeWordListener() {
    if (wakeWordArmed) return;
    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Rec) {
      dbg("wake word listener unavailable: speech recognition not supported");
      return;
    }
    wakeWordArmed = true;
    if (!wakeRecognition) {
      wakeRecognition = new Rec();
      wakeRecognition.lang = "en-US";
      wakeRecognition.continuous = true;
      wakeRecognition.interimResults = true;
      wakeRecognition.onresult = function (ev) {
        let transcript = "";
        try {
          const idx = ev && typeof ev.resultIndex === "number" ? ev.resultIndex : 0;
          transcript = ev && ev.results && ev.results[idx] && ev.results[idx][0]
            ? String(ev.results[idx][0].transcript || "")
            : "";
        } catch (e) {
          transcript = "";
        }
        if (!hasWakeWord(transcript)) return;
        stopWakeWordListener();
        triggerFromWakeWord(transcript).catch(function () {});
      };
      wakeRecognition.onerror = function (ev) {
        dbg("wake word error", ev && ev.error);
      };
      wakeRecognition.onend = function () {
        if (!wakeWordArmed || enabled) return;
        clearWakeWordRestartTimer();
        wakeWordRestartTimer = setTimeout(function () {
          try {
            if (wakeRecognition && wakeWordArmed && !enabled) wakeRecognition.start();
          } catch (e) {}
        }, 700);
      };
    }
    try {
      wakeRecognition.start();
      addLog("assistant", "Tutor: Wake mode active. Say 'Hey Tutor' or 'Tutor'.");
    } catch (e) {
      dbg("wake word start failed", e && e.message);
    }
  }

  renderEvolutionStatus({});

  function setEvoField(field, value) {
    const el = evoFields[field];
    if (!el) return;
    el.textContent = String(value || "-");
  }

  function renderEvolutionStatus(data) {
    const src = data && typeof data === "object" ? data : {};
    const phase2 = src.phase2_status && typeof src.phase2_status === "object" ? src.phase2_status : {};
    const phase3to9 = src.phases_3_to_9_status && typeof src.phases_3_to_9_status === "object" ? src.phases_3_to_9_status : {};
    const queue = phase2.queue && typeof phase2.queue === "object" ? phase2.queue : {};
    const graph = phase2.graph && typeof phase2.graph === "object" ? phase2.graph : {};
    const research = phase2.research_pipeline && typeof phase2.research_pipeline === "object" ? phase2.research_pipeline : {};
    const phase3 = phase3to9.phase3_distributed_swarm && typeof phase3to9.phase3_distributed_swarm === "object" ? phase3to9.phase3_distributed_swarm : {};
    const phase4 = phase3to9.phase4_deep_research && typeof phase3to9.phase4_deep_research === "object" ? phase3to9.phase4_deep_research : {};
    const phase9 = phase3to9.phase9_governed_rollout && typeof phase3to9.phase9_governed_rollout === "object" ? phase3to9.phase9_governed_rollout : {};
    const runtimeMode = String(src.runtime_mode || (src.pi_os_status && src.pi_os_status.runtime && src.pi_os_status.runtime.mode) || "-");

    setEvoField("runtime", runtimeMode || "-");
    setEvoField("graph", graph.ok ? (String(graph.node_count || 0) + "n/" + String(graph.edge_count || 0) + "e") : "error");
    setEvoField("queue", String(queue.pending_count || 0) + " pending / " + String(phase3.worker_count || 0) + "w");
    setEvoField("research", (phase4.triggered ? "deep" : (research.status || "-")) + " / " + String(phase9.rollout_mode || "na"));
    setEvoField("retries", String(queue.retried_count || 0));
    setEvoField("dead", String(queue.dead_letter_count || 0));
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
      if (!Array.isArray(h)) {
        convoHistory = [];
      } else {
        convoHistory = h.map(function (item) {
          if (!item || typeof item !== "object") return null;
          const role = item.role === "assistant" ? "assistant" : "user";
          const content = String(item.content || "").slice(0, 1600);
          if (!content) return null;
          const tsRaw = Number(item.ts || 0);
          const ts = Number.isFinite(tsRaw) && tsRaw > 0 ? tsRaw : Date.now();
          return { role: role, content: content, ts: ts };
        }).filter(Boolean);
      }
    } catch (e) {
      convoHistory = [];
    }
    saveMemory();
  }

  function saveMemory() {
    const now = Date.now();
    const maxAgeMs = HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const filteredHistory = (Array.isArray(convoHistory) ? convoHistory : []).filter(function (m) {
      if (!m || !m.content) return false;
      const ts = Number(m.ts || 0) || now;
      return (now - ts) <= maxAgeMs;
    });
    convoHistory = filteredHistory.slice(-HISTORY_MAX_ITEMS);
    try { localStorage.setItem(MEMORY_KEY, JSON.stringify(knownFacts || {})); } catch (e) {}
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(convoHistory || [])); } catch (e) {}
  }

  function getCurrentUid() {
    try {
      if (window.firebase && firebase.auth && firebase.apps && firebase.apps.length) {
        const cu = firebase.auth().currentUser;
        if (cu && cu.uid) return String(cu.uid);
      }
    } catch (e) {}
    try {
      if (window.Auth && window.Auth.getUser) {
        const u = window.Auth.getUser();
        if (u && u.uid) return String(u.uid);
      }
    } catch (e) {}
    return "";
  }

  function getFirestoreDb() {
    try {
      if (!window.firebase || !firebase.firestore) return null;
      return firebase.firestore();
    } catch (e) {
      return null;
    }
  }

  function getFirebaseAuthedUser() {
    try {
      if (!window.firebase || !firebase.auth || !firebase.apps || !firebase.apps.length) return null;
      const u = firebase.auth().currentUser;
      if (!u || !u.uid) return null;
      return u;
    } catch (e) {
      return null;
    }
  }

  function dedupeHistoryEntries(items) {
    const arr = Array.isArray(items) ? items : [];
    const seen = new Set();
    const out = [];
    for (let i = arr.length - 1; i >= 0; i--) {
      const m = arr[i];
      if (!m || !m.content) continue;
      const role = m.role === "assistant" ? "assistant" : "user";
      const content = String(m.content || "").slice(0, 1600);
      if (!content) continue;
      const ts = Number(m.ts || 0) || Date.now();
      const key = role + "|" + content + "|" + String(Math.floor(ts / 1000));
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ role: role, content: content, ts: ts });
    }
    out.reverse();
    return out.slice(-HISTORY_MAX_ITEMS);
  }

  async function loadCloudMemoryForUid(uid) {
    const userId = String(uid || "").trim();
    const db = getFirestoreDb();
    if (!db || !userId) return false;
    try {
      const profileRef = db.collection("users").doc(userId).collection("pi").doc("profile");
      const profileSnap = await profileRef.get();
      const remoteFacts = profileSnap && profileSnap.exists ? (profileSnap.data() || {}) : {};

      const histRef = db.collection("users").doc(userId).collection("pi_history");
      const histSnap = await histRef.orderBy("ts_ms", "desc").limit(HISTORY_MAX_ITEMS).get();
      const remoteHistory = [];
      if (histSnap && histSnap.forEach) {
        histSnap.forEach(function (d) {
          const data = d && d.data ? d.data() : {};
          const role = data && data.role === "assistant" ? "assistant" : "user";
          const content = String((data && data.content) || "").slice(0, 1600);
          if (!content) return;
          const ts = Number((data && data.ts_ms) || 0) || Date.now();
          remoteHistory.push({ role: role, content: content, ts: ts });
        });
      }
      remoteHistory.reverse();

      knownFacts = Object.assign({}, knownFacts || {}, remoteFacts || {});
      convoHistory = dedupeHistoryEntries((convoHistory || []).concat(remoteHistory || []));
      saveMemory();
      memoryCloudLoaded = true;
      dbg("cloud memory loaded", "facts:", Object.keys(knownFacts || {}).length, "history:", convoHistory.length);
      return true;
    } catch (e) {
      dbg("cloud memory load failed", e && e.message);
      return false;
    }
  }

  async function saveHistoryEntryToCloud(role, content, ts) {
    const db = getFirestoreDb();
    const au = getFirebaseAuthedUser();
    const uid = au && au.uid ? String(au.uid) : (memoryUid || getCurrentUid());
    if (!db || !uid || !au) return;
    try {
      await db.collection("users").doc(uid).collection("pi_history").add({
        role: role === "assistant" ? "assistant" : "user",
        content: String(content || "").slice(0, 1600),
        ts_ms: Number(ts || Date.now()),
        ts: firebase.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e) {
      dbg("cloud history save failed", e && e.message);
    }
  }

  async function saveKnownFactsToCloud() {
    const db = getFirestoreDb();
    const au = getFirebaseAuthedUser();
    const uid = au && au.uid ? String(au.uid) : (memoryUid || getCurrentUid());
    if (!db || !uid || !au) return;
    try {
      await db.collection("users").doc(uid).collection("pi").doc("profile").set(knownFacts || {}, { merge: true });
    } catch (e) {
      dbg("cloud facts save failed", e && e.message);
    }
  }

  function scheduleKnownFactsCloudSave() {
    try {
      if (pendingFactsSaveTimer) clearTimeout(pendingFactsSaveTimer);
    } catch (e) {}
    pendingFactsSaveTimer = setTimeout(function () {
      pendingFactsSaveTimer = null;
      saveKnownFactsToCloud();
    }, 600);
  }

  function initCloudMemorySync() {
    (async function () {
      try {
        if (window.Auth && window.Auth.init) {
          try { await window.Auth.init(); } catch (e) {}
        }
        let retries = 0;
        while (retries < 30) {
          if (window.firebase && firebase.auth && firebase.apps && firebase.apps.length) break;
          await new Promise(function (resolve) { setTimeout(resolve, 200); });
          retries += 1;
        }
        if (!window.firebase || !firebase.auth || !firebase.apps || !firebase.apps.length) {
          dbg("cloud memory disabled: firebase app not initialized");
          return;
        }
        firebase.auth().onAuthStateChanged(async function (user) {
          memoryUid = user && user.uid ? String(user.uid) : "";
          if (!memoryUid) {
            memoryCloudLoaded = false;
            visRecognitionIndex = [];
            visIndexLoaded = false;
            visActiveProfile = null;
            setAssistantStateForVisOffline("Offline - sign in required");
            return;
          }
          if (!memoryCloudLoaded) await loadCloudMemoryForUid(memoryUid);
          await loadVisProfilesFromCloud();
          maybeOpenVisSetupForFirstRun("auth_state");
          if (visRuntime && visRuntime.refreshIndex) {
            try { await visRuntime.refreshIndex(); } catch (e) {}
          }
        });
      } catch (e) {
        dbg("cloud memory auth listener failed", e && e.message);
      }
    })();
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
    updateVisPersonalizationFromKnownFacts();
    updateVisBehaviorConfigurationFromKnownFacts();
    saveMemory();
    scheduleKnownFactsCloudSave();
    scheduleVisProfileSave();
  }

  function pushHistory(role, content) {
    const ts = Date.now();
    convoHistory.push({
      role: role === "assistant" ? "assistant" : "user",
      content: String(content || "").slice(0, 1600),
      ts: ts,
    });
    if (convoHistory.length > HISTORY_MAX_ITEMS) convoHistory = convoHistory.slice(-HISTORY_MAX_ITEMS);
    updateVisPersonalizationFromHistory();
    saveMemory();
    saveHistoryEntryToCloud(role, content, ts);
    scheduleVisProfileSave();
  }

  function updateVisPersonalizationFromKnownFacts() {
    const facts = knownFacts && typeof knownFacts === "object" ? knownFacts : {};
    const topics = [];
    ["favorite_subject", "favorite_sport", "hobbies", "goal", "school", "country", "city"].forEach(function (k) {
      const v = String(facts[k] || "").trim();
      if (v) topics.push(v);
    });
    const uniqueTopics = Array.from(new Set(topics)).slice(0, 20);
    visPersonalizationProfile = Object.assign({}, visPersonalizationProfile || {}, {
      frequently_discussed_topics: uniqueTopics.length ? uniqueTopics : (visPersonalizationProfile.frequently_discussed_topics || []),
      interests: uniqueTopics.length ? uniqueTopics.slice(0, 12) : (visPersonalizationProfile.interests || []),
    });
  }

  function updateVisBehaviorConfigurationFromKnownFacts() {
    const facts = knownFacts && typeof knownFacts === "object" ? knownFacts : {};
    const cfg = Object.assign({}, visBehaviorConfig || {});
    const lang = String(facts.preferred_language || "").toLowerCase();
    if (lang.includes("english")) cfg.formality_level = cfg.formality_level || "balanced";
    const grade = Number(facts.grade || 0);
    if (Number.isFinite(grade) && grade > 0) {
      cfg.technical_explanation_depth = grade <= 9 ? "medium" : (cfg.technical_explanation_depth || "adaptive");
    }
    visBehaviorConfig = Object.assign({
      preferred_conversation_tone: "adaptive",
      formality_level: "balanced",
      response_length_preference: "balanced",
      technical_explanation_depth: "adaptive",
      humor_professional_balance: "balanced",
    }, cfg);
  }

  function updateVisPersonalizationFromHistory() {
    const recent = getRecentHistory(40);
    const userMsgs = recent.filter(function (m) { return m.role === "user"; }).map(function (m) { return String(m.content || ""); });
    const style = userMsgs.length && userMsgs.some(function (t) { return t.length > 220; }) ? "detailed" : "concise";
    const low = userMsgs.join(" ").toLowerCase();
    const patterns = [];
    if (/\bplease\b/.test(low)) patterns.push("polite_requests");
    if (/\bexplain\b|\bwhy\b|\bhow\b/.test(low)) patterns.push("curious_questioning");
    if (/\bquick\b|\bshort\b/.test(low)) patterns.push("short_answers_preference");
    const uniquePatterns = Array.from(new Set(patterns)).slice(0, 12);
    visPersonalizationProfile = Object.assign({}, visPersonalizationProfile || {}, {
      preferred_interaction_style: style,
      behavior_patterns: uniquePatterns.length ? uniquePatterns : (visPersonalizationProfile.behavior_patterns || []),
      conversation_habits: uniquePatterns.length ? uniquePatterns : (visPersonalizationProfile.conversation_habits || []),
    });
    visBehaviorConfig = Object.assign({}, visBehaviorConfig || {}, {
      response_length_preference: style === "detailed" ? "long" : "concise",
    });
  }

  function getRecentHistory(limit) {
    const n = Math.max(1, Number(limit || 20));
    return (Array.isArray(convoHistory) ? convoHistory : []).slice(-n).map(function (m) {
      return { role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "") };
    });
  }

  function buildLongTermMemoryContext() {
    const facts = knownFacts && typeof knownFacts === "object" ? knownFacts : {};
    const rows = [];
    const factKeys = Object.keys(facts);
    if (factKeys.length) {
      rows.push("Known profile:");
      factKeys.forEach(function (k) {
        const v = facts[k];
        const text = typeof v === "boolean" ? String(v) : String(v || "").trim();
        if (text) rows.push("- " + k + ": " + text.slice(0, 180));
      });
    }

    const all = Array.isArray(convoHistory) ? convoHistory : [];
    if (all.length) {
      const older = all.slice(0, Math.max(0, all.length - 24));
      const stride = Math.max(1, Math.floor(older.length / 12));
      const sampled = [];
      for (let i = 0; i < older.length; i += stride) {
        sampled.push(older[i]);
        if (sampled.length >= 12) break;
      }
      if (sampled.length) {
        rows.push("Long-term conversation traces:");
        sampled.forEach(function (m) {
          const who = m.role === "assistant" ? "Tutor" : "User";
          rows.push("- " + who + ": " + String(m.content || "").replace(/\s+/g, " ").slice(0, 140));
        });
      }
    }
    return rows.join("\n").slice(0, 3200);
  }

  function setAssistantState(kind, label) {
    orbBtn.classList.remove("idle", "listening", "thinking", "speaking");
    orbBtn.classList.add(kind);
    panel.classList.remove("state-idle", "state-listening", "state-thinking", "state-speaking");
    panel.classList.add("state-" + kind);
    assistantState = kind;
    stateEl.textContent = label;
    if (topStatusLabelEl) topStatusLabelEl.textContent = label || "Online";
  }

  function getVisProfileStorePath(uid, fileName) {
    return "users/" + String(uid || "") + "/pi_vis_identity_profiles/" + String(fileName || "");
  }

  function setAssistantStateForVisOffline(reason) {
    setAssistantState("idle", "Offline");
    setVisOfflineState(true, reason || "Offline - no face");
  }

  function buildRemainingSpeakTextFromCurrentPlayback() {
    const full = String((visSpeechState && visSpeechState.text) || "").trim();
    if (!full) return "";
    const audio = tutorAudio;
    if (!audio) return full;
    const duration = Number(audio.duration || 0);
    const current = Number(audio.currentTime || 0);
    if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(current) || current <= 0) return full;
    const ratio = Math.min(1, Math.max(0, current / duration));
    const cut = Math.min(full.length, Math.max(0, Math.floor(full.length * ratio)));
    const remaining = full.slice(cut).trim();
    return remaining || full.slice(-Math.min(120, full.length));
  }

  function captureSpeechStateIntoPendingResponse() {
    const remaining = buildRemainingSpeakTextFromCurrentPlayback();
    if (!remaining) return;
    visPendingResponse = {
      answer: remaining,
      speakText: remaining,
      resumed_from_pause: true,
      ts: Date.now(),
    };
  }

  function pauseForVisOffline(reason) {
    const reasonText = String(reason || "Offline - no face");
    if (visOffline && visLastOfflineReason === reasonText) return;
    visLastOfflineReason = reasonText;
    try {
      if (recognition) recognition.abort();
    } catch (e) {}
    stopServerRecorder();
    if (visSpeechState.active) {
      captureSpeechStateIntoPendingResponse();
    }
    if (tutorAudio && !tutorAudio.paused) {
      try {
        tutorAudio.pause();
        visPausedAudioByOffline = true;
      } catch (e) {}
    }
    try {
      if (window.speechSynthesis && window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
        window.speechSynthesis.pause();
      }
    } catch (e) {}
    setAssistantStateForVisOffline(reasonText);
    if (visActiveProfile) {
      visActiveProfile.session_state = Object.assign({}, visActiveProfile.session_state || {}, {
        paused: true,
        pause_reason: reasonText,
        last_active_timestamp: nowIso(),
        assistant_state: assistantState,
        pending_response: visPendingResponse || null,
        speech_state: Object.assign({}, visSpeechState || {}),
      });
      scheduleVisProfileSave();
    }
  }

  async function resumeFromVisOnline() {
    visLastOfflineReason = "";
    setVisOfflineState(false, "Online - " + String(visLastKnownUserLabel || "Unknown"));
    if (visPausedAudioByOffline && tutorAudio) {
      try {
        await tutorAudio.play();
      } catch (e) {}
    }
    visPausedAudioByOffline = false;
    try {
      if (window.speechSynthesis && window.speechSynthesis.paused) window.speechSynthesis.resume();
    } catch (e) {}
    if (visPendingResponse && visCanOperateAI()) {
      const pending = visPendingResponse;
      visPendingResponse = null;
      hideTypingIndicator();
      addLog("assistant", "Tutor: " + String(pending.answer || ""));
      pushHistory("assistant", String(pending.answer || ""));
      await playTutorTTS(String(pending.speakText || pending.answer || ""));
      if (pendingPiMessages.length) flushPiBatch("resume_pending_user_messages");
    } else {
      setAssistantState("listening", "Listening");
      if (pendingPiMessages.length) flushPiBatch("resume_pending_user_messages");
    }
  }

  function getDefaultVisProfile(username, accountIdentifier, featureSignature) {
    const safeUser = sanitizeVisUsername(username) || "user";
    const fileName = safeUser + VIS_PROFILE_EXTENSION;
    return {
      file_name: fileName,
      profile_version: 1,
      user_identity: {
        username: safeUser,
        account_identifier: String(accountIdentifier || "unknown"),
        system_user_id: buildVisSystemUserId(),
        creation_timestamp: nowIso(),
      },
      facial_signature: featureSignature || {},
      personalization_profile: {
        interests: [],
        behavior_patterns: [],
        conversation_habits: [],
        preferred_interaction_style: "balanced",
        frequently_discussed_topics: [],
        tone_preferences: "adaptive",
      },
      conversation_memory: {
        history: [],
        important_facts: {},
      },
      learned_preferences: {},
      ai_behavior_configuration: {
        preferred_conversation_tone: "adaptive",
        formality_level: "balanced",
        response_length_preference: "balanced",
        technical_explanation_depth: "adaptive",
        humor_professional_balance: "balanced",
      },
      session_state: {
        paused: false,
        assistant_state: "idle",
        pending_messages: [],
        pending_response: null,
        last_active_timestamp: nowIso(),
      },
    };
  }

  async function saveVisProfileToCloud(profile) {
    const db = getFirestoreDb();
    const au = getFirebaseAuthedUser();
    const uid = au && au.uid ? String(au.uid) : getCurrentUid();
    if (!db || !uid || !profile || !profile.file_name) return false;
    try {
      await db.collection("users")
        .doc(uid)
        .collection("pi_vis_identity_profiles")
        .doc(String(profile.file_name))
        .set(profile, { merge: true });
      const featureVector = profile && profile.facial_signature && Array.isArray(profile.facial_signature.feature_vector)
        ? profile.facial_signature.feature_vector.slice(0, 256)
        : [];
      await db.collection("users")
        .doc(uid)
        .collection("pi_vis_face_index")
        .doc(String(profile.file_name))
        .set({
          profile_file: String(profile.file_name),
          username: String((profile.user_identity && profile.user_identity.username) || profile.file_name),
          feature_vector: featureVector,
          scan_mode: String((profile.facial_signature && profile.facial_signature.scan_mode) || "high_precision_rgb"),
          geometry_data: (profile.facial_signature && profile.facial_signature.geometry_data) || {},
          updated_at: nowIso(),
        }, { merge: true });
      return true;
    } catch (e) {
      dbg("VIS cloud profile save failed", e && e.message);
      return false;
    }
  }

  async function loadVisProfilesFromCloud() {
    if (visCloudLoadInFlight) return visRecognitionIndex.slice();
    const db = getFirestoreDb();
    const au = getFirebaseAuthedUser();
    const uid = au && au.uid ? String(au.uid) : getCurrentUid();
    if (!db || !uid) return visRecognitionIndex.slice();
    visCloudLoadInFlight = true;
    try {
      const profileSnap = await db.collection("users")
        .doc(uid)
        .collection("pi_vis_identity_profiles")
        .limit(VIS_PROFILE_DOC_LIMIT)
        .get();
      const indexSnap = await db.collection("users")
        .doc(uid)
        .collection("pi_vis_face_index")
        .limit(VIS_PROFILE_DOC_LIMIT)
        .get();
      const profileMap = {};
      if (profileSnap && profileSnap.forEach) {
        profileSnap.forEach(function (docSnap) {
          const data = docSnap && docSnap.data ? docSnap.data() : null;
          if (!data || !data.file_name) return;
          profileMap[String(data.file_name)] = data;
        });
      }
      const nextIndex = [];
      if (indexSnap && indexSnap.forEach) {
        indexSnap.forEach(function (docSnap) {
          const data = docSnap && docSnap.data ? docSnap.data() : null;
          if (!data || !data.profile_file) return;
          const fileName = String(data.profile_file || "");
          const profile = profileMap[fileName] || null;
          const vector = Array.isArray(data.feature_vector)
            ? data.feature_vector
            : (profile && profile.facial_signature && Array.isArray(profile.facial_signature.feature_vector)
              ? profile.facial_signature.feature_vector
              : []);
          if (!fileName) return;
          if (!vector.length && !profile) return;
          nextIndex.push({
            profileFile: fileName,
            vector: vector.slice(0, 256),
            username: String(data.username || (profile && profile.user_identity && profile.user_identity.username) || fileName),
            profile: profile,
          });
        });
      } else {
        Object.keys(profileMap).forEach(function (fileName) {
          const profile = profileMap[fileName];
          const vector = profile && profile.facial_signature && Array.isArray(profile.facial_signature.feature_vector)
            ? profile.facial_signature.feature_vector
            : [];
          if (!vector.length) return;
          nextIndex.push({
            profileFile: fileName,
            vector: vector.slice(0, 256),
            username: String((profile.user_identity && profile.user_identity.username) || fileName),
            profile: profile,
          });
        });
      }
      visRecognitionIndex = nextIndex;
      visIndexLoaded = true;
      dbg("VIS index loaded", visRecognitionIndex.length);
      return visRecognitionIndex.slice();
    } catch (e) {
      dbg("VIS index load failed", e && e.message);
      return visRecognitionIndex.slice();
    } finally {
      visCloudLoadInFlight = false;
    }
  }

  function scheduleVisProfileSave() {
    try {
      if (visProfileSaveTimer) clearTimeout(visProfileSaveTimer);
    } catch (e) {}
    visProfileSaveTimer = setTimeout(function () {
      visProfileSaveTimer = null;
      persistActiveVisProfileNow();
    }, 600);
  }

  async function persistActiveVisProfileNow() {
    if (!visActiveProfile) return;
    visActiveProfile.personalization_profile = Object.assign({}, visActiveProfile.personalization_profile || {}, visPersonalizationProfile || {});
    visActiveProfile.ai_behavior_configuration = Object.assign({}, visActiveProfile.ai_behavior_configuration || {}, visBehaviorConfig || {});
    visActiveProfile.conversation_memory = Object.assign({}, visActiveProfile.conversation_memory || {}, {
      history: (Array.isArray(convoHistory) ? convoHistory : []).slice(-HISTORY_MAX_ITEMS),
      important_facts: Object.assign({}, knownFacts || {}),
    });
    visActiveProfile.learned_preferences = Object.assign({}, visActiveProfile.learned_preferences || {}, knownFacts || {});
    visActiveProfile.session_state = Object.assign({}, visActiveProfile.session_state || {}, {
      paused: visOffline,
      assistant_state: assistantState,
      pending_messages: (Array.isArray(pendingPiMessages) ? pendingPiMessages : []).slice(-PI_BATCH_MAX_MESSAGES),
      pending_response: visPendingResponse || null,
      speech_state: Object.assign({}, visSpeechState || {}),
      user_instance: Object.assign({}, visUserInstance || {}),
      last_active_timestamp: nowIso(),
    });
    await saveVisProfileToCloud(visActiveProfile);
  }

  function applyVisProfileToRuntime(profile) {
    const p = profile && typeof profile === "object" ? profile : null;
    if (!p) return;
    visActiveProfile = p;
    visLastKnownUserLabel = String((p.user_identity && p.user_identity.username) || p.file_name || "Unknown");
    visPersonalizationProfile = Object.assign({}, visPersonalizationProfile || {}, p.personalization_profile || {});
    visBehaviorConfig = Object.assign({}, visBehaviorConfig || {}, p.ai_behavior_configuration || {});
    visUserInstance = {
      profile_file: String(p.file_name || ""),
      runtime_key: "vis_instance_" + String(p.file_name || "") + "_" + Date.now().toString(36),
      loaded_at: nowIso(),
    };
    const mergedFacts = Object.assign(
      {},
      (p.conversation_memory && p.conversation_memory.important_facts) || {},
      (p.learned_preferences || {})
    );
    knownFacts = mergedFacts;
    const h = p.conversation_memory && Array.isArray(p.conversation_memory.history)
      ? p.conversation_memory.history
      : [];
    convoHistory = dedupeHistoryEntries(h);
    const session = p.session_state && typeof p.session_state === "object" ? p.session_state : {};
    pendingPiMessages = Array.isArray(session.pending_messages) ? session.pending_messages.slice(-PI_BATCH_MAX_MESSAGES) : [];
    visPendingResponse = session.pending_response || null;
    if (session && session.speech_state && typeof session.speech_state === "object") {
      visSpeechState = Object.assign({}, visSpeechState || {}, session.speech_state);
    }
    saveMemory();
    if (topStatusLabelEl) topStatusLabelEl.textContent = "Online - " + visLastKnownUserLabel;
  }

  async function switchToVisProfile(profile) {
    if (!profile || !profile.file_name) return;
    const nextFile = String(profile.file_name);
    const currentFile = visActiveProfile && visActiveProfile.file_name ? String(visActiveProfile.file_name) : "";
    if (currentFile && currentFile !== nextFile && visSpeechState.active) {
      captureSpeechStateIntoPendingResponse();
      stopTutorAudio();
      visPausedAudioByOffline = false;
      visSpeechState = { active: false, text: "", started_at_ms: 0, provider: "" };
    }
    if (currentFile && currentFile !== nextFile) await persistActiveVisProfileNow();
    applyVisProfileToRuntime(profile);
    setVisOfflineState(false, "Online - " + visLastKnownUserLabel);
    if (visActiveProfile) {
      visActiveProfile.session_state = Object.assign({}, visActiveProfile.session_state || {}, {
        paused: false,
        last_active_timestamp: nowIso(),
      });
      scheduleVisProfileSave();
    }
    await resumeFromVisOnline();
  }

  async function detectFacesFromVideo() {
    if (!visVideoEl) return [];
    if (!visDetector) {
      try {
        if ("FaceDetector" in window) visDetector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
      } catch (e) {
        visDetector = null;
      }
    }
    if (!visDetector) return [];
    try {
      const faces = await visDetector.detect(visVideoEl);
      return Array.isArray(faces) ? faces : [];
    } catch (e) {
      return [];
    }
  }

  function extractVisFaceVector(face) {
    if (!visVideoEl || !visCanvasEl || !face || !face.boundingBox) return [];
    const box = face.boundingBox;
    const vw = Number(visVideoEl.videoWidth || 0);
    const vh = Number(visVideoEl.videoHeight || 0);
    if (vw < 16 || vh < 16) return [];
    const sx = Math.max(0, Math.floor(box.x));
    const sy = Math.max(0, Math.floor(box.y));
    const sw = Math.max(8, Math.floor(box.width));
    const sh = Math.max(8, Math.floor(box.height));
    visCanvasEl.width = 48;
    visCanvasEl.height = 48;
    const ctx = visCanvasEl.getContext("2d", { willReadFrequently: true });
    if (!ctx) return [];
    try {
      ctx.drawImage(visVideoEl, sx, sy, sw, sh, 0, 0, 48, 48);
      const img = ctx.getImageData(0, 0, 48, 48);
      const data = img.data;
      const vector = [];
      for (let by = 0; by < 8; by += 1) {
        for (let bx = 0; bx < 8; bx += 1) {
          let sum = 0;
          let count = 0;
          const y0 = by * 6;
          const x0 = bx * 6;
          for (let y = y0; y < y0 + 6; y += 1) {
            for (let x = x0; x < x0 + 6; x += 1) {
              const i = (y * 48 + x) * 4;
              const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
              sum += gray / 255;
              count += 1;
            }
          }
          vector.push(count ? (sum / count) : 0);
        }
      }
      vector.push(Math.min(1, Math.max(0, box.width / vw)));
      vector.push(Math.min(1, Math.max(0, box.height / vh)));
      vector.push(Math.min(1, Math.max(0, (box.x + (box.width / 2)) / vw)));
      vector.push(Math.min(1, Math.max(0, (box.y + (box.height / 2)) / vh)));
      return vector;
    } catch (e) {
      return [];
    }
  }

  function buildPseudoCenterFace() {
    const vw = Number(visVideoEl && visVideoEl.videoWidth ? visVideoEl.videoWidth : 0);
    const vh = Number(visVideoEl && visVideoEl.videoHeight ? visVideoEl.videoHeight : 0);
    if (vw < 24 || vh < 24) return null;
    const w = Math.floor(vw * 0.56);
    const h = Math.floor(vh * 0.72);
    const x = Math.floor((vw - w) / 2);
    const y = Math.floor((vh - h) / 2);
    return { boundingBox: { x: x, y: y, width: w, height: h }, landmarks: [] };
  }

  function findVisMatch(vector) {
    const input = Array.isArray(vector) ? vector : [];
    if (!input.length || !visRecognitionIndex.length) return null;
    let best = null;
    for (let i = 0; i < visRecognitionIndex.length; i += 1) {
      const row = visRecognitionIndex[i];
      const score = cosineSimilarity(input, row.vector);
      if (!best || score > best.score) {
        best = {
          profileFile: row.profileFile,
          username: row.username,
          score: score,
          profile: row.profile || null,
        };
      }
    }
    return best;
  }

  function renderVisSetupEmergencyFallback() {
    if (!visSetupEl) return;
    const body = visSetupEl.querySelector(".pi-vis-setup-body");
    if (!body) return;
    body.innerHTML =
      '<p><strong>Step 1 of 4: Visual Intelligence Introduction</strong></p>' +
      '<p>Visual Intelligence setup recovered from a rendering issue.</p>' +
      '<div class="pi-vis-actions"><button type="button" class="pi-vis-btn" data-vis-action="continue">Continue</button></div>';
  }

  function openVisSetup() {
    visAllowTestingStage = false;
    closeVisTestStage();
    visUseLegacySetupFallback = true;
    if (visSetupOpen) return;
    visSetupOpen = true;
    visSetupState = Object.assign({}, visSetupState, { step: 1, agreed: false });
    panel.classList.add("pi-vis-setup-open");
    if (visSetupEl) visSetupEl.hidden = false;
    try {
      renderVisSetup();
    } catch (e) {
      renderVisSetupEmergencyFallback();
    }
  }

  function closeVisSetup() {
    visUseLegacySetupFallback = false;
    visSetupOpen = false;
    panel.classList.remove("pi-vis-setup-open");
    if (visSetupEl) visSetupEl.hidden = true;
  }

  function renderVisSetup() {
    if (!visSetupEl) return;
    const body = visSetupEl.querySelector(".pi-vis-setup-body");
    if (!body) return;
    const hints = getSignedInIdentityHints();
    if (!visSetupState.username) visSetupState.username = sanitizeVisUsername(hints.username);
    if (visSetupState.step === 1) {
      body.innerHTML =
        '<p>Visual Intelligence uses facial recognition to identify you and load your personalized AI profile.</p>' +
        '<p>The system will scan your facial structure and generate a secure biometric identity signature.</p>' +
        '<label class="pi-vis-field">Username for identity file<input class="pi-vis-input" data-vis="username" type="text" value="' + String(visSetupState.username || "") + '" /></label>' +
        '<div class="pi-vis-actions"><button type="button" class="pi-vis-btn" data-vis-action="continue">Continue</button></div>';
    } else if (visSetupState.step === 2) {
      body.innerHTML =
        '<p>User agreement and privacy confirmation:</p>' +
        '<p>Facial feature data is used only for identity recognition and AI personalization.</p>' +
        '<label class="pi-vis-check"><input type="checkbox" data-vis="agree" ' + (visSetupState.agreed ? "checked" : "") + ' /> I agree to biometric processing for personalization.</label>' +
        '<div class="pi-vis-actions"><button type="button" class="pi-vis-btn ghost" data-vis-action="back">Back</button><button type="button" class="pi-vis-btn" data-vis-action="continue" ' + (visSetupState.agreed ? "" : "disabled") + '>Continue</button></div>';
    } else if (visSetupState.step === 3) {
      body.innerHTML =
        '<p>Does your webcam support infrared facial recognition?</p>' +
        '<label class="pi-vis-radio"><input type="radio" name="pi-vis-ir" value="yes" ' + (visSetupState.infrared ? "checked" : "") + ' /> Yes - My webcam supports infrared scanning</label>' +
        '<label class="pi-vis-radio"><input type="radio" name="pi-vis-ir" value="no" ' + (!visSetupState.infrared ? "checked" : "") + ' /> No - My webcam does not support infrared scanning</label>' +
        '<div class="pi-vis-note">IR mode uses depth cues when available. RGB mode uses high-precision facial geometry and pixel-level feature vectors across multiple frames.</div>' +
        '<div class="pi-vis-actions"><button type="button" class="pi-vis-btn ghost" data-vis-action="back">Back</button><button type="button" class="pi-vis-btn" data-vis-action="start-scan">Start Scan</button></div>';
    } else if (visSetupState.step === 5) {
      body.innerHTML =
        '<p><strong>Scan completed successfully.</strong></p>' +
        '<p>Your biometric identity signature is ready.</p>' +
        '<div class="pi-vis-actions"><button type="button" class="pi-vis-btn" data-vis-action="complete-enrollment">Continue</button></div>';
    } else {
      body.innerHTML =
        '<p>Scanning in progress...</p>' +
        '<div class="pi-vis-progress"><div class="pi-vis-progress-bar"></div></div>' +
        '<div class="pi-vis-note">Keep your face in frame and slightly change angle for higher accuracy.</div>';
    }

    const usernameInput = body.querySelector('[data-vis="username"]');
    if (usernameInput) {
      usernameInput.addEventListener("input", function () {
        visSetupState.username = sanitizeVisUsername(usernameInput.value);
      });
    }
    const agreeInput = body.querySelector('[data-vis="agree"]');
    if (agreeInput) {
      agreeInput.addEventListener("change", function () {
        visSetupState.agreed = !!agreeInput.checked;
        renderVisSetup();
      });
    }
    const radios = body.querySelectorAll('input[name="pi-vis-ir"]');
    if (radios && radios.length) {
      radios.forEach(function (r) {
        r.addEventListener("change", function () {
          visSetupState.infrared = String(r.value || "") === "yes";
        });
      });
    }
    const actionBtns = body.querySelectorAll("[data-vis-action]");
    if (actionBtns && actionBtns.length) {
      actionBtns.forEach(function (btn) {
        btn.addEventListener("click", function () {
          const action = String(btn.getAttribute("data-vis-action") || "");
          if (action === "back") {
            visSetupState.step = Math.max(1, visSetupState.step - 1);
            renderVisSetup();
            return;
          }
          if (action === "continue") {
            if (visSetupState.step === 2 && !visSetupState.agreed) return;
            visSetupState.step = Math.min(3, visSetupState.step + 1);
            renderVisSetup();
            return;
          }
          if (action === "start-scan") {
            startVisEnrollment();
            return;
          }
          if (action === "complete-enrollment") {
            completeVisEnrollmentAndStartTesting();
          }
        });
      });
    }
  }

  async function completeVisEnrollmentAndStartTesting() {
    const payload = visPendingEnrollmentPayload;
    if (!payload || !payload.avgVector || !payload.avgVector.length) {
      pushVisDebug("Enrollment continue clicked without pending payload.");
      return;
    }
    const identityHints = getSignedInIdentityHints();
    const requested = sanitizeVisUsername(visSetupState.username) || sanitizeVisUsername(identityHints.username) || "user";
    const profile = getDefaultVisProfile(requested, identityHints.account_identifier, {
      scan_mode: visSetupState.infrared ? "infrared_assisted" : "high_precision_rgb",
      frame_count: payload.frameCount || payload.vectorsLength || 0,
      landmark_snapshots: (payload.landmarks || []).slice(0, 6),
      feature_vector: payload.avgVector,
      geometry_data: {
        dimensions: payload.avgVector.length,
        extraction: "48x48 grayscale block features + geometry ratios",
      },
      created_at: nowIso(),
    });
    await saveVisProfileToCloud(profile);
    visRecognitionIndex.push({
      profileFile: profile.file_name,
      username: profile.user_identity.username,
      vector: payload.avgVector.slice(0, 256),
      profile: profile,
    });
    pushVisDebug("Identity profile file created: " + profile.file_name);
    visPendingEnrollmentPayload = null;
    visAllowTestingStage = true;
    closeVisSetup();
    await startVisVerificationStage(profile);
  }

  async function startVisEnrollment() {
    if (visScanning) return;
    visScanning = true;
    visSetupState.step = 4;
    try { renderVisSetup(); } catch (e) { pushVisDebug("scan step render failed: " + String((e && e.message) || e)); }
    pushVisDebug("Face scan started (legacy fallback).");
    if (!visVideoEl || !visVideoEl.srcObject || !visVideoEl.videoWidth || !visVideoEl.videoHeight) {
      const cameraReady = await ensureVisCameraReady();
      if (!cameraReady) {
        visScanning = false;
        visSetupState.step = 3;
        try { renderVisSetup(); } catch (e) {}
        pushVisDebug("Camera was not ready for enrollment scan.");
        return;
      }
    }
    const vectors = [];
    const landmarks = [];
    let usedCenterFallback = false;
    for (let i = 0; i < VIS_SCAN_FRAME_COUNT; i += 1) {
      await new Promise(function (resolve) { setTimeout(resolve, 120); });
      const faces = await detectFacesFromVideo();
      let face = faces && faces.length ? faces[0] : null;
      if (!face) {
        face = buildPseudoCenterFace();
        if (face) usedCenterFallback = true;
      }
      if (!face) continue;
      const vector = extractVisFaceVector(face);
      if (vector.length) vectors.push(vector);
      if (face.landmarks && Array.isArray(face.landmarks)) {
        landmarks.push(face.landmarks.map(function (p) {
          return { x: Number(p.x || 0), y: Number(p.y || 0), type: String(p.type || "") };
        }));
      }
      const bar = visSetupEl ? visSetupEl.querySelector(".pi-vis-progress-bar") : null;
      if (bar) bar.style.width = Math.min(100, Math.round(((i + 1) / VIS_SCAN_FRAME_COUNT) * 100)) + "%";
    }
    visScanning = false;
    if (!vectors.length) {
      visSetupState.step = 3;
      try { renderVisSetup(); } catch (e) { pushVisDebug("scan fail render failed: " + String((e && e.message) || e)); }
      pushVisDebug("Face scan captured 0 valid frames.");
      addLog("assistant", "Tutor: Setup scan failed. Keep face in frame and retry.");
      return;
    }
    if (usedCenterFallback) {
      pushVisDebug("Scan completed using center-frame biometric fallback.");
    } else {
      pushVisDebug("Scan completed with detected face frames: " + String(vectors.length));
    }
    const avgVector = averageVectors(vectors);
    visPendingEnrollmentPayload = {
      avgVector: avgVector,
      landmarks: landmarks.slice(0, 12),
      frameCount: vectors.length,
      vectorsLength: vectors.length,
    };
    visSetupState.step = 5;
    renderVisSetup();
    pushVisDebug("Scan complete step ready. Click Continue to create file and run testing stage.");
  }

  async function processVisFrame() {
    if (visDetectBusy || !visVideoEl || visSetupOpen || visScanning || visVerificationBusy) return;
    if (!visDetector) return;
    visDetectBusy = true;
    try {
      if (!visIndexLoaded) await loadVisProfilesFromCloud();
      maybeOpenVisSetupForFirstRun("frame_loop");
      const faces = await detectFacesFromVideo();
      if (!faces.length) {
        const hadFace = visFacePresent;
        visFacePresent = false;
        visRecognitionCandidate = { profileFile: "", count: 0 };
        visNoMatchCount = 0;
        if (hadFace || !visOffline) pauseForVisOffline("Offline - no face");
        return;
      }
      visFacePresent = true;
      const vector = extractVisFaceVector(faces[0]);
      if (!vector.length) {
        if (!visOffline) pauseForVisOffline("Offline - no face");
        return;
      }
      const match = findVisMatch(vector);
      if (!match || match.score < VIS_RECOGNITION_THRESHOLD) {
        visNoMatchCount += 1;
        if (visNoMatchCount >= VIS_MATCH_STABLE_COUNT) {
          setAssistantStateForVisOffline("Offline - unrecognized face");
          if (!visSetupOpen) openVisSetup();
        }
        return;
      }
      visNoMatchCount = 0;
      if (visRecognitionCandidate.profileFile === match.profileFile) {
        visRecognitionCandidate.count += 1;
      } else {
        visRecognitionCandidate = { profileFile: match.profileFile, count: 1 };
      }
      if (visRecognitionCandidate.count < VIS_MATCH_STABLE_COUNT) {
        setAssistantStateForVisOffline("Recognizing user...");
        return;
      }
      const activeFile = visActiveProfile && visActiveProfile.file_name ? String(visActiveProfile.file_name) : "";
      if (activeFile !== match.profileFile) {
        const profile = match.profile || null;
        if (profile) {
          await switchToVisProfile(profile);
        } else {
          await loadVisProfilesFromCloud();
          const hit = visRecognitionIndex.find(function (r) { return r.profileFile === match.profileFile; });
          if (hit && hit.profile) await switchToVisProfile(hit.profile);
        }
      } else if (visOffline) {
        await resumeFromVisOnline();
      }
    } catch (e) {
      dbg("VIS frame processing failed", e && e.message);
    } finally {
      visDetectBusy = false;
    }
  }

  async function ensureVisCameraReady() {
    if (!visVideoEl) return false;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 24, max: 30 },
        },
        audio: false,
      });
      visVideoEl.srcObject = stream;
      await visVideoEl.play();
      return true;
    } catch (e) {
      dbg("VIS webcam init failed", e && e.message);
      setAssistantStateForVisOffline("Offline - camera denied");
      return false;
    }
  }

  function initVisDetector() {
    try {
      if ("FaceDetector" in window) {
        visDetector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
      } else {
        visDetector = null;
        setAssistantStateForVisOffline("Offline - face API unsupported");
      }
    } catch (e) {
      visDetector = null;
      setAssistantStateForVisOffline("Offline - face API unsupported");
    }
  }

  async function initVisualIntelligenceSystem() {
    closeVisTestStage();
    visAllowTestingStage = false;
    visPendingEnrollmentPayload = null;
    if (window.PI_VIS_RUNTIME && typeof window.PI_VIS_RUNTIME.createRuntime === "function") {
      visRuntime = window.PI_VIS_RUNTIME.createRuntime({
        panelEl: panel,
        videoEl: visVideoEl,
        canvasEl: visCanvasEl,
        setupEl: visSetupEl,
        threshold: VIS_RECOGNITION_THRESHOLD,
        stableCount: VIS_MATCH_STABLE_COUNT,
        scanIntervalMs: VIS_SCAN_INTERVAL_MS,
        scanFrameCount: VIS_SCAN_FRAME_COUNT,
        getIdentityHints: function () {
          return getSignedInIdentityHints();
        },
        loadIndex: async function () {
          return await loadVisProfilesFromCloud();
        },
        saveProfile: async function (profile) {
          await saveVisProfileToCloud(profile);
        },
        onStatus: function (status) {
          if (!status) return;
          if (String(status).toLowerCase().includes("online - ")) {
            setVisOfflineState(false, String(status));
            return;
          }
          setAssistantStateForVisOffline(String(status));
        },
        onRecognizing: function () {
          setAssistantStateForVisOffline("Recognizing user...");
        },
        onOffline: function (reason) {
          pauseForVisOffline(String(reason || "Offline - no face"));
        },
        onProfileMatched: async function (match) {
          const activeFile = visActiveProfile && visActiveProfile.file_name ? String(visActiveProfile.file_name) : "";
          const profileFile = String(match && match.profileFile ? match.profileFile : "");
          if (!profileFile) return;
          if (activeFile === profileFile) {
            if (visOffline) await resumeFromVisOnline();
            return;
          }
          const profile = match && match.profile ? match.profile : null;
          if (profile) {
            await switchToVisProfile(profile);
            return;
          }
          await loadVisProfilesFromCloud();
          const hit = visRecognitionIndex.find(function (r) { return r.profileFile === profileFile; });
          if (hit && hit.profile) await switchToVisProfile(hit.profile);
        },
        onProfileCreated: async function (profile) {
          await switchToVisProfile(profile);
          addLog("assistant", "Tutor: Visual identity created for " + String((profile && profile.user_identity && profile.user_identity.username) || "user") + ".");
        },
        onScanFailed: function () {
          addLog("assistant", "Tutor: Setup scan failed. Keep face in frame and retry.");
        },
        onRequireSetupFallback: function () {
          if (!visSetupOpen) openVisSetup();
        },
      });
      if (visRuntime && visRuntime.start) {
        const okExternal = await visRuntime.start();
        if (okExternal) {
          maybeOpenVisSetupForFirstRun("runtime_start");
          return;
        }
      }
    }

    initVisDetector();
    await loadVisProfilesFromCloud();
    maybeOpenVisSetupForFirstRun("legacy_init");
    const ok = await ensureVisCameraReady();
    if (!ok) return;
    setVisOfflineState(true, "Scanning for face...");
    if (visMonitorTimer) clearInterval(visMonitorTimer);
    visMonitorTimer = setInterval(function () {
      processVisFrame();
    }, VIS_SCAN_INTERVAL_MS);
  }

  function clearIdleTimer() {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  }

  function clearPiBatchTimer() {
    try {
      if (pendingPiTimer) clearTimeout(pendingPiTimer);
    } catch (e) {}
    pendingPiTimer = null;
  }

  function schedulePiBatchFlush() {
    clearPiBatchTimer();
    pendingPiTimer = setTimeout(function () {
      flushPiBatch("silence_window");
    }, PI_BATCH_WAIT_MS);
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
    visSpeechState = { active: false, text: "", started_at_ms: 0, provider: "" };
  }

  async function primeAudioPlayback() {
    if (audioUnlocked) return true;
    try {
      const probe = new Audio(SILENT_WAV_DATA_URI);
      probe.muted = true;
      probe.playsInline = true;
      await probe.play();
      try { probe.pause(); } catch (e) {}
      audioUnlocked = true;
      return true;
    } catch (e) {
      return false;
    }
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

  function getSelectedVoiceKey() {
    try {
      const id = String(localStorage.getItem(PI_TTS_VOICE_KEY) || "").trim();
      return id || PI_TTS_VOICE_DEFAULT;
    } catch (e) {
      return PI_TTS_VOICE_DEFAULT;
    }
  }

  function getSelectedVoiceId() {
    return getSelectedVoiceKey();
  }

  function setSelectedVoiceId(id) {
    const v = String(id || "").trim();
    if (!v) return false;
    try { localStorage.setItem(PI_TTS_VOICE_KEY, v); } catch (e) {}
    return true;
  }

  function getSelectedPuterVoiceOptions() {
    const key = getSelectedVoiceKey();
    const catalog = window.PuterVoiceCatalog;
    if (catalog && typeof catalog.getById === "function") {
      const hit = catalog.getById(key);
      if (hit && hit.options) return hit.options;
      const fallback = catalog.getDefault && catalog.getDefault();
      if (fallback && fallback.options) return fallback.options;
    }
    return { provider: "openai", model: "gpt-4o-mini-tts", voice: "alloy" };
  }

  function normalizePuterTtsSource(result) {
    const seen = new Set();
    function walk(node) {
      if (!node) return null;
      if (typeof node === "string") {
        const s = node.trim();
        if (/^(blob:|data:audio|https?:\/\/)/i.test(s)) return { src: s, revoke: false };
        return null;
      }
      if (node instanceof Blob) return { src: URL.createObjectURL(node), revoke: true };
      if (typeof HTMLAudioElement !== "undefined" && node instanceof HTMLAudioElement && node.src) {
        return { src: String(node.src), revoke: false };
      }
      if (typeof node !== "object") return null;
      if (seen.has(node)) return null;
      seen.add(node);
      const directKeys = ["url", "audio_url", "src", "href", "download_url"];
      for (let i = 0; i < directKeys.length; i += 1) {
        const k = directKeys[i];
        if (typeof node[k] === "string" && node[k].trim()) {
          const s = node[k].trim();
          if (/^(blob:|data:audio|https?:\/\/)/i.test(s)) return { src: s, revoke: false };
        }
      }
      if (typeof node.data === "string" && /^data:audio/i.test(node.data)) return { src: node.data, revoke: false };
      const nestedKeys = ["audio", "data", "result", "output", "message", "content"];
      for (let i = 0; i < nestedKeys.length; i += 1) {
        const found = walk(node[nestedKeys[i]]);
        if (found) return found;
      }
      return null;
    }
    return walk(result);
  }

  async function requestPuterTts(text, voiceOptions) {
    await ensurePuterReady(false);
    const ai = window.puter && window.puter.ai;
    if (!ai) throw new Error("PUTER_NOT_LOADED");
    const payloadA = Object.assign({ text: String(text || "") }, voiceOptions || {});
    const payloadB = Object.assign({ input: String(text || "") }, voiceOptions || {});
    async function tryMethod(fn) {
      try { return await fn(String(text || ""), voiceOptions || {}); } catch (e1) {}
      try { return await fn(payloadA); } catch (e2) {}
      return fn(payloadB);
    }
    if (typeof ai.txt2speech === "function") return tryMethod(ai.txt2speech.bind(ai));
    if (typeof ai.text2speech === "function") return tryMethod(ai.text2speech.bind(ai));
    if (typeof ai.tts === "function") return tryMethod(ai.tts.bind(ai));
    throw new Error("PUTER_TTS_UNAVAILABLE");
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
    m = text.match(/\b(?:my best friend(?:'s)? name is|my bff(?:'s)? name is)\s+([A-Za-z][A-Za-z .'-]{1,80})/i);
    if (m && m[1]) updates.best_friend_name = String(m[1]).trim().slice(0, 80);
    m = text.match(/\b(?:my (?:favorite|favourite|fav) sport is|i like to play)\s+([A-Za-z][A-Za-z .'-]{2,60})/i);
    if (m && m[1]) updates.favorite_sport = String(m[1]).trim().slice(0, 80);
    m = text.match(/\b(?:my (?:favorite|favourite|fav) subject is)\s+([A-Za-z][A-Za-z0-9 .'-]{1,60})/i);
    if (m && m[1]) updates.favorite_subject = String(m[1]).trim().slice(0, 80);
    m = text.match(/\b(?:my (?:favorite|favourite|fav) color is)\s+([A-Za-z][A-Za-z .'-]{2,40})/i);
    if (m && m[1]) updates.favorite_color = String(m[1]).trim().slice(0, 60);
    m = text.match(/\b(?:my hobby is|my hobbies are|i like)\s+([A-Za-z0-9 ,.'&()-]{2,120})/i);
    if (m && m[1]) updates.hobbies = String(m[1]).trim().slice(0, 140);
    m = text.match(/\b(?:my country is|i am from)\s+([A-Za-z .'-]{2,80})/i);
    if (m && m[1]) updates.country = String(m[1]).trim().slice(0, 80);
    m = text.match(/\b(?:i am in grade|my grade is)\s+([0-9]{1,2})/i);
    if (m && m[1]) updates.grade = String(m[1]).trim().slice(0, 4);
    m = text.match(/\b(?:i prefer|my preferred language is)\s+([A-Za-z]{3,20})/i);
    if (m && m[1]) updates.preferred_language = String(m[1]).trim().slice(0, 20);
    m = text.match(/\b(?:set home to|set home as|my home is at|home address is|i live at)\s+([A-Za-z0-9 ,./#'-]{6,220})/i);
    if (m && m[1]) updates.home_address = String(m[1]).trim().replace(/\.$/, "").slice(0, 220);

    // Generic personal fact: "my X is Y" -> fact_x
    m = text.match(/\bmy\s+([A-Za-z][A-Za-z0-9 _-]{1,30})\s+is\s+(.{1,120})$/i);
    if (m && m[1] && m[2]) {
      let rawKey = String(m[1]).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
      if (/^(fav|favourite|favorite)_subject$/.test(rawKey)) rawKey = "favorite_subject";
      if (/^(fav|favourite|favorite)_color$/.test(rawKey)) rawKey = "favorite_color";
      if (/^(fav|favourite|favorite)_sport$/.test(rawKey)) rawKey = "favorite_sport";
      const key = rawKey ? ("fact_" + rawKey).slice(0, 42) : "";
      if (key && !updates[key] && !updates[rawKey]) updates[key] = String(m[2]).trim().replace(/\.$/, "").slice(0, 180);
    }
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
    const behaviorCfg = visBehaviorConfig && typeof visBehaviorConfig === "object" ? visBehaviorConfig : {};
    const personalization = visPersonalizationProfile && typeof visPersonalizationProfile === "object" ? visPersonalizationProfile : {};
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

    const behaviorRules =
      "Behavior configuration: " +
      "tone=" + String(behaviorCfg.preferred_conversation_tone || "adaptive") + ", " +
      "formality=" + String(behaviorCfg.formality_level || "balanced") + ", " +
      "response_length=" + String(behaviorCfg.response_length_preference || "balanced") + ", " +
      "technical_depth=" + String(behaviorCfg.technical_explanation_depth || "adaptive") + ", " +
      "humor_balance=" + String(behaviorCfg.humor_professional_balance || "balanced") + ".";

    const personalizationRules =
      "Personalization profile: " + JSON.stringify({
        interests: Array.isArray(personalization.interests) ? personalization.interests.slice(0, 12) : [],
        behavior_patterns: Array.isArray(personalization.behavior_patterns) ? personalization.behavior_patterns.slice(0, 12) : [],
        conversation_habits: Array.isArray(personalization.conversation_habits) ? personalization.conversation_habits.slice(0, 12) : [],
        preferred_interaction_style: personalization.preferred_interaction_style || "balanced",
        frequently_discussed_topics: Array.isArray(personalization.frequently_discussed_topics) ? personalization.frequently_discussed_topics.slice(0, 20) : [],
        tone_preferences: personalization.tone_preferences || "adaptive",
      });

    return [corePersona, principles, modeInstructions, styleRules, behaviorRules, personalizationRules, knownFactsLine].join("\n");
  }

  async function fetchPuterVoices() {
    const catalog = window.PuterVoiceCatalog;
    if (catalog && Array.isArray(catalog.voices) && catalog.voices.length) {
      return catalog.voices.slice(0, 200);
    }
    return [{ id: "openai:alloy", label: "OpenAI - alloy", options: { provider: "openai", model: "gpt-4o-mini-tts", voice: "alloy" } }];
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
      voiceSelect.innerHTML = "<option value=''>Loading Puter voices...</option>";
      const voices = await fetchPuterVoices();
      voiceSelect.innerHTML = "";
      for (let i = 0; i < voices.length; i += 1) {
        const v = voices[i];
        const id = String(v && v.id ? v.id : "").trim();
        if (!id) continue;
        const name = String(v && v.label ? v.label : "Voice");
        const category = "";
        const o = document.createElement("option");
        o.value = id;
        o.textContent = category ? (name + " (" + category + ")") : name;
        voiceSelect.appendChild(o);
      }
      const selectedVoice = getSelectedVoiceKey();
      const hasVoice = Array.from(voiceSelect.options).some(function (o) { return o.value === selectedVoice; });
      voiceSelect.value = hasVoice ? selectedVoice : PI_TTS_VOICE_DEFAULT;
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
    const isMobile = window.matchMedia && window.matchMedia("(max-width: 900px)").matches;
    const particleCount = isMobile ? 180 : 320;
    for (let i = 0; i < particleCount; i += 1) {
      vizParticles.push({
        seed: Math.random() * 2000,
        angle: Math.random() * Math.PI * 2,
        radius: 24 + Math.random() * 68,
        speed: 0.004 + Math.random() * 0.016,
        size: 0.7 + Math.random() * 2.4,
        alpha: 0.2 + Math.random() * 0.65,
        jitter: 0.5 + Math.random() * 2.2,
        band: Math.random() < 0.35 ? "inner" : (Math.random() < 0.8 ? "mid" : "outer"),
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
    const pulse = Math.min(1.5, vizEnergy * 0.9 + micLevel * 1.1 + spkLevel * 1.25);

    vizRotation += (assistantState === "thinking" ? 0.018 : 0.01) * (1 + vizEnergy * 0.55);

    const w = vizW;
    const h = vizH;
    const canvasRect = auraCanvas.getBoundingClientRect();
    const orbRect = orbBtn.getBoundingClientRect();
    const cx = (orbRect.left - canvasRect.left) + (orbRect.width / 2);
    const cy = (orbRect.top - canvasRect.top) + (orbRect.height / 2);

    vizCtx.globalCompositeOperation = "source-over";
    vizCtx.clearRect(0, 0, w, h);
    vizCtx.fillStyle = assistantState === "speaking" ? "rgba(3, 8, 16, 0.36)" : "rgba(3, 8, 16, 0.28)";
    vizCtx.fillRect(0, 0, w, h);

    const t = performance.now() * 0.001;
    const ringR = 60 + vizEnergy * 42;
    const coreR = 16 + vizEnergy * 14 + pulse * 5;
    const outerR = 86 + vizEnergy * 44;

    const coreGlow = vizCtx.createRadialGradient(cx, cy, 0, cx, cy, outerR * 1.55);
    coreGlow.addColorStop(0, `rgba(184, 235, 255, ${0.42 + vizEnergy * 0.4})`);
    coreGlow.addColorStop(0.22, `rgba(96, 187, 255, ${0.28 + vizEnergy * 0.28})`);
    coreGlow.addColorStop(0.62, `rgba(53, 127, 255, ${0.1 + vizEnergy * 0.18})`);
    coreGlow.addColorStop(1, "rgba(0,0,0,0)");
    vizCtx.fillStyle = coreGlow;
    vizCtx.beginPath();
    vizCtx.arc(cx, cy, outerR * 1.55, 0, Math.PI * 2);
    vizCtx.fill();

    vizCtx.globalCompositeOperation = "lighter";

    for (let ring = 0; ring < 4; ring += 1) {
      const rr = ringR + ring * (10 + vizEnergy * 7);
      const seg = Math.PI * (1.08 + ring * 0.2 + vizEnergy * 0.4);
      vizCtx.strokeStyle = `rgba(${ring === 0 ? "176, 236, 255" : "108, 188, 255"}, ${0.18 + vizEnergy * 0.3})`;
      vizCtx.lineWidth = 1.2 + vizEnergy * (2.8 - ring * 0.35);
      vizCtx.beginPath();
      vizCtx.arc(cx, cy, rr, vizRotation * (1 + ring * 0.18), vizRotation * (1 + ring * 0.18) + seg);
      vizCtx.stroke();
    }

    vizCtx.strokeStyle = `rgba(219, 245, 255, ${0.14 + vizEnergy * 0.22})`;
    vizCtx.lineWidth = 1.1 + vizEnergy * 1.8;
    vizCtx.beginPath();
    vizCtx.arc(cx, cy, ringR + 26 + Math.sin(t * 1.8) * 4, -vizRotation * 0.6, -vizRotation * 0.6 + Math.PI * 1.2);
    vizCtx.stroke();

    for (let i = 0; i < vizParticles.length; i += 1) {
      const p = vizParticles[i];
      p.angle += p.speed * (1 + vizEnergy * 1.8);
      const ringScale = p.band === "inner" ? 0.72 : (p.band === "mid" ? 1 : 1.24);
      const ripple = Math.sin(t * (1.2 + p.jitter) + p.seed) * (2 + vizEnergy * 12);
      const r = ringR * ringScale + p.radius + ripple;
      const x = cx + Math.cos(p.angle + vizRotation) * r;
      const y = cy + Math.sin(p.angle + vizRotation) * r;
      const alpha = Math.min(1, p.alpha * (0.46 + vizEnergy * 1.1));
      vizCtx.fillStyle = p.band === "inner"
        ? `rgba(220, 246, 255, ${alpha.toFixed(3)})`
        : `rgba(133, 209, 255, ${(alpha * 0.9).toFixed(3)})`;
      vizCtx.beginPath();
      vizCtx.arc(x, y, p.size + vizEnergy * 0.9, 0, Math.PI * 2);
      vizCtx.fill();
    }

    const hotCore = vizCtx.createRadialGradient(cx, cy, coreR * 0.2, cx, cy, coreR * 2.5);
    hotCore.addColorStop(0, `rgba(255,255,255,0.98)`);
    hotCore.addColorStop(0.18, `rgba(210, 245, 255, ${0.9})`);
    hotCore.addColorStop(0.56, `rgba(95, 180, 255, ${0.44 + vizEnergy * 0.22})`);
    hotCore.addColorStop(1, "rgba(0,0,0,0)");
    vizCtx.fillStyle = hotCore;
    vizCtx.beginPath();
    vizCtx.arc(cx, cy, coreR * 2.5, 0, Math.PI * 2);
    vizCtx.fill();

    vizCtx.globalCompositeOperation = "source-over";

    panel.style.setProperty("--pi-energy", vizEnergy.toFixed(3));
    panel.style.setProperty("--pi-pulse", pulse.toFixed(3));
    panel.style.setProperty("--pi-spin", vizRotation.toFixed(3));
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
      persistActiveVisProfileNow();
      try {
        if (recognition) recognition.abort();
      } catch (e) {}
      setAssistantState("idle", "Idle");
      startWakeWordListener();
    } else {
      stopWakeWordListener();
      startOrbVisualization();
      ensureMicAnalyser();
      if (visOffline) {
        setAssistantStateForVisOffline("Offline - no face");
      } else {
        setAssistantState("listening", "Listening");
      }
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

  function shouldTriggerCloudEvolution(text, updates) {
    const t = String(text || "").toLowerCase();
    const u = updates && typeof updates === "object" ? updates : {};
    if (Object.keys(u).length > 0) return true;
    return /my name is|i live|set home|my city|my school|my goal|i prefer|my favorite|my favourite|my hobby|my country|i am from|my\s+[a-z0-9 _-]+\s+is/i.test(t);
  }

  async function generatePuterEvolutionCode(userText, language, subject) {
    try {
      await ensurePuterReady(false);
      const model = getPIModel();
      const prompt = [
        "Generate safe JavaScript module code only.",
        "No shell/system commands. No process env mutation.",
        "Required export: module.exports = { id, describe, run }",
        `Language: ${String(language || "English")}`,
        `Subject: ${String(subject || "General")}`,
        "User message:",
        String(userText || "").slice(0, 900),
        "Known facts:",
        JSON.stringify(knownFacts || {}).slice(0, 2200),
      ].join("\n");
      const resp = await window.puter.ai.chat([{ role: "user", content: prompt }], { model: model });
      return String(extractPuterText(resp) || "").trim();
    } catch (e) {
      dbg("puter code generation failed, using fallback", e && e.message);
      return "";
    }
  }

  function buildFallbackEvolutionCode(userText, updates) {
    const safeMsg = String(userText || "").replace(/\\/g, "\\\\").replace(/`/g, "\\`").slice(0, 240);
    const safeUpdates = JSON.stringify(updates && typeof updates === "object" ? updates : {}).slice(0, 700);
    return [
      "module.exports = {",
      "  id: 'pi_local_fallback',",
      "  describe: function(){ return 'Local fallback evolution module'; },",
      "  run: function(input){",
      `    const fromMessage = \`${safeMsg}\`;`,
      `    const updates = ${safeUpdates};`,
      "    return { ok: true, source: 'fallback', fromMessage, updates, input: input || {} };",
      "  }",
      "};",
      "",
    ].join("\n");
  }

  function toSchemaCandidatesFromUpdates(updates) {
    const src = updates && typeof updates === "object" ? updates : {};
    const candidates = [];
    Object.keys(src).forEach(function (k) {
      if (/^fact_[a-z0-9_]{1,64}$/i.test(k)) {
        const key = String(k).replace(/^fact_/i, "").toLowerCase().trim();
        if (!key) return;
        candidates.push({ key: key, category: "custom", source_key: k });
      }
    });
    return candidates;
  }

  async function inferAdditionalFactsWithPuter(userText, updates) {
    try {
      await ensurePuterReady(false);
      const model = getPIModel();
      const prompt = [
        "Extract personal facts from the user message.",
        "Return strict JSON object only.",
        "Format: {\"facts\": {\"fact_key\": \"value\"}}",
        "Use keys like: favorite_subject, favorite_color, favorite_sport, best_friend_name, career_goal, etc.",
        "If unknown relation appears, use key prefix fact_.",
        "Do not include anything except JSON.",
        "Message:",
        String(userText || "").slice(0, 900),
        "Known extracted facts:",
        JSON.stringify(updates || {}).slice(0, 1200),
      ].join("\n");
      const resp = await window.puter.ai.chat([{ role: "user", content: prompt }], { model: model });
      const raw = String(extractPuterText(resp) || "").trim();
      const s = raw.indexOf("{");
      const e = raw.lastIndexOf("}");
      if (s < 0 || e <= s) return {};
      const parsed = JSON.parse(raw.slice(s, e + 1));
      const facts = parsed && parsed.facts && typeof parsed.facts === "object" ? parsed.facts : {};
      const out = {};
      Object.keys(facts).forEach(function (k) {
        const keyRaw = String(k || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^_+|_+$/g, "");
        if (!keyRaw) return;
        const val = String(facts[k] || "").trim();
        if (!val) return;
        const key = /^(name|school|city|country|grade|preferred_language|favorite_subject|favorite_color|favorite_sport|hobbies|goal|best_friend_name)$/.test(keyRaw)
          ? keyRaw
          : (keyRaw.startsWith("fact_") ? keyRaw : ("fact_" + keyRaw));
        out[key.slice(0, 64)] = val.slice(0, 180);
      });
      return out;
    } catch (e) {
      dbg("puter fact inference failed", e && e.message);
      return {};
    }
  }

  async function inferModelMemoryFactsWithPuter(userText, assistantAnswer, updates) {
    try {
      await ensurePuterReady(false);
      const model = getPIModel();
      const prompt = [
        "You are a memory extractor.",
        "List only user-profile facts you already remember or can confidently infer from conversation context.",
        "Return strict JSON only in this format:",
        "{\"facts\": [{\"key\":\"favorite_subject\",\"value\":\"ICT\",\"confidence\":0.0}]}",
        "Rules:",
        "- confidence must be 0..1",
        "- include only confidence >= 0.85",
        "- never invent uncertain facts",
        "- prefer stable profile facts (name, school, city, preferences, friends, goals, habits)",
        "- if no reliable facts, return {\"facts\":[]}",
        "Latest user message:",
        String(userText || "").slice(0, 900),
        "Latest assistant answer:",
        String(assistantAnswer || "").slice(0, 900),
        "Current known facts:",
        JSON.stringify(knownFacts || {}).slice(0, 2400),
        "Current extracted facts:",
        JSON.stringify(updates || {}).slice(0, 1200),
      ].join("\n");
      const resp = await window.puter.ai.chat([{ role: "user", content: prompt }], { model: model });
      const raw = String(extractPuterText(resp) || "").trim();
      const s = raw.indexOf("{");
      const e = raw.lastIndexOf("}");
      if (s < 0 || e <= s) return {};
      const parsed = JSON.parse(raw.slice(s, e + 1));
      const rows = Array.isArray(parsed && parsed.facts) ? parsed.facts : [];
      const out = {};
      rows.forEach(function (r) {
        const keyRaw = String(r && r.key ? r.key : "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^_+|_+$/g, "");
        const val = String(r && r.value ? r.value : "").trim();
        const conf = Number(r && r.confidence);
        if (!keyRaw || !val) return;
        if (!Number.isFinite(conf) || conf < 0.85) return;
        const key = /^(name|school|city|country|grade|preferred_language|favorite_subject|favorite_color|favorite_sport|hobbies|goal|best_friend_name)$/.test(keyRaw)
          ? keyRaw
          : (keyRaw.startsWith("fact_") ? keyRaw : ("fact_" + keyRaw));
        out[key.slice(0, 64)] = val.slice(0, 180);
      });
      return out;
    } catch (e) {
      dbg("puter model-memory inference failed", e && e.message);
      return {};
    }
  }

  async function sendCloudEvolutionFromPuter(userText, puterAnswer, generatedCodeFromCaller, updatesFromCaller) {
    try {
      const updates = updatesFromCaller && typeof updatesFromCaller === "object"
        ? updatesFromCaller
        : detectMemoryUpdatesLocal(userText);
      if (!shouldTriggerCloudEvolution(userText, updates)) return;
      const language = localStorage.getItem("g9_language") || "English";
      const subject = localStorage.getItem("g9_subject") || "General";
      const generatedCode = String(generatedCodeFromCaller || "").trim() || await generatePuterEvolutionCode(userText, language, subject);
      if (!generatedCode) return;
      const data = await fetchJson("/personal-intelligence/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cloud_evolve_only: true,
          message: String(userText || ""),
          email: EMAIL,
          language: language,
          subject: subject,
          title: "Personal Intelligence",
          history: getRecentHistory(HISTORY_BACKEND_WINDOW),
          known_facts: knownFacts,
          puter_reply: {
            answer: String(puterAnswer || ""),
            model: getPIModel(),
          },
          puter_generated_code: generatedCode,
          puter_model: getPIModel(),
          schema_candidates: toSchemaCandidatesFromUpdates(updates),
          memory_updates: updates && typeof updates === "object" ? updates : {},
          memory_context: buildLongTermMemoryContext(),
        }),
      });
      dbg("cloud evolution sync", data && data.cloud_evolution ? data.cloud_evolution : data);
      renderEvolutionStatus(data);
    } catch (e) {
      dbg("cloud evolution sync failed", e && e.message);
    }
  }

  function signatureForAutoEvolution(text, updates) {
    const t = String(text || "").trim().toLowerCase().slice(0, 300);
    const u = updates && typeof updates === "object" ? updates : {};
    return t + "::" + JSON.stringify(u);
  }

  async function sendLocalEvolutionFromPuter(userText, generatedCode, updates) {
    try {
      const localEvolutionEnabled = String(localStorage.getItem("pi_local_evolution_enabled") || "false").trim().toLowerCase() === "true";
      if (!localEvolutionEnabled) return;
      if (!window.DesktopAssistant || !window.DesktopAssistant.startEvolution) return;
      if (!shouldTriggerCloudEvolution(userText, updates)) return;
      const now = Date.now();
      const sig = signatureForAutoEvolution(userText, updates);
      if (autoLocalEvolutionBusy) return;
      if (sig === autoLocalEvolutionLastSig && (now - autoLocalEvolutionLastAt) < 30000) return;
      autoLocalEvolutionBusy = true;
      autoLocalEvolutionLastSig = sig;
      autoLocalEvolutionLastAt = now;

      let out = await window.DesktopAssistant.startEvolution({
        file_path: "netlify/functions/personal_intelligence_evolution/Fact Evolution.json",
        instruction: "Update Fact Evolution JSON from latest personal facts.",
        fact_evolution: true,
        user_id: EMAIL,
        message: String(userText || ""),
        facts: updates && typeof updates === "object" ? updates : {},
        puter_generated_code: String(generatedCode || "").trim() || buildFallbackEvolutionCode(userText, updates),
        puter_model: getPIModel(),
        deploy_local: true,
        deploy_cloud: false,
      });
      if (out && !out.ok && /ENOTDIR/i.test(String(out.error || ""))) {
        // Fallback for edge path issues in stale desktop builds/filesystems.
        out = await window.DesktopAssistant.startEvolution({
          file_path: "netlify/functions/personal_intelligence_evolution/Fact_Evolution.json",
          instruction: "Update Fact Evolution JSON from latest personal facts.",
          fact_evolution: true,
          user_id: EMAIL,
          message: String(userText || ""),
          facts: updates && typeof updates === "object" ? updates : {},
          puter_generated_code: String(generatedCode || "").trim() || buildFallbackEvolutionCode(userText, updates),
          puter_model: getPIModel(),
          deploy_local: true,
          deploy_cloud: false,
        });
      }
      const schemaCandidates = toSchemaCandidatesFromUpdates(updates);
      if (schemaCandidates.length > 0) {
        const schemaOut = await window.DesktopAssistant.startEvolution({
          file_path: "netlify/functions/personal_intelligence_evolution/Fact Schema.json",
          instruction: "Update Fact Schema JSON with new custom personal fact keys.",
          fact_schema: true,
          schema_candidates: schemaCandidates,
          puter_model: getPIModel(),
          deploy_local: true,
          deploy_cloud: false,
        });
        dbg("local schema evolution result", schemaOut);
      }
      dbg("local evolution result", out);
      if (out && out.skipped) {
        addLog("assistant", "Tutor: Fact already exists. Skipped duplicate update.");
      } else if (out && out.ok) {
        addLog("assistant", "Tutor: Local evolution updated Fact Evolution.json");
      } else {
        addLog("assistant", "Tutor: Local evolution did not write code (" + String((out && (out.error || out.stage)) || "unknown") + ").");
      }
    } catch (e) {
      dbg("local evolution failed", e && e.message);
      addLog("assistant", "Tutor: Local evolution failed (" + String((e && e.message) || "unknown") + ").");
    } finally {
      autoLocalEvolutionBusy = false;
    }
  }

  async function triggerAutoEvolutionLocalAndCloud(userText, puterAnswer) {
    try {
      let updates = detectMemoryUpdatesLocal(userText);
      const inferred = await inferAdditionalFactsWithPuter(userText, updates);
      const memorySnapshot = await inferModelMemoryFactsWithPuter(userText, puterAnswer, Object.assign({}, updates, inferred));
      updates = Object.assign({}, updates, inferred, memorySnapshot);
      if (!shouldTriggerCloudEvolution(userText, updates)) return;
      const language = localStorage.getItem("g9_language") || "English";
      const subject = localStorage.getItem("g9_subject") || "General";
      const generatedCode = await generatePuterEvolutionCode(userText, language, subject);
      if (!generatedCode) return;
      await sendLocalEvolutionFromPuter(userText, generatedCode, updates);
      await sendCloudEvolutionFromPuter(userText, puterAnswer, generatedCode, updates);
    } catch (e) {
      dbg("auto evolution trigger failed", e && e.message);
    }
  }

  async function playTutorTTS(text) {
    if (!visCanOperateAI()) {
      visPendingResponse = {
        answer: String(text || ""),
        speakText: String(text || ""),
        ts: Date.now(),
      };
      scheduleVisProfileSave();
      return;
    }
    stopTutorAudio();
    try {
      await primeAudioPlayback();
      const cleanedText = String(text || "").replace(/\s+/g, " ").trim();
      visSpeechState = {
        active: false,
        text: cleanedText,
        started_at_ms: 0,
        provider: "audio_element",
      };
      const voiceOptions = getSelectedPuterVoiceOptions();
      const out = await requestPuterTts(cleanedText, voiceOptions);
      const normalized = normalizePuterTtsSource(out);
      if (!normalized || !normalized.src) throw new Error("PUTER_EMPTY_AUDIO");
      const url = normalized.src;
      tutorAudio = new Audio(url);
      tutorAudio.__revoke = !!normalized.revoke;
      tutorAudio.preload = "auto";
      tutorAudio.playsInline = true;
      stopSpeakerAnalyser();
      connectSpeakerAnalyserForAudioElement(tutorAudio);
      tutorAudio.onplay = function () {
        visSpeechState.active = true;
        visSpeechState.started_at_ms = Date.now();
        setAssistantState("speaking", "Speaking");
      };
      tutorAudio.onended = function () {
        visSpeechState = { active: false, text: "", started_at_ms: 0, provider: "" };
        setAssistantState("listening", "Listening");
        armIdleTimer();
        try { if (tutorAudio && tutorAudio.__revoke) URL.revokeObjectURL(url); } catch (e) {}
      };
      try {
        await tutorAudio.play();
      } catch (playErr) {
        const msg = String((playErr && playErr.message) || "").toLowerCase();
        if ((playErr && playErr.name === "NotAllowedError") || msg.includes("not allowed") || msg.includes("user agent")) {
          throw new Error("Audio playback blocked on this device. Tap the Tutor orb once, allow media/mic, then try again.");
        }
        throw playErr;
      }
    } catch (e) {
      dbg("Puter TTS failed, fallback to browser TTS", e && e.message);
      addLog("assistant", "Tutor: Voice engine fallback (" + String((e && e.message) || "TTS error") + ").");
      try {
        const u = new SpeechSynthesisUtterance(String(text || ""));
        u.onstart = function () {
          visSpeechState = {
            active: true,
            text: String(text || ""),
            started_at_ms: Date.now(),
            provider: "speech_synthesis",
          };
          setAssistantState("speaking", "Speaking");
        };
        u.onend = function () {
          visSpeechState = { active: false, text: "", started_at_ms: 0, provider: "" };
          setAssistantState("listening", "Listening");
          armIdleTimer();
        };
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
      } catch (e2) {
        const blocked = String((e2 && e2.message) || "").toLowerCase();
        if (blocked.includes("not allowed") || blocked.includes("user agent")) {
          addLog("assistant", "Tutor: iPhone blocked audio. Tap the orb once and allow permissions, then speak again.");
        }
        setAssistantState("idle", "Idle");
      }
    }
  }
  async function runTutorResponseForText(text) {
    const t = String(text || "").trim();
    if (!t || !enabled || !visCanOperateAI()) return;
    setAssistantState("thinking", "Thinking");
    showTypingIndicator();
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
            history: getRecentHistory(HISTORY_BACKEND_WINDOW),
            known_facts: knownFacts,
            mode: mode,
            memory_context: buildLongTermMemoryContext(),
            system_prompt: buildTutorSystemPrompt(mode, language, subject, knownFacts),
          }),
        });
        const actionAnswer = actionData && actionData.answer ? String(actionData.answer) : "I did not get that. Please try again.";
        const actionSpeakText = buildSpeakText(actionAnswer);
        if (!visCanOperateAI()) {
          visPendingResponse = { answer: actionAnswer, speakText: actionSpeakText, ts: Date.now() };
          scheduleVisProfileSave();
          hideTypingIndicator();
          return;
        }
        hideTypingIndicator();
        addLog("assistant", "Tutor: " + actionAnswer);
        pushHistory("assistant", actionAnswer);
        if (actionData && actionData.learned_facts) mergeKnownFacts(actionData.learned_facts);
        if (actionData && actionData.memory_updates) mergeKnownFacts(actionData.memory_updates);
        if (actionData && actionData.action) executeAssistantAction(actionData.action);
        renderEvolutionStatus(actionData);
        dbg("AI provider:", "local_action", "ok:", true);
        await playTutorTTS(actionSpeakText);
        return;
      }

      await ensurePuterReady(false);
      const model = getPIModel();
      const recent = getRecentHistory(HISTORY_MODEL_WINDOW);
      const memoryContext = buildLongTermMemoryContext();
      const chatMessages = [
        { role: "system", content: buildTutorSystemPrompt(mode, language, subject, knownFacts) + "\nConversation mode: " + mode + (memoryContext ? ("\n\nLong-term memory context:\n" + memoryContext) : "") },
      ].concat(recent).concat([{ role: "user", content: t }]);

      const puterResp = await window.puter.ai.chat(chatMessages, { model: model });
      const answer = extractPuterText(puterResp) || "I did not get that. Please try again.";
      const speakText = buildSpeakText(answer);
      if (!visCanOperateAI()) {
        visPendingResponse = { answer: answer, speakText: speakText, ts: Date.now() };
        scheduleVisProfileSave();
        hideTypingIndicator();
        return;
      }
      hideTypingIndicator();
      addLog("assistant", "Tutor: " + answer);
      pushHistory("assistant", answer);
      dbg("AI provider:", "puter", "ok:", true, "model:", model);
      triggerAutoEvolutionLocalAndCloud(t, answer);
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
            history: getRecentHistory(HISTORY_BACKEND_WINDOW),
            known_facts: knownFacts,
            mode: detectSupportMode(t),
            memory_context: buildLongTermMemoryContext(),
            system_prompt: buildTutorSystemPrompt(detectSupportMode(t), localStorage.getItem("g9_language") || "English", localStorage.getItem("g9_subject") || "General", knownFacts),
          }),
        });
        const answer = data && data.answer ? String(data.answer) : "I did not get that. Please try again.";
        const speakText = buildSpeakText(answer);
        if (!visCanOperateAI()) {
          visPendingResponse = { answer: answer, speakText: speakText, ts: Date.now() };
          scheduleVisProfileSave();
          hideTypingIndicator();
          return;
        }
        hideTypingIndicator();
        addLog("assistant", "Tutor: " + answer);
        pushHistory("assistant", answer);
        if (data && data.learned_facts) mergeKnownFacts(data.learned_facts);
        if (data && data.memory_updates) mergeKnownFacts(data.memory_updates);
        if (data && data.action) executeAssistantAction(data.action);
        renderEvolutionStatus(data);
        await playTutorTTS(speakText);
      } catch (e2) {
        hideTypingIndicator();
        addLog("assistant", "Tutor: Request failed. Please try again.");
        setAssistantState("idle", "Idle");
      }
    } finally {
      hideTypingIndicator();
    }
  }

  async function flushPiBatch(reason) {
    if (pendingPiFlushBusy) {
      pendingPiFlushAgain = true;
      return;
    }
    if (!enabled || !visCanOperateAI()) return;
    clearPiBatchTimer();
    if (!pendingPiMessages.length) return;

    pendingPiFlushBusy = true;
    const batch = pendingPiMessages.slice(0, PI_BATCH_MAX_MESSAGES);
    pendingPiMessages = pendingPiMessages.slice(batch.length);
    const combined = batch.map(function (m) { return String(m.text || ""); }).join("\n");

    try {
      if (batch.length > 1) {
        addLog("assistant", "Tutor: Processing " + String(batch.length) + " queued messages together.");
      }
      await runTutorResponseForText(combined);
    } finally {
      pendingPiFlushBusy = false;
      const needsAgain = pendingPiFlushAgain;
      pendingPiFlushAgain = false;
      if (pendingPiMessages.length >= PI_BATCH_MAX_MESSAGES || needsAgain) {
        flushPiBatch("max_or_again");
      } else if (pendingPiMessages.length) {
        schedulePiBatchFlush();
      }
    }
  }

  async function askTutorText(text) {
    const t = String(text || "").trim();
    if (!t || !enabled || !visCanOperateAI()) return;
    addLog("user", "You: " + t);
    pushHistory("user", t);
    mergeKnownFacts(detectMemoryUpdatesLocal(t));
    pendingPiMessages.push({ text: t, at: Date.now() });

    if (pendingPiMessages.length >= PI_BATCH_MAX_MESSAGES) {
      flushPiBatch("max_messages");
      return;
    }
    schedulePiBatchFlush();
    setAssistantState("listening", "Listening");
    armIdleTimer();
  }

  async function startServerListening() {
    if (!enabled || !visCanOperateAI()) return;
    const host = String(location.hostname || "").toLowerCase();
    const isLocal = host === "localhost" || host === "127.0.0.1";
    if (!window.isSecureContext && !isLocal) {
      addLog("assistant", "Tutor: Microphone needs HTTPS on iPhone/Chrome. Open the secure site URL and try again.");
      setAssistantState("idle", "Idle");
      return;
    }
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
            if (!visCanOperateAI()) {
              pendingPiMessages.push({ text: String(text), at: Date.now(), source: "stt_paused_resume" });
              scheduleVisProfileSave();
              setAssistantStateForVisOffline("Offline - no face");
              return;
            }
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
      const em = String((e && e.message) || "").toLowerCase();
      if ((e && e.name === "NotAllowedError") || em.includes("denied") || em.includes("not allowed")) {
        addLog("assistant", "Tutor: Microphone permission denied. In iPhone Settings > Chrome > Microphone, allow access.");
      } else {
        addLog("assistant", "Tutor: Microphone access is blocked.");
      }
      stopServerRecorder();
      setAssistantState("idle", "Idle");
    }
  }

  function startListening() {
    if (!enabled || !visCanOperateAI()) return;
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

  tabBtn.addEventListener("click", async function () {
    await primeAudioPlayback();
    setEnabled(!enabled);
    if (enabled) {
      if (uiMode === "voice" && visCanOperateAI()) startListening();
    }
  });

  closeBtn.addEventListener("click", function () {
    setEnabled(false);
  });

  if (orbBtn) {
    orbBtn.addEventListener("click", async function () {
      await primeAudioPlayback();
      setUIMode("voice");
      if (!visCanOperateAI()) {
        addLog("assistant", "Tutor: Visual identity not active yet. Look at the camera to continue.");
        return;
      }
      startListening();
    });
  }

  if (modeToggleBtn) {
    modeToggleBtn.style.display = "none";
  }

  if (textSendBtn && textInputEl) {
    textSendBtn.addEventListener("click", function () {
      const v = String(textInputEl.value || "").trim();
      if (!v) return;
      textInputEl.value = "";
      setUIMode("text");
      askTutorText(v);
    });
    textInputEl.addEventListener("keydown", function (ev) {
      if (!ev || ev.key !== "Enter") return;
      ev.preventDefault();
      const v = String(textInputEl.value || "").trim();
      if (!v) return;
      textInputEl.value = "";
      askTutorText(v);
    });
  }

  if (textMicBtn) {
    textMicBtn.addEventListener("click", async function () {
      await primeAudioPlayback();
      setUIMode("voice");
      if (!enabled) setEnabled(true);
      if (!visCanOperateAI()) {
        addLog("assistant", "Tutor: Waiting for face recognition before voice mode.");
        return;
      }
      startListening();
    });
  }

  if (voiceControlBtns && voiceControlBtns.length) {
    voiceControlBtns.forEach(function (btn) {
      btn.addEventListener("click", async function () {
        const action = String(btn.getAttribute("data-vc") || "");
        if (action === "text") {
          setUIMode("voice");
          return;
        }
        if (action === "end") {
          setEnabled(false);
          return;
        }
        if (action === "mute") {
          stopTutorAudio();
          addLog("assistant", "Tutor: Voice output muted.");
          return;
        }
      });
    });
  }

  // Runtime controls so model/tts can be changed later without code edits.
  window.PersonalIntelligenceConfig = {
    getModel: function () { return getPIModel(); },
    setModel: function (model) { return setPIModel(model); },
    getVoiceId: function () { return getSelectedVoiceId(); },
    setVoiceId: function (voiceId) { return setSelectedVoiceId(voiceId); },
  };
  window.VisualIntelligenceDiagnostics = {
    getStatus: function () {
      return {
        enabled: !!enabled,
        vis_runtime_loaded: !!(window.PI_VIS_RUNTIME && typeof window.PI_VIS_RUNTIME.createRuntime === "function"),
        vis_runtime_active: !!visRuntime,
        vis_can_operate_ai: !!visCanOperateAI(),
        vis_offline: !!visOffline,
        vis_last_offline_reason: String(visLastOfflineReason || ""),
        vis_active_profile_file: visActiveProfile && visActiveProfile.file_name ? String(visActiveProfile.file_name) : "",
        vis_active_username: String(visLastKnownUserLabel || ""),
        vis_recognition_index_size: Array.isArray(visRecognitionIndex) ? visRecognitionIndex.length : 0,
        vis_pending_response: !!visPendingResponse,
        vis_pending_user_messages: Array.isArray(pendingPiMessages) ? pendingPiMessages.length : 0,
        vis_behavior_configuration: Object.assign({}, visBehaviorConfig || {}),
        vis_personalization_profile: Object.assign({}, visPersonalizationProfile || {}),
        vis_speech_state: Object.assign({}, visSpeechState || {}),
      };
    },
    forceOpenSetup: function () {
      if (visRuntime && visRuntime.openSetup) {
        visRuntime.openSetup();
        return true;
      }
      openVisSetup();
      return true;
    },
    forceRefreshIndex: async function () {
      const rows = await loadVisProfilesFromCloud();
      if (visRuntime && visRuntime.refreshIndex) {
        try { await visRuntime.refreshIndex(); } catch (e) {}
      }
      return Array.isArray(rows) ? rows.length : 0;
    },
  };

  loadMemory();
  initCloudMemorySync();
  initPISettingsSelectors().catch(function (e) { dbg("init PI settings selectors failed", e && e.message); });
  if (textSendBtn) textSendBtn.style.display = "none";
  if (textInputEl) textInputEl.style.display = "none";
  if (textMicBtn) textMicBtn.style.display = "none";
  if (voiceControlBtns && voiceControlBtns.length) {
    voiceControlBtns.forEach(function (btn) {
      if (String(btn.getAttribute("data-vc") || "") === "text") {
        btn.style.display = "none";
      }
    });
  }
  setUIMode("voice");
  setEnabled(true);
  initVisualIntelligenceSystem().catch(function (e) {
    dbg("VIS init failed", e && e.message);
    setAssistantStateForVisOffline("Offline - VIS init failed");
  });
  try {
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  } catch (e) {}
})();
