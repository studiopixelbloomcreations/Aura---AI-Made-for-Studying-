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
  const WAKE_WORD_RE = /\b(hey\s+aevra(?:\s+ai)?|aevra(?:\s+ai)?)\b/i;
  const PI_MODEL_KEY = "pi_model";
  const PI_MODEL_DEFAULT = "gemini-3-pro-preview";
  const PI_TTS_VOICE_KEY = (window.PuterVoiceCatalog && window.PuterVoiceCatalog.storageKey) ? String(window.PuterVoiceCatalog.storageKey) : "g9_tts_voice";
  const PI_TTS_VOICE_DEFAULT = (window.PuterVoiceCatalog && window.PuterVoiceCatalog.defaultId) ? String(window.PuterVoiceCatalog.defaultId) : "openai:alloy";
  const PI_MODEL_OPTIONS_FALLBACK = [
    { id: "openai/gpt-4o-mini", label: "GPT-4o Mini (Fallback)" },
    { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash (Fallback)" },
    { id: "anthropic/claude-3-5-haiku", label: "Claude 3.5 Haiku (Fallback)" },
  ];
  const MEMORY_KEY = "personal_intelligence_memory_v1";
  const HISTORY_KEY = "personal_intelligence_history_v1";
  const HISTORY_MAX_ITEMS = 3000;
  const HISTORY_RETENTION_DAYS = 3650; // ~10 years
  const HISTORY_MODEL_WINDOW = 120;
  const HISTORY_BACKEND_WINDOW = 120;
  const VIS_PROFILE_EXTENSION = ".piuser.json";
  const VIS_RECOGNITION_THRESHOLD = 0.5;
  const VIS_MATCH_STABLE_COUNT = 5;
  const VIS_FACE_LOST_MS = 700;
  const VIS_ENROLL_FRAME_DELAY_MS = 140;
  const VIS_CAPTURE_MAX_WIDTH = 960;
  const VIS_LIGHTING_MIN_LUMA = 0.22;
  const VIS_SCAN_INTERVAL_MS = 180;
  const VIS_BACKEND_BUSY_RETRY_MS = 30000;
  const VIS_RECOGNITION_HOLD_MS = 2500;
  const VIS_ENROLL_GUIDANCE_BUCKETS = ["center", "left", "right", "up", "down", "close"];
  const VIS_ENROLL_CAPTURE_DELAY_MS = 220;
  const VIS_TEST_MAX_TRIES = 45;
  const VIS_TEST_STABLE_COUNT = 1;
  const VIS_TEST_FRAME_DELAY_MS = 80;
  const VIS_SETUP_RETRIEVE_MAX_TRIES = 20;
  const VIS_SETUP_RETRIEVE_DELAY_MS = 900;
  const VIS_PROFILE_DOC_LIMIT = 100;
  const VIS_FACE_PROCESS_ENDPOINT = "/process-face";
  const VIS_FACE_REGISTER_ENDPOINT = "/register-user";
  const VIS_ACTIVE_FACE_ENGINE = "faceapi";
  const VIS_CAMERA_DISABLED = true;
  const VIS_FACE_API_SCRIPT_URL = "https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js";
  const VIS_FACE_API_MODEL_URL = "https://justadudewhohacks.github.io/face-api.js/models";
  const VIS_FACE_API_MIN_CONFIDENCE = 0.5;
  const VIS_FACE_API_MATCH_DISTANCE = 0.58;
  const VIS_ENROLL_MIN_CONFIDENCE = 0.5;
  const VIS_ENROLL_MIN_STABLE_SAMPLES = 8;
  const VIS_ENROLL_STABILITY_WINDOW = 6;
  const VIS_ENROLL_MAX_AVG_DISTANCE = 0.24;
  function isOffline() {
    return window.__OFFLINE_MODE__ === true || navigator.onLine === false;
  }

  function isVisMockMode() {
    try {
      return new URLSearchParams(window.location.search || "").get("visMock") === "1";
    } catch (e) {
      return false;
    }
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getAuthIdentity() {
    try {
      if (window.Auth && typeof window.Auth.getUser === "function") {
        const user = window.Auth.getUser();
        if (user && (user.uid || user.email)) {
          return {
            user_id: String(user.uid || user.email || "").trim(),
            email: String(user.email || "").trim(),
            name: String(user.name || "").trim(),
            avatar: String(user.photoURL || "").trim(),
          };
        }
      }
    } catch (e) {}
    const email = String(localStorage.getItem("g9_email") || EMAIL).trim();
    return email ? { user_id: email, email: email, name: "", avatar: "", guest: email === EMAIL } : null;
  }

  function buildAuthBackedProfile(identity, remoteProfile) {
    const source = remoteProfile && typeof remoteProfile === "object" ? remoteProfile : {};
    const personalization = source.personalization_data && typeof source.personalization_data === "object"
      ? source.personalization_data
      : {};
    const aiConfig = source.ai_config && typeof source.ai_config === "object"
      ? source.ai_config
      : {};
    const onboardingAnswers = Object.assign({}, personalization.onboarding_answers || {});
    const preferredName = String(
      onboardingAnswers.preferred_name ||
      (source.user_identity && source.user_identity.preferred_name) ||
      (source.learned_preferences && source.learned_preferences.preferred_name) ||
      (source.learned_preferences && source.learned_preferences.name) ||
      (personalization.identity_snapshot && personalization.identity_snapshot.name) ||
      (identity && identity.name) ||
      ""
    ).trim();
    const fullName = String(
      onboardingAnswers.full_name ||
      (source.user_identity && source.user_identity.full_name) ||
      (source.learned_preferences && source.learned_preferences.full_name) ||
      (identity && identity.name) ||
      ""
    ).trim();
    const username = String((identity && (identity.name || identity.email || identity.user_id)) || "user").trim() || "user";
    const fileName = String(identity && identity.user_id ? identity.user_id : username).replace(/[^a-zA-Z0-9._-]+/g, "_") + VIS_PROFILE_EXTENSION;
    const agentReady = Object.keys(onboardingAnswers).length >= VIS_PERSONALIZE_QUESTIONS.length;
    return {
      file_name: fileName,
      profile_version: 2,
      user_identity: {
        username: String(identity && identity.user_id || username),
        display_name: String(preferredName || fullName || (identity && (identity.name || identity.email || identity.user_id)) || username),
        preferred_name: preferredName,
        full_name: fullName,
        account_user_id: String(identity && identity.user_id || ""),
        email: String(identity && identity.email || ""),
        avatar: String(identity && identity.avatar || ""),
      },
      personalization_profile: Object.assign({}, personalization),
      ai_behavior_configuration: Object.assign({}, aiConfig),
      learned_preferences: Object.assign({}, personalization && personalization.memory && personalization.memory.known_facts || {}, {
        name: preferredName || fullName || "",
        preferred_name: preferredName || "",
        full_name: fullName || "",
        formal_name: fullName || "",
      }),
      conversation_memory: {
        history: [],
        important_facts: Object.assign({}, personalization && personalization.memory && personalization.memory.known_facts || {}),
      },
      personal_intelligence_agent: {
        status: agentReady ? "ready" : "pending",
        provider: "auth_identity",
        personalization_answers: onboardingAnswers,
        unique_identifier: String(source.unique_id || ""),
        tailored_agent: Object.assign({}, source.personal_intelligence_agent && source.personal_intelligence_agent.tailored_agent || {}, {
          preferred_name: preferredName,
          full_name: fullName,
          interests: Array.isArray(personalization.interests) ? personalization.interests.slice(0, 12) : [],
          goals: Array.isArray(personalization.goals) ? personalization.goals.slice(0, 12) : [],
          tone: String((aiConfig && aiConfig.tone) || "").trim(),
          communication_style: String((aiConfig && aiConfig.communication_style) || "").trim(),
          response_identity_rules: {
            casual_name: preferredName || fullName || "",
            formal_name: fullName || preferredName || "",
          },
        }),
      },
      session_state: Object.assign({}, source.session_state || {}, {
        paused: false,
        assistant_state: "listening",
      }),
    };
  }

  function getVisProfileNames(profile) {
    const p = profile && typeof profile === "object" ? profile : {};
    const agent = p.personal_intelligence_agent && typeof p.personal_intelligence_agent === "object" ? p.personal_intelligence_agent : {};
    const answers = agent.personalization_answers && typeof agent.personalization_answers === "object" ? agent.personalization_answers : {};
    const userIdentity = p.user_identity && typeof p.user_identity === "object" ? p.user_identity : {};
    const prefs = p.learned_preferences && typeof p.learned_preferences === "object" ? p.learned_preferences : {};
    return {
      preferred_name: String(
        answers.preferred_name ||
        userIdentity.preferred_name ||
        prefs.preferred_name ||
        prefs.name ||
        userIdentity.display_name ||
        ""
      ).trim(),
      full_name: String(
        answers.full_name ||
        userIdentity.full_name ||
        prefs.full_name ||
        ""
      ).trim(),
    };
  }

  function getVisDisplayName(profile) {
    const names = getVisProfileNames(profile);
    const p = profile && typeof profile === "object" ? profile : {};
    return String(
      names.preferred_name ||
      names.full_name ||
      (p.user_identity && p.user_identity.display_name) ||
      (p.user_identity && p.user_identity.username) ||
      p.file_name ||
      "Unknown"
    ).trim() || "Unknown";
  }

  function buildTailoredAgentSnapshot(profile, answers) {
    const p = profile && typeof profile === "object" ? profile : {};
    const sourceAnswers = answers && typeof answers === "object"
      ? answers
      : ((p.personal_intelligence_agent && p.personal_intelligence_agent.personalization_answers) || {});
    return {
      unique_id: String((p.personal_intelligence_agent && p.personal_intelligence_agent.unique_identifier) || "").trim(),
      preferred_name: String(sourceAnswers.preferred_name || "").trim(),
      full_name: String(sourceAnswers.full_name || "").trim(),
      interests: parseCsvList(sourceAnswers.interests),
      goals: parseCsvList(sourceAnswers.goals),
      favorite_subjects: parseCsvList(sourceAnswers.favorite_subjects),
      learning_style: String(sourceAnswers.learning_style || "").trim(),
      preferred_tone: String(sourceAnswers.preferred_tone || "").trim(),
      hobbies: parseCsvList(sourceAnswers.hobbies),
      timezone_or_city: String(sourceAnswers.timezone_or_city || "").trim(),
      preferred_language: String(sourceAnswers.preferred_language || "").trim(),
      response_identity_rules: {
        casual_name: String(sourceAnswers.preferred_name || sourceAnswers.full_name || "").trim(),
        formal_name: String(sourceAnswers.full_name || sourceAnswers.preferred_name || "").trim(),
      },
    };
  }
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
  let visProcessingCanvas = null;
  let visAgentContext = null;
  let visSetupEl = null;
  let visDetector = null;
  let visDetectorUnsupported = false;
  let visRuntime = null;
  let visMonitorTimer = null;
  let visDetectBusy = false;
  let visFacePresent = false;
  let visOffline = true;
  let visSetupOpen = false;
  let visEnrollmentSubmitting = false;
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
  let visLastRecognitionAt = 0;
  let visTestEl = null;
  let visPersonalizeEl = null;
  let visDebugPreviewEl = null;
  let visDebugPreviewOpen = false;
  let visVerificationBusy = false;
  let visVerificationProfile = null;
  let visAllowTestingStage = false;
  let visRecognizingSince = 0;
  let visCameraInputs = [];
  let visCameraInputIndex = -1;
  let visLastCameraSwitchAt = 0;
  const VIS_CAMERA_SWITCH_COOLDOWN_MS = 3000;
  let visCurrentCameraScanStartedAt = 0;
  const VIS_CAMERA_SCAN_PER_INPUT_MS = 3000;
  let visLastCameraReadyAttemptAt = 0;
  const VIS_CAMERA_READY_RETRY_MS = 2000;
  let visScanLoopTimer = null;
  let visProfileSaveTimer = null;
  let visExpectedProfileFile = "";
  let visRecentPersonalizationFile = "";
  let visRecentPersonalizationAt = 0;
  let visUnknownFaceSince = 0;
  const VIS_DISABLE_EXTERNAL_RUNTIME = true;
  let visBackendRequestBusy = false;
  let visBackendBackoffUntil = 0;
  let visLastBackendError = "";
  let visFaceApiLoadPromise = null;
  let visFaceApiReady = false;
  let visFaceApiExpressionReady = false;
  let visFaceApiExpressionPromise = null;
  let visFaceApiMatcher = null;
  let visFaceApiMatcherSignature = "";
  let visFaceApiLabelMap = {};
  let visLastFaceApiDetections = [];
  let visLivenessSamples = [];
  let visFaceApiStartupStartedAt = 0;
  let visLastFaceSeenAt = 0;
  let visLastEmotion = "neutral";
  let visLightingLow = false;
  let visLightingWarnAt = 0;
  let visLightingCanvas = null;
  let visTrackingState = {
    lastBox: null,
    lastEmbedding: null,
    lastDetectAt: 0,
    lastMultiFaceAt: 0,
    lastFaceCount: 0,
    lastLandmarkCount: 0,
    lastPoseHint: "",
  };
  let visSetupState = {
    step: 1,
    agreed: false,
    infrared: false,
    username: "",
    retrievalReady: false,
    retrievalMessage: "",
    pendingProfile: null,
    enrollmentCoverage: {},
    enrollmentInstruction: "",
    enrollmentCaptured: 0,
    enrollmentConfidence: 0,
    enrollmentStable: false,
  };
  let visPersonalizeOpen = false;
  let visPersonalizeState = {
    loading: false,
    profile: null,
    answers: {},
  };
  const VIS_PERSONALIZE_QUESTIONS = [
    { id: "preferred_name", label: "What should I call you?", placeholder: "Your preferred name", type: "text" },
    { id: "full_name", label: "Full name (for formal moments)", placeholder: "Full name", type: "text" },
    { id: "interests", label: "Top 3 interests", placeholder: "e.g., robotics, music, football", type: "text" },
    { id: "favorite_subjects", label: "Favorite subjects", placeholder: "e.g., ICT, Math, Biology", type: "text" },
    { id: "goals", label: "Goals for the next 3 months", placeholder: "e.g., improve grades, learn coding", type: "text" },
    { id: "learning_style", label: "How do you learn best?", placeholder: "e.g., visuals, step-by-step, examples", type: "text" },
    { id: "preferred_tone", label: "Preferred tone", placeholder: "e.g., calm, energetic, direct", type: "text" },
    { id: "hobbies", label: "Hobbies / after-school activities", placeholder: "e.g., gaming, cricket, art", type: "text" },
    { id: "timezone_or_city", label: "City or time zone", placeholder: "e.g., Colombo, UTC+05:30", type: "text" },
    { id: "preferred_language", label: "Preferred language", placeholder: "e.g., English, Sinhala, Tamil", type: "text" },
  ];
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
        <div class="pi-name">Aevra AI</div>
      </div>
      <div class="pi-top-status">
        <span class="pi-top-dot"></span>
        <span class="pi-top-label">LUMEN Active</span>
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
          <button class="pi-orb idle" type="button" aria-label="Activate Aevra AI">
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
          <button type="button" class="pi-vis-btn" data-vis-test="activate" hidden>Continue</button>
        </div>
      </div>
    </div>
    <div class="pi-vis-personalize-backdrop" hidden>
      <div class="pi-vis-personalize" role="dialog" aria-modal="true" aria-labelledby="piVisPersonalizeTitle">
        <div class="pi-vis-personalize-head">
          <div class="pi-vis-personalize-title" id="piVisPersonalizeTitle">Personalize Your Own Agent</div>
          <div class="pi-vis-personalize-subtitle">Answer 10 quick questions to build your unique Personal Intelligence.</div>
        </div>
        <div class="pi-vis-personalize-body"></div>
      </div>
    </div>
    <div class="pi-vis-debug-backdrop" hidden style="position:fixed;inset:0;z-index:10040;align-items:center;justify-content:center;padding:24px;background:rgba(2,6,23,0.62);backdrop-filter:blur(10px);">
      <div class="pi-vis-debug-panel" role="dialog" aria-modal="false" aria-labelledby="piVisDebugTitle" style="width:min(760px,92vw);max-height:min(88vh,920px);overflow:auto;background:rgba(6,13,27,0.96);border:1px solid rgba(96,165,250,0.35);border-radius:22px;box-shadow:0 24px 80px rgba(2,6,23,0.55);padding:18px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;">
          <div>
            <div id="piVisDebugTitle" style="font-size:18px;font-weight:700;color:#e2e8f0;">Camera Box Debug</div>
            <div style="font-size:13px;color:#94a3b8;">Live camera feed with backend face box and landmark overlay.</div>
          </div>
          <button type="button" class="pi-vis-btn ghost" data-vis-debug="close">Close</button>
        </div>
        <div class="pi-vis-camera-stage" style="position:relative;border-radius:18px;overflow:hidden;border:1px solid rgba(96,165,250,0.35);background:#020617;">
          <div class="pi-vis-camera-mount" style="position:relative;width:100%;aspect-ratio:4/3;min-height:320px;"></div>
        </div>
        <div class="pi-vis-note pi-vis-debug-meta" style="margin-top:12px;">Camera: waiting for stream...</div>
        <div class="pi-vis-note" style="margin-top:8px;">Run <code>ShowCameraBox()</code> in the browser console to open this view.</div>
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
  if (visVideoEl) {
    visVideoEl.style.transform = "scaleX(-1)";
    visVideoEl.style.transformOrigin = "center center";
    visVideoEl.style.backfaceVisibility = "hidden";
  }
  if (visCanvasEl) {
    visCanvasEl.style.transform = "scaleX(-1)";
    visCanvasEl.style.transformOrigin = "center center";
    visCanvasEl.style.backfaceVisibility = "hidden";
  }
  visSetupEl = panel.querySelector(".pi-vis-setup-backdrop");
  visTestEl = panel.querySelector(".pi-vis-test-backdrop");
  visPersonalizeEl = panel.querySelector(".pi-vis-personalize-backdrop");
  visDebugPreviewEl = panel.querySelector(".pi-vis-debug-backdrop");
  if (visTestEl) visTestEl.hidden = true;
  if (visDebugPreviewEl) visDebugPreviewEl.style.display = "none";
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

  function getVisProcessingCanvas() {
    if (!visProcessingCanvas) visProcessingCanvas = document.createElement("canvas");
    return visProcessingCanvas;
  }

  function getPreferredVisVideoConstraints(deviceId) {
    return {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      facingMode: deviceId ? undefined : "user",
      width: { ideal: 3840, max: 3840 },
      height: { ideal: 2160, max: 2160 },
      frameRate: { ideal: 30, max: 60 },
    };
  }

  function getActiveVisTrack() {
    if (!visVideoEl || !visVideoEl.srcObject || typeof visVideoEl.srcObject.getVideoTracks !== "function") return null;
    const tracks = visVideoEl.srcObject.getVideoTracks();
    return tracks && tracks.length ? tracks[0] : null;
  }

  function getVisCameraDiagnostics() {
    const track = getActiveVisTrack();
    const settings = track && typeof track.getSettings === "function" ? track.getSettings() : {};
    return {
      label: track && track.label ? String(track.label) : "Unknown camera",
      width: Number(settings.width || (visVideoEl && visVideoEl.videoWidth) || 0),
      height: Number(settings.height || (visVideoEl && visVideoEl.videoHeight) || 0),
      fps: Number(settings.frameRate || 0),
    };
  }

  function renderVisDebugCameraMeta() {
    if (!visDebugPreviewEl || visDebugPreviewEl.hidden) return;
    const metaEl = visDebugPreviewEl.querySelector(".pi-vis-debug-meta");
    if (!metaEl) return;
    const info = getVisCameraDiagnostics();
    const overlayText = "Overlay: " + String(visTrackingState.lastFaceCount || 0) + " face(s), " + String(visTrackingState.lastLandmarkCount || 0) + " landmarks" + (visTrackingState.lastPoseHint ? (", pose " + String(visTrackingState.lastPoseHint)) : "");
    const backendText = visLastBackendError ? (" | Backend: " + String(visLastBackendError)) : "";
    metaEl.textContent =
      "Camera: " + String(info.label || "Unknown") +
      " | Stream: " + String(info.width || 0) + "x" + String(info.height || 0) +
      (info.fps ? (" @ " + Math.round(info.fps) + "fps") : "") +
      " | " + overlayText +
      backendText;
  }

  function getCurrentVisCameraLabel() {
    const cam = Array.isArray(visCameraInputs) && visCameraInputIndex >= 0
      ? visCameraInputs[visCameraInputIndex]
      : null;
    if (cam && cam.label) return String(cam.label).trim();
    return "camera " + String(Math.max(1, visCameraInputIndex + 1));
  }

  function ensureVisPreviewMounted(container) {
    if (!visVideoEl || !visCanvasEl) return;
    const mount = container && container.querySelector ? container.querySelector(".pi-vis-camera-mount") : null;
    if (!mount) {
      if (visVideoEl.parentNode !== panel) panel.appendChild(visVideoEl);
      if (visCanvasEl.parentNode !== panel) panel.appendChild(visCanvasEl);
      visVideoEl.style.display = "none";
      visCanvasEl.style.display = "none";
      return;
    }
    if (visVideoEl.parentNode !== mount) mount.appendChild(visVideoEl);
    if (visCanvasEl.parentNode !== mount) mount.appendChild(visCanvasEl);
    visVideoEl.style.display = "block";
    visVideoEl.style.position = "absolute";
    visVideoEl.style.inset = "0";
    visVideoEl.style.width = "100%";
    visVideoEl.style.height = "100%";
    visVideoEl.style.objectFit = "cover";
    visVideoEl.style.borderRadius = "18px";
    visVideoEl.style.background = "#020617";
    visVideoEl.style.transform = "scaleX(-1)";
    visVideoEl.style.opacity = "1";
    visVideoEl.style.visibility = "visible";
    visVideoEl.style.zIndex = "1";
    visCanvasEl.style.display = "block";
    visCanvasEl.style.position = "absolute";
    visCanvasEl.style.inset = "0";
    visCanvasEl.style.width = "100%";
    visCanvasEl.style.height = "100%";
    visCanvasEl.style.pointerEvents = "none";
    visCanvasEl.style.borderRadius = "18px";
    visCanvasEl.style.transform = "scaleX(-1)";
    visCanvasEl.style.opacity = "1";
    visCanvasEl.style.visibility = "visible";
    visCanvasEl.style.left = "0";
    visCanvasEl.style.top = "0";
    visCanvasEl.style.zIndex = "2";
    try {
      Promise.resolve(visVideoEl.play()).catch(function () {});
    } catch (e) {}
    setTimeout(function () {
      try {
        Promise.resolve(visVideoEl.play()).catch(function () {});
      } catch (e) {}
      renderVisDebugCameraMeta();
    }, 120);
  }

  function syncVisPreviewMount() {
    if (visDebugPreviewOpen && visDebugPreviewEl && !visDebugPreviewEl.hidden) {
      const debugPanel = visDebugPreviewEl.querySelector(".pi-vis-debug-panel");
      ensureVisPreviewMounted(debugPanel);
      return;
    }
    if (visSetupOpen && visSetupState.step === 4 && visSetupEl) {
      const body = visSetupEl.querySelector(".pi-vis-setup-body");
      ensureVisPreviewMounted(body);
      return;
    }
    ensureVisPreviewMounted(null);
  }

  async function openVisDebugPreview() {
    if (!visDebugPreviewEl) return false;
    const ready = await ensureVisCameraReady();
    visDebugPreviewOpen = true;
    visDebugPreviewEl.hidden = false;
    visDebugPreviewEl.style.display = "flex";
    syncVisPreviewMount();
    renderVisDebugCameraMeta();
    return ready;
  }

  function closeVisDebugPreview() {
    visDebugPreviewOpen = false;
    if (visDebugPreviewEl) {
      visDebugPreviewEl.hidden = true;
      visDebugPreviewEl.style.display = "none";
    }
    syncVisPreviewMount();
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
        if (visSetupState.step === 6) {
          if (!visSetupState.retrievalReady || !visSetupState.pendingProfile) return;
          visAllowTestingStage = true;
          closeVisSetup();
          startVisVerificationStage(visSetupState.pendingProfile);
          return;
        }
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
          switchToVisProfile(visVerificationProfile).then(function () {
            if (!hasVisPersonalAgent(visVerificationProfile)) {
              openVisPersonalize(visVerificationProfile);
              return;
            }
            ensureVisPersonalAgent(visVerificationProfile, "post_test");
          });
        }
      }
    });
  }
  if (visPersonalizeEl) {
    visPersonalizeEl.addEventListener("click", function (ev) {
      const btn = ev && ev.target && ev.target.closest ? ev.target.closest("[data-vis-personalize]") : null;
      if (!btn) return;
      const action = String(btn.getAttribute("data-vis-personalize") || "").trim().toLowerCase();
      if (action === "submit") {
        submitVisPersonalize();
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

  function updateVisExpectedProfile() {
    const hints = getSignedInIdentityHints();
    const username = sanitizeVisUsername(hints.username || "");
    if (!username || !Array.isArray(visRecognitionIndex)) {
      visExpectedProfileFile = "";
      return "";
    }
    const fileCandidate = username + VIS_PROFILE_EXTENSION;
    let match = visRecognitionIndex.find(function (r) {
      return r && (String(r.profileFile || "") === fileCandidate || String(r.username || "") === username);
    });
    if (!match) {
      match = visRecognitionIndex.find(function (r) {
        return r && String(r.profileFile || "").toLowerCase().startsWith(username);
      });
    }
    visExpectedProfileFile = match ? String(match.profileFile || "") : "";
    return visExpectedProfileFile;
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
    if (!out.account_identifier) {
      try {
        const em = String(localStorage.getItem("g9_email") || "").trim();
        if (em) out.account_identifier = em;
      } catch (e) {}
    }
    if (!out.username) {
      try {
        const em2 = String(localStorage.getItem("g9_email") || "").trim();
        if (em2 && em2.includes("@")) out.username = em2.split("@")[0];
      } catch (e) {}
    }
    if (!out.username && out.account_identifier.includes("@")) {
      out.username = out.account_identifier.split("@")[0];
    }
    if (!out.account_identifier) out.account_identifier = getCurrentUid() || "local_guest";
    if (!out.username) out.username = "user_" + String(out.account_identifier || "local_guest").slice(0, 20);
    if (String(out.username).toLowerCase() === "anonymous_user") {
      out.username = "user_" + String(out.account_identifier || "local_guest").slice(0, 20);
    }
    return out;
  }

  async function createVisProfileArtifactInRepo(profile) {
    if (!profile || !profile.file_name) return { ok: false, skipped: true, reason: "missing_profile" };
    if (VIS_CAMERA_DISABLED) return { ok: false, skipped: true, reason: "camera_runtime_disabled" };
    const fileName = String(profile.file_name || "").trim();
    const json = JSON.stringify(profile, null, 2) + "\n";
    // Web-first path: commit to GitHub via Netlify function.
    try {
      const cloudUrl = String(window.location.origin || "").replace(/\/$/, "") + "/vis/identity-profile-commit";
      const cloudResponse = await fetch(cloudUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_name: fileName,
          profile: profile,
          commit_message: "vis: save " + fileName,
        }),
      });
      const cloudOut = await cloudResponse.json().catch(function () { return {}; });
      if (!cloudResponse.ok) {
        throw new Error(String((cloudOut && (cloudOut.detail || cloudOut.error)) || "Request failed"));
      }
      if (cloudOut && cloudOut.ok) {
        pushVisDebug("Repo artifact committed (web): " + String(cloudOut.file_path || fileName));
        return cloudOut;
      }
    } catch (webErr) {
      pushVisDebug("Web repo commit failed: " + String((webErr && webErr.message) || webErr));
    }

    // Desktop fallback path if available.
    if (window.DesktopAssistant && window.DesktopAssistant.startEvolution) {
      const repoPath = "vis_identity_profiles/" + fileName;
      try {
        const out = await window.DesktopAssistant.startEvolution({
          file_path: repoPath,
          instruction: "Write VIS identity profile JSON artifact for enrolled user.",
          puter_generated_code: json,
          puter_model: "local_json_writer",
          deploy_local: true,
          deploy_cloud: true,
        });
        if (!out || !out.ok) {
          pushVisDebug("Desktop repo artifact write failed: " + String((out && (out.error || out.stage)) || "unknown"));
        } else {
          pushVisDebug("Desktop repo artifact written: " + repoPath);
        }
        return out || { ok: false };
      } catch (e) {
        pushVisDebug("Desktop repo artifact exception: " + String((e && e.message) || e));
      }
    }
    return { ok: false, skipped: true, reason: "no_web_or_desktop_commit_path" };
  }

  function visCanOperateAI() {
    const runtimeSetupOpen = !!(visRuntime && visRuntime.isSetupOpen && visRuntime.isSetupOpen());
    const testOpen = !!(visTestEl && !visTestEl.hidden);
    return !!(enabled && !visOffline && visActiveProfile && !visSetupOpen && !runtimeSetupOpen && !visScanning && !visVerificationBusy && !testOpen && !visPersonalizeOpen);
  }

  function maybeOpenVisSetupForFirstRun(reason) {
    return false;
  }

  function openVisTestStage(profile) {
    if (!visAllowTestingStage) return;
    if (!visTestEl) return;
    visVerificationProfile = profile || null;
    visVerificationBusy = true;
    visTestEl.hidden = false;
    const statusEl = visTestEl.querySelector(".pi-vis-test-status");
    const retryBtn = visTestEl.querySelector('[data-vis-test="retry"]');
    const activateBtn = visTestEl.querySelector('[data-vis-test="activate"]');
    if (statusEl) statusEl.textContent = "Testing stage started. Look at the camera for verification...";
    if (retryBtn) retryBtn.hidden = true;
    if (activateBtn) activateBtn.hidden = true;
  }

  function closeVisTestStage() {
    visVerificationBusy = false;
    visVerificationProfile = null;
    if (visTestEl) visTestEl.hidden = true;
    scheduleVisFrameLoop(250);
  }

  function hasVisPersonalAgent(profile) {
    const agent = profile && profile.personal_intelligence_agent ? profile.personal_intelligence_agent : null;
    if (!agent || typeof agent !== "object") return false;
    if (String(agent.status || "").toLowerCase() !== "ready") return false;
    const answers = agent.personalization_answers && typeof agent.personalization_answers === "object"
      ? agent.personalization_answers
      : {};
    const uniqueId = String(agent.unique_identifier || "").trim();
    const tailored = agent.tailored_agent && typeof agent.tailored_agent === "object" ? agent.tailored_agent : {};
    const preferredName = String(
      answers.preferred_name ||
      tailored.preferred_name ||
      (profile && profile.user_identity && profile.user_identity.preferred_name) ||
      ""
    ).trim();
    const fullName = String(
      answers.full_name ||
      tailored.full_name ||
      (profile && profile.user_identity && profile.user_identity.full_name) ||
      ""
    ).trim();
    const answerCountOk = Object.keys(answers).length >= VIS_PERSONALIZE_QUESTIONS.length;
    const namingOk = !!(preferredName || fullName);
    const tailoredOk = !!(
      tailored &&
      typeof tailored === "object" &&
      tailored.response_identity_rules &&
      typeof tailored.response_identity_rules === "object"
    );
    return !!(answerCountOk && uniqueId && namingOk && tailoredOk);
  }

  function getStoredPersonalizeAnswers(profile) {
    const p = profile && typeof profile === "object" ? profile : {};
    const agent = p.personal_intelligence_agent && typeof p.personal_intelligence_agent === "object"
      ? p.personal_intelligence_agent
      : {};
    const personalization = p.personalization_profile && typeof p.personalization_profile === "object"
      ? p.personalization_profile
      : {};
    const raw = Object.assign(
      {},
      personalization.onboarding_answers || {},
      agent.personalization_answers || {}
    );
    const out = {};
    VIS_PERSONALIZE_QUESTIONS.forEach(function (q) {
      out[q.id] = String(raw[q.id] || "").trim();
    });
    return out;
  }

  function hasRecentPersonalizationCompletion(profile) {
    const p = profile && typeof profile === "object" ? profile : {};
    const fileName = String(p.file_name || "").trim();
    if (fileName && visRecentPersonalizationFile === fileName && (Date.now() - visRecentPersonalizationAt) < 120000) {
      return true;
    }
    const completedAt = String(
      (p.session_state && p.session_state.personalization_completed_at) ||
      (p.personal_intelligence_agent && p.personal_intelligence_agent.personalization_completed_at) ||
      ""
    ).trim();
    if (!completedAt) return false;
    const stamp = Date.parse(completedAt);
    return Number.isFinite(stamp) && (Date.now() - stamp) < 120000;
  }

  function openVisPersonalize(profile) {
    if (!visPersonalizeEl) return;
    if (visPersonalizeOpen) return;
    if (isVisMockMode()) return;
    visPersonalizeOpen = true;
    visPersonalizeState = {
      loading: false,
      profile: profile || null,
      answers: getStoredPersonalizeAnswers(profile),
    };
    setAssistantStateForVisOffline("Personalization required");
    panel.classList.add("pi-vis-personalize-open");
    visPersonalizeEl.hidden = false;
    renderVisPersonalize();
  }

  function closeVisPersonalize() {
    visPersonalizeOpen = false;
    visPersonalizeState.loading = false;
    panel.classList.remove("pi-vis-personalize-open");
    if (visPersonalizeEl) visPersonalizeEl.hidden = true;
    scheduleVisFrameLoop(250);
  }

  function renderVisPersonalize() {
    if (!visPersonalizeEl) return;
    const body = visPersonalizeEl.querySelector(".pi-vis-personalize-body");
    if (!body) return;
    if (visPersonalizeState.loading) {
      body.innerHTML =
        '<div class="pi-vis-personalize-loading">' +
        '<div class="pi-vis-personalize-spinner"></div>' +
        '<div class="pi-vis-personalize-loading-title">Creating your Personal Intelligence...</div>' +
        '<div class="pi-vis-personalize-loading-note">Building your unique agent, saving your profile, and waiting for your unique identifier to come back. This screen stays here until that finishes.</div>' +
        "</div>";
      return;
    }
    const answers = visPersonalizeState.answers || {};
    const rows = VIS_PERSONALIZE_QUESTIONS.map(function (q, idx) {
      const val = answers[q.id] ? String(answers[q.id]) : "";
      return (
        '<label class="pi-vis-personalize-field" data-q="' + q.id + '">' +
          '<span class="pi-vis-personalize-label">' + String(idx + 1) + '. ' + q.label + "</span>" +
          '<input class="pi-vis-personalize-input" type="' + q.type + '" data-vis-answer="' + q.id + '" ' +
            'placeholder="' + String(q.placeholder || "") + '" value="' + val + '" required />' +
        "</label>"
      );
    }).join("");
    body.innerHTML =
      '<div class="pi-vis-personalize-progress">' +
        '<div class="pi-vis-personalize-progress-bar"><span></span></div>' +
        '<div class="pi-vis-personalize-progress-text">Complete all 10 to activate your agent.</div>' +
      "</div>" +
      '<form class="pi-vis-personalize-form" autocomplete="off">' +
        rows +
        '<div class="pi-vis-personalize-actions">' +
          '<button type="button" class="pi-vis-btn" data-vis-personalize="submit">Create Agent</button>' +
        "</div>" +
      "</form>";

    const inputs = body.querySelectorAll("[data-vis-answer]");
    if (inputs && inputs.length) {
      inputs.forEach(function (input) {
        input.addEventListener("input", function () {
          const key = String(input.getAttribute("data-vis-answer") || "");
          visPersonalizeState.answers[key] = String(input.value || "");
          updatePersonalizeProgress();
          const field = input.closest ? input.closest(".pi-vis-personalize-field") : null;
          if (field) field.classList.toggle("is-missing", !String(input.value || "").trim());
        });
      });
    }
    updatePersonalizeProgress();
  }

  function updatePersonalizeProgress() {
    if (!visPersonalizeEl) return;
    const body = visPersonalizeEl.querySelector(".pi-vis-personalize-body");
    if (!body) return;
    const inputs = body.querySelectorAll("[data-vis-answer]");
    if (!inputs || !inputs.length) return;
    let filled = 0;
    inputs.forEach(function (input) {
      if (String(input.value || "").trim()) filled += 1;
    });
    const pct = Math.max(0, Math.min(100, Math.round((filled / VIS_PERSONALIZE_QUESTIONS.length) * 100)));
    const bar = body.querySelector(".pi-vis-personalize-progress-bar span");
    if (bar) bar.style.width = pct + "%";
  }

  function collectPersonalizeAnswers() {
    if (!visPersonalizeEl) return {};
    const body = visPersonalizeEl.querySelector(".pi-vis-personalize-body");
    if (!body) return {};
    const inputs = body.querySelectorAll("[data-vis-answer]");
    const out = {};
    if (inputs && inputs.length) {
      inputs.forEach(function (input) {
        const key = String(input.getAttribute("data-vis-answer") || "");
        out[key] = String(input.value || "").trim();
      });
    }
    return out;
  }

  function validatePersonalizeAnswers(answers) {
    if (!visPersonalizeEl) return false;
    const body = visPersonalizeEl.querySelector(".pi-vis-personalize-body");
    if (!body) return false;
    let ok = true;
    VIS_PERSONALIZE_QUESTIONS.forEach(function (q) {
      const val = answers[q.id];
      const field = body.querySelector('[data-q="' + q.id + '"]');
      const missing = !String(val || "").trim();
      if (field) field.classList.toggle("is-missing", missing);
      if (missing) ok = false;
    });
    return ok;
  }

  function parseCsvList(value) {
    return String(value || "")
      .split(",")
      .map(function (s) { return s.trim(); })
      .filter(Boolean)
      .slice(0, 10);
  }

  async function createVisPersonalAgent(profile, answers) {
    if (!profile) return false;
    const safeAnswers = answers && typeof answers === "object" ? answers : {};
    profile.personal_intelligence_agent = {
      status: "ready",
      created_at: nowIso(),
      personalization_answers: Object.assign({}, safeAnswers),
      personalization_questions: VIS_PERSONALIZE_QUESTIONS.map(function (q) { return q.id; }),
    };
    const facts = {
      name: safeAnswers.preferred_name || safeAnswers.full_name || "",
      preferred_name: safeAnswers.preferred_name || "",
      full_name: safeAnswers.full_name || "",
      formal_name: safeAnswers.full_name || "",
      interests: safeAnswers.interests || "",
      favorite_subjects: safeAnswers.favorite_subjects || "",
      goals: safeAnswers.goals || "",
      learning_style: safeAnswers.learning_style || "",
      preferred_tone: safeAnswers.preferred_tone || "",
      hobbies: safeAnswers.hobbies || "",
      timezone_or_city: safeAnswers.timezone_or_city || "",
      preferred_language: safeAnswers.preferred_language || "",
    };
    mergeKnownFacts(facts);
    visPersonalizationProfile = Object.assign({}, visPersonalizationProfile || {}, {
      interests: parseCsvList(safeAnswers.interests),
      frequently_discussed_topics: parseCsvList(safeAnswers.favorite_subjects),
      behavior_patterns: parseCsvList(safeAnswers.goals),
      conversation_habits: parseCsvList(safeAnswers.learning_style),
      preferred_interaction_style: safeAnswers.preferred_tone || visPersonalizationProfile.preferred_interaction_style,
      tone_preferences: safeAnswers.preferred_tone || visPersonalizationProfile.tone_preferences,
    });
    visBehaviorConfig = Object.assign({}, visBehaviorConfig || {}, {
      preferred_conversation_tone: safeAnswers.preferred_tone || visBehaviorConfig.preferred_conversation_tone,
    });
    profile.user_identity = Object.assign({}, profile.user_identity || {}, {
      display_name: String(safeAnswers.preferred_name || safeAnswers.full_name || (profile.user_identity && profile.user_identity.display_name) || "").trim(),
      preferred_name: String(safeAnswers.preferred_name || "").trim(),
      full_name: String(safeAnswers.full_name || "").trim(),
    });
    profile.personalization_profile = Object.assign({}, profile.personalization_profile || {}, visPersonalizationProfile || {});
    profile.personalization_profile.onboarding_answers = Object.assign({}, safeAnswers);
    profile.ai_behavior_configuration = Object.assign({}, profile.ai_behavior_configuration || {}, visBehaviorConfig || {});
    profile.learned_preferences = Object.assign({}, profile.learned_preferences || {}, knownFacts || {});
    profile.personal_intelligence_agent = Object.assign({}, profile.personal_intelligence_agent || {}, {
      tailored_agent: buildTailoredAgentSnapshot(profile, safeAnswers),
    });
    if (visActiveProfile && visActiveProfile.file_name === profile.file_name) {
      scheduleVisProfileSave();
    } else {
      await saveVisProfileToCloud(profile);
    }
    pushVisDebug("Waiting for Personal Intelligence unique identifier.");
    const saveResult = await savePiUserConfig(profile, safeAnswers);
    const savedConfig = saveResult && (saveResult.profile || saveResult.config || saveResult);
    if (savedConfig) {
      const mergedProfile = mergePiConfigIntoProfile(profile, savedConfig.user_config || savedConfig);
      if (mergedProfile && mergedProfile !== profile) Object.assign(profile, mergedProfile);
      const uniqueId = String(
        (saveResult && saveResult.identity && (saveResult.identity.unique_identifier || saveResult.identity.fallback_id)) ||
        savedConfig.unique_identifier ||
        (savedConfig.user_config && savedConfig.user_config.unique_identifier) ||
        (((profile.personal_intelligence_agent || {}).cloud_config || {}).unique_identifier) ||
        ""
      ).trim();
      profile.personal_intelligence_agent = Object.assign({}, profile.personal_intelligence_agent || {}, {
        cloud_config: savedConfig.user_config || savedConfig,
        unique_identifier: uniqueId,
      });
      profile.personal_intelligence_agent.tailored_agent = buildTailoredAgentSnapshot(profile, safeAnswers);
      if (uniqueId) pushVisDebug("Personal Intelligence unique identifier ready: " + uniqueId);
      const verification = await verifyPiProfileAssociation(profile, uniqueId);
      profile.personal_intelligence_agent = Object.assign({}, profile.personal_intelligence_agent || {}, {
        status: "ready",
        profile_verified: !!verification.ok,
        profile_verified_at: verification.verified_at || nowIso(),
        personalization_completed_at: nowIso(),
        personalization_prompt: String(
          (savedConfig.ai_config && savedConfig.ai_config.personalization_prompt) ||
          (savedConfig.user_config && savedConfig.user_config.ai_config && savedConfig.user_config.ai_config.personalization_prompt) ||
          ""
        ).trim(),
      });
      profile.session_state = Object.assign({}, profile.session_state || {}, {
        personalization_completed_at: nowIso(),
      });
      visRecentPersonalizationFile = String(profile.file_name || "").trim();
      visRecentPersonalizationAt = Date.now();
      if (visActiveProfile && visActiveProfile.file_name === profile.file_name) {
        scheduleVisProfileSave();
      } else {
        await saveVisProfileToCloud(profile);
      }
      if (!verification.ok) {
        pushVisDebug("Personal Intelligence verification pending: " + String(verification.error || "unknown"));
      }
      const harmonyReady = await warmHarmonyPersonalization(profile, safeAnswers, uniqueId);
      if (!harmonyReady) {
        pushVisDebug("Harmony personalization warmup pending.");
      }
      return {
        ok: true,
        unique_identifier: uniqueId,
        verification: verification,
        harmony_ready: !!harmonyReady,
      };
    }
    throw new Error("PI_CONFIG_SAVE_FAILED");
  }

  function ensureVisPersonalAgent(profile, reason) {
    if (!profile) return;
    if (hasVisPersonalAgent(profile)) return;
    if (hasRecentPersonalizationCompletion(profile)) {
      pushVisDebug("Skipping personalization reopen after recent completion (" + String(reason || "recent_completion") + ").");
      return;
    }
    if (visPersonalizeOpen) return;
    if (visSetupOpen || visVerificationBusy || visScanning) return;
    pushVisDebug("Opening personalization flow (" + String(reason || "missing_agent") + ").");
    setAssistantStateForVisOffline("Personalization required");
    openVisPersonalize(profile);
  }

  function submitVisPersonalize() {
    if (visPersonalizeState.loading) return;
    const answers = collectPersonalizeAnswers();
    const ok = validatePersonalizeAnswers(answers);
    if (!ok) return;
    visPersonalizeState.loading = true;
    renderVisPersonalize();
    const profile = visPersonalizeState.profile || visActiveProfile;
    createVisPersonalAgent(profile, answers).then(function (result) {
      visPersonalizeState.loading = false;
      closeVisPersonalize();
      if (profile) {
        switchToVisProfile(profile).then(function () {
          visRecognitionCandidate = { profileFile: "", count: 0 };
          visNoMatchCount = 0;
          const preferredName = String(
            (answers && (answers.preferred_name || answers.full_name)) ||
            (profile && profile.user_identity && profile.user_identity.username) ||
            visLastKnownUserLabel ||
            "there"
          ).trim();
          showVisPersonalWelcomeCard(preferredName, result && result.unique_identifier);
        });
      }
    }).catch(function (error) {
      visPersonalizeState.loading = false;
      renderVisPersonalize();
      pushVisDebug("Personal Intelligence creation failed: " + String((error && error.message) || error));
      addLog("assistant", "Aevra AI: Personal Intelligence setup is not ready yet. Please try again.");
    });
  }

  function clearVisFrameLoop() {
    if (visScanLoopTimer) {
      clearTimeout(visScanLoopTimer);
      visScanLoopTimer = null;
    }
  }

  function scheduleVisFrameLoop(delayMs) {
    if (VIS_CAMERA_DISABLED) {
      clearVisFrameLoop();
      return;
    }
    clearVisFrameLoop();
    const delay = typeof delayMs === "number" ? delayMs : VIS_SCAN_INTERVAL_MS;
    visScanLoopTimer = setTimeout(async function () {
      visScanLoopTimer = null;
      try {
        await processVisFrame();
      } catch (e) {}
      scheduleVisFrameLoop(VIS_SCAN_INTERVAL_MS);
    }, Math.max(40, delay));
  }

  async function startVisVerificationStage(profile) {
    if (!visAllowTestingStage) return;
    if (!profile) return;
    openVisTestStage(profile);
    const statusEl = visTestEl ? visTestEl.querySelector(".pi-vis-test-status") : null;
    const retryBtn = visTestEl ? visTestEl.querySelector('[data-vis-test="retry"]') : null;
    const activateBtn = visTestEl ? visTestEl.querySelector('[data-vis-test="activate"]') : null;
    if (VIS_CAMERA_DISABLED) {
      if (statusEl) statusEl.textContent = "Voice identity mode is active. Press Continue to start personalization.";
      if (retryBtn) retryBtn.hidden = true;
      if (activateBtn) activateBtn.hidden = false;
      visVerificationBusy = false;
      visAllowTestingStage = false;
      return;
    }
    const targetUser = String((profile && profile.user_identity && profile.user_identity.username) || "");
    if (retryBtn) retryBtn.hidden = true;
    if (activateBtn) activateBtn.hidden = true;
    if (!targetUser) {
      if (statusEl) statusEl.textContent = "Verification failed: no enrolled user ID found.";
      if (retryBtn) retryBtn.hidden = false;
      visVerificationBusy = false;
      return;
    }
    let tries = 0;
    let bestScore = 0;
    while (tries < VIS_TEST_MAX_TRIES) {
      tries += 1;
      await new Promise(function (resolve) { setTimeout(resolve, VIS_TEST_FRAME_DELAY_MS); });
      const result = await processVisBackendFrame();
      const score = Number(result && result.confidence || 0);
      if (score > bestScore) bestScore = score;
      if (statusEl) {
        statusEl.textContent =
          "Testing recognition... confidence " + score.toFixed(2) +
          " / best " + bestScore.toFixed(2);
      }
      const passedThreshold =
        result &&
        result.faceDetected &&
        score >= VIS_RECOGNITION_THRESHOLD;
      if (passedThreshold || bestScore >= VIS_RECOGNITION_THRESHOLD) {
        const uname = String((profile.user_identity && profile.user_identity.username) || "user");
        if (statusEl) {
          statusEl.textContent =
            "Verification complete at " + bestScore.toFixed(2) +
            " confidence for " + uname + ". Press Continue to start personalization.";
        }
        if (retryBtn) retryBtn.hidden = true;
        if (activateBtn) activateBtn.hidden = false;
        visVerificationBusy = false;
        visAllowTestingStage = false;
        return;
      }
    }
    if (statusEl) {
      statusEl.textContent =
        "Verification timeout. Best confidence " + bestScore.toFixed(2) +
        ". Keep face centered, improve lighting, and press Retry.";
    }
    if (retryBtn) retryBtn.hidden = false;
    if (activateBtn) activateBtn.hidden = true;
    visVerificationBusy = false;
  }

  function updateTopStatusLabel(reason) {
    if (!topStatusLabelEl) return;
    if (visOffline) {
      topStatusLabelEl.textContent = reason || "Offline";
      return;
    }
    const userLabel = String(visLastKnownUserLabel || "Unknown");
    const emotionLabel = String(visLastEmotion || "neutral").toLowerCase();
    topStatusLabelEl.textContent = "Online - " + userLabel + " · " + emotionLabel;
  }

  function setVisOfflineState(nextOffline, reason) {
    visOffline = !!nextOffline;
    panel.classList.toggle("pi-vis-offline", visOffline);
    if (topStatusDotEl) {
      topStatusDotEl.classList.toggle("is-offline", visOffline);
      topStatusDotEl.classList.toggle("is-online", !visOffline);
    }
    updateTopStatusLabel(reason);
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

  function ensureVisWelcomeStyles() {
    if (document.getElementById("piVisWelcomeStyle")) return;
    const style = document.createElement("style");
    style.id = "piVisWelcomeStyle";
    style.textContent =
      ".pi-vis-welcome{position:fixed;top:86px;right:22px;z-index:9999;background:rgba(9,18,36,0.9);color:#e9f2ff;padding:12px 18px;border-radius:12px;border:1px solid rgba(120,180,255,0.35);box-shadow:0 14px 40px rgba(2,8,23,0.45);font-size:14px;letter-spacing:.2px;opacity:0;transform:translateY(-8px);transition:opacity 2s ease,transform 0.4s ease;}"+
      ".pi-vis-welcome.pi-show{opacity:1;transform:translateY(0);}"+
      ".pi-vis-welcome.pi-fade{opacity:0;}"+
      ".pi-vis-personal-welcome-backdrop{position:fixed;inset:0;z-index:10040;background:rgba(3,10,22,0.48);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:20px;}"+
      ".pi-vis-personal-welcome{width:min(480px,calc(100vw - 32px));background:linear-gradient(180deg,rgba(13,24,48,0.97),rgba(18,38,72,0.96));border:1px solid rgba(132,197,255,0.32);border-radius:24px;box-shadow:0 28px 80px rgba(2,8,23,0.5);padding:28px 24px;color:#e9f2ff;text-align:center;}"+
      ".pi-vis-personal-welcome-kicker{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:rgba(191,219,254,0.9);margin-bottom:12px;}"+
      ".pi-vis-personal-welcome-title{font-size:30px;line-height:1.15;font-weight:800;margin:0 0 10px;}"+
      ".pi-vis-personal-welcome-subtitle{font-size:15px;line-height:1.6;color:rgba(226,232,240,0.92);margin:0 0 18px;}"+
      ".pi-vis-personal-welcome-meta{font-size:13px;line-height:1.5;color:rgba(147,197,253,0.95);margin-bottom:20px;}"+
      ".pi-vis-personal-welcome-button{border:0;border-radius:999px;padding:12px 22px;background:linear-gradient(90deg,#60a5fa,#818cf8);color:#08111f;font-size:14px;font-weight:800;cursor:pointer;}"+
      ".pi-vis-personal-welcome-timer{margin-top:12px;font-size:12px;color:rgba(191,219,254,0.72);}";
    document.head.appendChild(style);
  }

  function showVisWelcome(name) {
    const label = String(name || visLastKnownUserLabel || "User");
    ensureVisWelcomeStyles();
    const existing = document.querySelector(".pi-vis-welcome");
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    const toast = document.createElement("div");
    toast.className = "pi-vis-welcome";
    toast.textContent = "Welcome " + label + ".";
    document.body.appendChild(toast);
    setTimeout(function () { toast.classList.add("pi-show"); }, 20);
    setTimeout(function () { toast.classList.add("pi-fade"); }, 3000);
    setTimeout(function () {
      if (toast && toast.parentNode) toast.parentNode.removeChild(toast);
    }, 5000);
  }

  function showVisPersonalWelcomeCard(name, uniqueId) {
    ensureVisWelcomeStyles();
    const existing = document.querySelector(".pi-vis-personal-welcome-backdrop");
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    const label = String(name || visLastKnownUserLabel || "there").trim() || "there";
    const backdrop = document.createElement("div");
    backdrop.className = "pi-vis-personal-welcome-backdrop";
    backdrop.innerHTML =
      '<div class="pi-vis-personal-welcome" role="dialog" aria-modal="true" aria-label="Personal Intelligence ready">' +
        '<div class="pi-vis-personal-welcome-kicker">Personal Intelligence Ready</div>' +
        '<h2 class="pi-vis-personal-welcome-title">Hi ' + escapeHtml(label) + '</h2>' +
        '<p class="pi-vis-personal-welcome-subtitle">This is your own personal assistant by Aevra AI. Your personalized agent is ready to help you.</p>' +
        '<div class="pi-vis-personal-welcome-meta">Unique ID: ' + escapeHtml(String(uniqueId || "linked to your account")) + '</div>' +
        '<button type="button" class="pi-vis-personal-welcome-button">Continue</button>' +
        '<div class="pi-vis-personal-welcome-timer">This message closes automatically in 20 seconds.</div>' +
      '</div>';
    const close = function () {
      if (backdrop && backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
    };
    const button = backdrop.querySelector(".pi-vis-personal-welcome-button");
    if (button) button.addEventListener("click", close);
    document.body.appendChild(backdrop);
    setTimeout(close, 20000);
  }

  function getVisEndpoint(globalKey, fallback) {
    const direct = window[globalKey];
    if (typeof direct === "string" && direct.trim()) return direct.trim();
    if (typeof fallback === "string" && fallback.trim()) {
      return fallback.trim();
    }
    if (window.Api && typeof window.Api.getBaseUrl === "function") {
      return window.Api.getBaseUrl() + fallback;
    }
    return fallback;
  }

  async function postVisJson(url, payload) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload || {}),
    });
    const data = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(String((data && (data.detail || data.error)) || ("HTTP_" + response.status)));
    return data;
  }

  function loadExternalScriptOnce(src, id) {
    const existing = id ? document.getElementById(id) : null;
    if (existing) {
      if (existing.getAttribute("data-loaded") === "true") return Promise.resolve(true);
      return new Promise(function (resolve, reject) {
        existing.addEventListener("load", function () { resolve(true); }, { once: true });
        existing.addEventListener("error", function () { reject(new Error("SCRIPT_LOAD_FAILED")); }, { once: true });
      });
    }
    return new Promise(function (resolve, reject) {
      const script = document.createElement("script");
      if (id) script.id = id;
      script.src = src;
      script.async = true;
      script.defer = true;
      script.onload = function () {
        script.setAttribute("data-loaded", "true");
        resolve(true);
      };
      script.onerror = function () {
        reject(new Error("SCRIPT_LOAD_FAILED"));
      };
      document.head.appendChild(script);
    });
  }

  async function ensureVisFaceApiReady() {
    if (VIS_ACTIVE_FACE_ENGINE !== "faceapi") return false;
    if (visFaceApiReady && window.faceapi) return true;
    if (visFaceApiLoadPromise) return visFaceApiLoadPromise;
    if (!visFaceApiStartupStartedAt) visFaceApiStartupStartedAt = Date.now();
    visFaceApiLoadPromise = (async function () {
      await loadExternalScriptOnce(VIS_FACE_API_SCRIPT_URL, "piFaceApiScript");
      if (!window.faceapi) throw new Error("face-api.js unavailable");
      await Promise.all([
        window.faceapi.nets.ssdMobilenetv1.loadFromUri(VIS_FACE_API_MODEL_URL),
        window.faceapi.nets.faceLandmark68Net.loadFromUri(VIS_FACE_API_MODEL_URL),
        window.faceapi.nets.faceRecognitionNet.loadFromUri(VIS_FACE_API_MODEL_URL),
        window.faceapi.nets.faceExpressionNet.loadFromUri(VIS_FACE_API_MODEL_URL),
      ]);
      visFaceApiReady = true;
      visFaceApiExpressionReady = true;
      visLastBackendError = "";
      dbg("face-api.js core ready");
      pushVisDebug("face-api.js core ready");
      return true;
    })().catch(function (error) {
      visFaceApiReady = false;
      visFaceApiExpressionReady = false;
      visFaceApiLoadPromise = null;
      visLastBackendError = String((error && error.message) || error || "face-api load failed");
      pushVisDebug("face-api.js load failed: " + visLastBackendError);
      return false;
    });
    return visFaceApiLoadPromise;
  }

  async function ensureVisFaceApiExpressionsReady() {
    if (VIS_ACTIVE_FACE_ENGINE !== "faceapi") return false;
    if (visFaceApiExpressionReady && window.faceapi) return true;
    if (visFaceApiExpressionPromise) return visFaceApiExpressionPromise;
    visFaceApiExpressionPromise = ensureVisFaceApiReady().then(function (ready) {
      if (ready) {
        visFaceApiExpressionReady = true;
        dbg("face-api.js expressions ready");
        pushVisDebug("face-api.js expressions ready");
      }
      return ready;
    }).catch(function (error) {
      visFaceApiExpressionReady = false;
      visFaceApiExpressionPromise = null;
      dbg("face-api.js expressions load failed", error && error.message);
      return false;
    });
    return visFaceApiExpressionPromise;
  }

  function averagePoint(points, name) {
    const list = Array.isArray(points) ? points : [];
    if (!list.length) return null;
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < list.length; i += 1) {
      sx += Number(list[i].x || 0);
      sy += Number(list[i].y || 0);
    }
    return {
      name: String(name || "point"),
      x: sx / list.length,
      y: sy / list.length,
    };
  }

  function toNormalizedFaceApiLandmarks(landmarks, vw, vh) {
    if (!landmarks || !vw || !vh) return [];
    const out = [];
    const positions = Array.isArray(landmarks.positions) ? landmarks.positions : [];
    for (let i = 0; i < positions.length; i += 1) {
      const pt = positions[i];
      out.push({
        name: "p" + i,
        x: Number(pt.x || 0) / vw,
        y: Number(pt.y || 0) / vh,
      });
    }
    const leftEye = averagePoint(typeof landmarks.getLeftEye === "function" ? landmarks.getLeftEye() : [], "left_eye");
    const rightEye = averagePoint(typeof landmarks.getRightEye === "function" ? landmarks.getRightEye() : [], "right_eye");
    const nosePts = typeof landmarks.getNose === "function" ? landmarks.getNose() : [];
    const nose = averagePoint(nosePts.slice(Math.max(0, nosePts.length - 3)), "nose");
    const mouth = typeof landmarks.getMouth === "function" ? landmarks.getMouth() : [];
    const mouthLeft = mouth.length ? { name: "mouth_left", x: Number(mouth[0].x || 0) / vw, y: Number(mouth[0].y || 0) / vh } : null;
    const mouthRight = mouth.length ? { name: "mouth_right", x: Number(mouth[6] && mouth[6].x || 0) / vw, y: Number(mouth[6] && mouth[6].y || 0) / vh } : null;
    [leftEye, rightEye, nose].forEach(function (pt) {
      if (pt) {
        pt.x = Number(pt.x || 0) / vw;
        pt.y = Number(pt.y || 0) / vh;
        out.push(pt);
      }
    });
    if (mouthLeft) out.push(mouthLeft);
    if (mouthRight) out.push(mouthRight);
    return out;
  }

  function faceApiExpressionsToEmotion(expressions) {
    if (!expressions || typeof expressions !== "object") return "neutral";
    let bestLabel = "neutral";
    let bestScore = -1;
    Object.keys(expressions).forEach(function (key) {
      const score = Number(expressions[key]);
      if (Number.isFinite(score) && score > bestScore) {
        bestScore = score;
        bestLabel = key;
      }
    });
    return String(bestLabel || "neutral").toLowerCase();
  }

  function faceApiSignatureForLiveness(face) {
    const landmarks = getFaceLandmarks(face);
    const nose = landmarks.find(function (pt) { return String(pt && pt.name || "") === "nose"; }) || landmarks[0] || null;
    const box = getFaceBox(face);
    if (!nose || !box) return "";
    return [
      Math.round(Number(nose.x || 0) * 1000),
      Math.round(Number(nose.y || 0) * 1000),
      Math.round(Number(box.x || 0) * 1000),
      Math.round(Number(box.y || 0) * 1000),
      Math.round(Number(box.width || 0) * 1000),
      Math.round(Number(box.height || 0) * 1000),
    ].join(":");
  }

  function updateFaceApiLiveness(face) {
    const signature = faceApiSignatureForLiveness(face);
    if (!signature) {
      visLivenessSamples = [];
      return false;
    }
    visLivenessSamples.push(signature);
    if (visLivenessSamples.length > 6) visLivenessSamples = visLivenessSamples.slice(-6);
    const unique = new Set(visLivenessSamples);
    return visLivenessSamples.length >= 3 && unique.size >= 2;
  }

  function euclideanDistance(a, b) {
    const x = Array.isArray(a) ? a : [];
    const y = Array.isArray(b) ? b : [];
    const n = Math.min(x.length, y.length);
    if (!n) return Infinity;
    let sum = 0;
    for (let i = 0; i < n; i += 1) {
      const d = Number(x[i] || 0) - Number(y[i] || 0);
      sum += d * d;
    }
    return Math.sqrt(sum);
  }

  function buildVisFaceApiMatcher() {
    if (VIS_ACTIVE_FACE_ENGINE !== "faceapi" || !window.faceapi) return null;
    const rows = Array.isArray(visRecognitionIndex) ? visRecognitionIndex.filter(function (row) {
      return !!(row && Array.isArray(row.vector) && row.vector.length && String(row.vector_model || "").toLowerCase() === "faceapi");
    }) : [];
    const signature = rows.map(function (row) {
      return [
        String(row.profileFile || ""),
        String(row.username || ""),
        String(row.vector_model || ""),
        String(Array.isArray(row.vector) ? row.vector.length : 0),
        String(Number(row.vector && row.vector.length ? row.vector[0] : 0).toFixed(6)),
      ].join(":");
    }).join("|");
    if (signature && signature === visFaceApiMatcherSignature && visFaceApiMatcher) return visFaceApiMatcher;
    visFaceApiMatcher = null;
    visFaceApiMatcherSignature = signature;
    visFaceApiLabelMap = {};
    if (!rows.length) return null;
    const grouped = {};
    rows.forEach(function (row) {
      const label = String(row.profileFile || row.username || "").trim();
      if (!label) return;
      if (!grouped[label]) grouped[label] = { descriptors: [], row: row };
      grouped[label].descriptors.push(new Float32Array(row.vector));
      if (!grouped[label].row) grouped[label].row = row;
    });
    const labels = Object.keys(grouped).filter(function (label) {
      return grouped[label] && Array.isArray(grouped[label].descriptors) && grouped[label].descriptors.length;
    });
    if (!labels.length) return null;
    const labeledDescriptors = labels.map(function (label) {
      visFaceApiLabelMap[label] = grouped[label].row;
      return new window.faceapi.LabeledFaceDescriptors(label, grouped[label].descriptors);
    });
    visFaceApiMatcher = new window.faceapi.FaceMatcher(labeledDescriptors, VIS_FACE_API_MATCH_DISTANCE);
    return visFaceApiMatcher;
  }

  function findVisFaceApiMatch(descriptor) {
    const input = Array.isArray(descriptor) ? descriptor : [];
    if (!input.length) return null;
    const matcher = buildVisFaceApiMatcher();
    if (!matcher) return null;
    const best = matcher.findBestMatch(new Float32Array(input));
    const label = String(best && best.label || "");
    if (!label || label === "unknown") return null;
    const row = visFaceApiLabelMap[label] || null;
    if (!row) return null;
    return {
      profileFile: row.profileFile,
      username: row.username,
      profile: row.profile || null,
      distance: Number(best && best.distance || 1),
      label: label,
    };
  }

  function isVisBackendBusyError(error) {
    const message = String((error && error.message) || error || "").toLowerCase();
    return (
      message.includes("usage_exceeded") ||
      message.includes("http_503") ||
      message.includes("service unavailable")
    );
  }

  function captureVisFrameDataUrl() {
    if (!visVideoEl || !visVideoEl.videoWidth || !visVideoEl.videoHeight) return "";
    const canvas = getVisProcessingCanvas();
    canvas.width = Math.max(1, Math.min(VIS_CAPTURE_MAX_WIDTH, visVideoEl.videoWidth));
    canvas.height = Math.max(1, Math.round(canvas.width * (visVideoEl.videoHeight / visVideoEl.videoWidth)));
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.drawImage(visVideoEl, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  }

  async function processVisFaceApiFrame() {
    const ready = await ensureVisFaceApiReady();
    if (!ready || !window.faceapi || !visVideoEl) {
      throw new Error(visLastBackendError || "face-api unavailable");
    }
    const faceapi = window.faceapi;
    const detections = await faceapi
      .detectAllFaces(
        visVideoEl,
        new faceapi.SsdMobilenetv1Options({
          minConfidence: VIS_FACE_API_MIN_CONFIDENCE,
        })
      )
      .withFaceLandmarks()
      .withFaceExpressions()
      .withFaceDescriptors();
    visLastFaceApiDetections = Array.isArray(detections) ? detections.slice(0) : [];
    const vw = Number(visVideoEl.videoWidth || 0);
    const vh = Number(visVideoEl.videoHeight || 0);
    const faces = (Array.isArray(detections) ? detections : []).map(function (item) {
      const box = item && item.detection && item.detection.box ? item.detection.box : null;
      const landmarks = toNormalizedFaceApiLandmarks(item && item.landmarks, vw, vh);
      const faceBox = box ? {
        x: Number(box.x || 0) / Math.max(1, vw),
        y: Number(box.y || 0) / Math.max(1, vh),
        width: Number(box.width || 0) / Math.max(1, vw),
        height: Number(box.height || 0) / Math.max(1, vh),
      } : null;
      return {
        confidence: Number(item && item.detection && item.detection.score || 0),
        box: faceBox,
        landmarks: landmarks,
        pose_hint: faceBox ? estimatePoseHint(faceBox, landmarks) : "",
        descriptor: Array.isArray(item && item.descriptor) ? item.descriptor.slice(0) : Array.from((item && item.descriptor) || []),
        emotion: faceApiExpressionsToEmotion(item && item.expressions),
        expressions: item && item.expressions ? item.expressions : {},
      };
    }).filter(function (face) {
      return !!(face && face.box && face.box.width > 0 && face.box.height > 0);
    });
    if (!faces.length) {
      visLivenessSamples = [];
      visLastFaceApiDetections = [];
      return {
        faceDetected: false,
        faceCount: 0,
        faces: [],
        user_id: null,
        similarity: 0,
        confidence: 0,
        liveness_passed: false,
        emotion: "neutral",
      };
    }
    const primaryFace = selectPrimaryFace(faces);
    const liveness = updateFaceApiLiveness(primaryFace);
    const match = findVisFaceApiMatch(primaryFace && primaryFace.descriptor);
    return {
      faceDetected: true,
      faceCount: faces.length,
      faces: faces,
      user_id: match && match.username ? String(match.username) : null,
      similarity: match ? Math.max(0, Math.round((1 - Math.min(1, match.distance)) * 100)) : 0,
      confidence: Number(primaryFace && primaryFace.confidence || 0),
      liveness_passed: liveness,
      emotion: primaryFace && primaryFace.expressions ? primaryFace.expressions : (primaryFace && primaryFace.emotion ? primaryFace.emotion : "neutral"),
      descriptor: primaryFace && Array.isArray(primaryFace.descriptor) ? primaryFace.descriptor.slice(0) : [],
    };
  }

  async function processVisBackendFrame() {
    if (VIS_ACTIVE_FACE_ENGINE === "faceapi") {
      return await processVisFaceApiFrame();
    }
    if (visBackendRequestBusy) return null;
    const image = captureVisFrameDataUrl();
    if (!image) return null;
    visBackendRequestBusy = true;
    try {
      try {
        const result = await postVisJson(getVisEndpoint("__VIS_FACE_PROCESS_URL", VIS_FACE_PROCESS_ENDPOINT), { image: image });
        return {
          faceDetected: !!(result && result.face_detected),
          faceCount: Number((result && result.face_count) || 0),
          faces: Array.isArray(result && result.faces) ? result.faces : [],
          user_id: result && result.user_id ? String(result.user_id) : null,
          similarity: Number((result && result.similarity) || 0),
          confidence: Number((result && result.confidence) || 0),
          liveness_passed: !!(result && result.liveness_passed),
          emotion: result && result.emotion ? result.emotion : "neutral",
        };
      } catch (error) {
        if (isVisBackendBusyError(error)) throw error;
        const detect = await postVisJson(getVisEndpoint("__VIS_DETECT_FACE_URL", "/detect-face"), { image: image });
        if (!detect || !detect.face_detected) {
          return {
            faceDetected: false,
            faceCount: Number((detect && detect.face_count) || 0),
            faces: Array.isArray(detect && detect.faces) ? detect.faces : [],
            user_id: null,
            similarity: 0,
            confidence: 0,
            liveness_passed: false,
            emotion: "neutral",
          };
        }
        const recognize = await postVisJson(getVisEndpoint("__VIS_RECOGNIZE_USER_URL", "/recognize-user"), { image: image });
        const emotion = await postVisJson(getVisEndpoint("__VIS_ANALYZE_EMOTION_URL", "/analyze-emotion"), { image: image });
        return {
          faceDetected: true,
          faceCount: Number((detect && detect.face_count) || 1),
          faces: Array.isArray(detect && detect.faces) ? detect.faces : [],
          user_id: recognize && recognize.user_id ? String(recognize.user_id) : null,
          similarity: Number((recognize && recognize.similarity) || 0),
          confidence: Number((recognize && recognize.confidence) || 0),
          liveness_passed: !!(recognize && recognize.liveness_passed),
          emotion: emotion && emotion.emotion ? emotion.emotion : "neutral",
        };
      }
    } finally {
      visBackendRequestBusy = false;
    }
  }

  function getFaceBox(face) {
    if (!face) return null;
    const box = face.box || face.boxRaw || face.bbox || face.boundingBox || null;
    if (!box) return null;
    if (Array.isArray(box)) {
      if (box.length >= 4) {
        return { x: Number(box[0] || 0), y: Number(box[1] || 0), width: Number(box[2] || 0), height: Number(box[3] || 0) };
      }
      return null;
    }
    if (typeof box === "object") {
      const x = Number(box.x || box.left || 0);
      const y = Number(box.y || box.top || 0);
      const width = Number(box.width || box.w || 0);
      const height = Number(box.height || box.h || 0);
      if (!width || !height) return null;
      return { x: x, y: y, width: width, height: height };
    }
    return null;
  }

  function getFaceLandmarks(face) {
    if (!face) return [];
    const list = Array.isArray(face.landmarks) ? face.landmarks : (Array.isArray(face.keypoints) ? face.keypoints : []);
    return list.filter(function (point) {
      return point && typeof point === "object";
    });
  }
  if (visDebugPreviewEl) {
    visDebugPreviewEl.addEventListener("click", function (ev) {
      const btn = ev && ev.target && ev.target.closest ? ev.target.closest("[data-vis-debug]") : null;
      if (!btn) return;
      const action = String(btn.getAttribute("data-vis-debug") || "").trim().toLowerCase();
      if (action === "close") closeVisDebugPreview();
    });
  }

  function scaleOverlayPoint(value, size) {
    const n = Number(value || 0);
    if (!Number.isFinite(n)) return 0;
    return n <= 1 ? n * size : n;
  }

  function landmarkByName(landmarks, name) {
    const list = Array.isArray(landmarks) ? landmarks : [];
    for (let i = 0; i < list.length; i += 1) {
      if (String(list[i] && list[i].name || "") === String(name || "")) return list[i];
    }
    return null;
  }

  function landmarkPointAt(landmarks, idx) {
    return landmarkByName(landmarks, "p" + String(idx));
  }

  function drawLandmarkPath(ctx, landmarks, indices, width, height, color, closePath) {
    const points = [];
    for (let i = 0; i < indices.length; i += 1) {
      const point = landmarkPointAt(landmarks, indices[i]);
      if (point) {
        points.push({
          x: scaleOverlayPoint(point.x, width),
          y: scaleOverlayPoint(point.y, height),
        });
      }
    }
    if (points.length < 2) return;
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    if (closePath) ctx.closePath();
    ctx.stroke();
  }

  function drawOfficialLandmarkOverlay(ctx, landmarks, width, height, isPrimary) {
    const lineA = isPrimary ? "rgba(0,255,255,0.95)" : "rgba(125,211,252,0.7)";
    const lineB = isPrimary ? "rgba(255,0,140,0.95)" : "rgba(248,250,252,0.65)";
    const groups = [
      { indices: [0, 1, 2, 3, 4, 5, 6, 7, 8], color: lineA, close: false },
      { indices: [8, 9, 10, 11, 12, 13, 14, 15, 16], color: lineA, close: false },
      { indices: [17, 18, 19, 20, 21], color: lineB, close: false },
      { indices: [22, 23, 24, 25, 26], color: lineB, close: false },
      { indices: [27, 28, 29, 30], color: lineA, close: false },
      { indices: [31, 32, 33, 34, 35], color: lineA, close: false },
      { indices: [36, 37, 38, 39, 40, 41], color: lineB, close: true },
      { indices: [42, 43, 44, 45, 46, 47], color: lineB, close: true },
      { indices: [48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59], color: lineA, close: true },
      { indices: [60, 61, 62, 63, 64, 65, 66, 67], color: lineB, close: true },
    ];
    for (let i = 0; i < groups.length; i += 1) {
      const group = groups[i];
      drawLandmarkPath(ctx, landmarks, group.indices, width, height, group.color, group.close);
    }
    ctx.fillStyle = isPrimary ? "rgba(255,255,255,0.95)" : "rgba(248,250,252,0.7)";
    for (let i = 0; i < 68; i += 1) {
      const point = landmarkPointAt(landmarks, i);
      if (!point) continue;
      const px = scaleOverlayPoint(point.x, width);
      const py = scaleOverlayPoint(point.y, height);
      ctx.beginPath();
      ctx.arc(px, py, isPrimary ? 2.2 : 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function renderVisTrackingOverlay(faces, primaryFace) {
    if (!visCanvasEl || !visVideoEl) return;
    const width = Number(visVideoEl.videoWidth || 0);
    const height = Number(visVideoEl.videoHeight || 0);
    const ctx = visCanvasEl.getContext("2d");
    if (!ctx || !width || !height) return;
    visCanvasEl.width = width;
    visCanvasEl.height = height;
    ctx.clearRect(0, 0, width, height);
    const rows = Array.isArray(faces) ? faces : [];
    visTrackingState.lastFaceCount = rows.length;
    visTrackingState.lastLandmarkCount = 0;
    visTrackingState.lastPoseHint = "";
    if (!rows.length) {
      renderVisDebugCameraMeta();
      return;
    }
    if (VIS_ACTIVE_FACE_ENGINE === "faceapi" && window.faceapi && Array.isArray(visLastFaceApiDetections) && visLastFaceApiDetections.length) {
      const faceapi = window.faceapi;
      const displaySize = { width: width, height: height };
      faceapi.matchDimensions(visCanvasEl, displaySize);
      const resizedResults = faceapi.resizeResults(visLastFaceApiDetections, displaySize);
      faceapi.draw.drawDetections(visCanvasEl, resizedResults);
      faceapi.draw.drawFaceLandmarks(visCanvasEl, resizedResults);
      faceapi.draw.drawFaceExpressions(visCanvasEl, resizedResults, 0.05);
      resizedResults.forEach(function (result, idx) {
        const face = rows[idx] || null;
        const detection = result && result.detection ? result.detection : null;
        const box = detection && detection.box ? detection.box : null;
        if (!box) return;
        const lines = [];
        const userLabel = face && face === primaryFace && visLastKnownUserLabel ? String(visLastKnownUserLabel) : "";
        if (userLabel) lines.push(userLabel);
        if (face && face.emotion) lines.push(String(face.emotion));
        if (!lines.length) return;
        new faceapi.draw.DrawTextField(lines, { x: box.x, y: box.y + box.height + 10 }, {
          anchorPosition: "BOTTOM_LEFT",
          backgroundColor: "rgba(0, 0, 0, 0.58)",
          fontColor: "#ffffff",
          fontSize: 16,
          padding: 6,
        }).draw(visCanvasEl);
      });
      rows.forEach(function (face) {
        visTrackingState.lastLandmarkCount += getFaceLandmarks(face).length;
      });
      visTrackingState.lastPoseHint = String((primaryFace && primaryFace.pose_hint) || "");
      renderVisDebugCameraMeta();
      return;
    }
    rows.forEach(function (face) {
      const box = getFaceBox(face);
      if (!box) return;
      const x = scaleOverlayPoint(box.x, width);
      const y = scaleOverlayPoint(box.y, height);
      const w = scaleOverlayPoint(box.width, width);
      const h = scaleOverlayPoint(box.height, height);
      const isPrimary = face === primaryFace;
      const confidence = Number(face && (face.confidence || face.score || 0) || 0);
      const confidenceLabel = confidence > 0 ? confidence.toFixed(2) : "0.00";
      const boxColor = isPrimary ? "rgba(45,112,255,0.98)" : "rgba(125,211,252,0.78)";
      ctx.lineWidth = isPrimary ? 3 : 2;
      ctx.strokeStyle = boxColor;
      ctx.fillStyle = isPrimary ? "rgba(45,112,255,0.08)" : "rgba(125,211,252,0.06)";
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 14);
      ctx.fill();
      ctx.stroke();
      const label = String(face.pose_hint || "").trim();
      if (isPrimary) visTrackingState.lastPoseHint = label || visTrackingState.lastPoseHint;
      ctx.fillStyle = boxColor;
      ctx.fillRect(x, Math.max(0, y - 22), 48, 18);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 11px sans-serif";
      ctx.fillText(confidenceLabel, x + 6, Math.max(13, y - 9));
      const landmarks = getFaceLandmarks(face);
      visTrackingState.lastLandmarkCount += landmarks.length;
      drawOfficialLandmarkOverlay(ctx, landmarks, width, height, isPrimary);
      if (isPrimary) {
        const infoLines = [];
        if (visLastKnownUserLabel) infoLines.push(String(visLastKnownUserLabel));
        if (label) infoLines.push(label);
        const emotion = topEmotionLabel(face.expressions || face.emotion || {});
        if (emotion) infoLines.push(emotion);
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.font = "bold 13px sans-serif";
        for (let i = 0; i < infoLines.length; i += 1) {
          ctx.fillText(infoLines[i], x + 6, Math.min(height - 12, y + h + 18 + (i * 15)));
        }
      }
    });
    renderVisDebugCameraMeta();
  }

  function faceBoxScore(face, box, vw, vh) {
    if (!box || !vw || !vh) return 0;
    const area = Math.max(0, box.width) * Math.max(0, box.height);
    const areaScore = area / Math.max(1, vw * vh);
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const dx = (cx - vw / 2);
    const dy = (cy - vh / 2);
    const dist = Math.sqrt(dx * dx + dy * dy);
    const maxDist = Math.sqrt((vw * vw) + (vh * vh)) / 2;
    const centerScore = 1 - Math.min(1, dist / Math.max(1, maxDist));
    const conf = Number(face && (face.score || face.confidence || face.faceConfidence || face.probability) || 0);
    return (areaScore * 0.65) + (centerScore * 0.3) + (conf * 0.05);
  }

  function selectPrimaryFace(faces) {
    if (!Array.isArray(faces) || !faces.length) return null;
    const vw = visVideoEl && visVideoEl.videoWidth ? visVideoEl.videoWidth : 0;
    const vh = visVideoEl && visVideoEl.videoHeight ? visVideoEl.videoHeight : 0;
    let best = null;
    let bestScore = -1;
    for (let i = 0; i < faces.length; i += 1) {
      const face = faces[i];
      const box = getFaceBox(face);
      const score = faceBoxScore(face, box, vw, vh);
      if (score > bestScore) {
        bestScore = score;
        best = face;
      }
    }
    return best || faces[0];
  }

  function extractDominantEmotion(face) {
    if (!face) return "neutral";
    const list = Array.isArray(face.emotion) ? face.emotion : (Array.isArray(face.expressions) ? face.expressions : []);
    if (!list.length) return "neutral";
    let best = null;
    let bestScore = -1;
    for (let i = 0; i < list.length; i += 1) {
      const item = list[i];
      const score = Number(item && (item.score || item.probability || item.confidence) || 0);
      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    }
    const label = best && (best.emotion || best.label || best.name || best.expression);
    return String(label || "neutral").toLowerCase();
  }

  function topEmotionLabel(value) {
    if (!value) return "neutral";
    if (typeof value === "string") return String(value || "neutral").toLowerCase();
    if (Array.isArray(value)) return extractDominantEmotion({ emotion: value });
    if (typeof value === "object") {
      if (Array.isArray(value.emotion) || Array.isArray(value.expressions)) {
        return extractDominantEmotion(value);
      }
      let bestLabel = "neutral";
      let bestScore = -1;
      const keys = Object.keys(value);
      for (let i = 0; i < keys.length; i += 1) {
        const key = keys[i];
        const score = Number(value[key]);
        if (!Number.isFinite(score)) continue;
        if (score > bestScore) {
          bestScore = score;
          bestLabel = key;
        }
      }
      return String(bestLabel || "neutral").toLowerCase();
    }
    return "neutral";
  }

  function blendshapeToEmotion(blendshapes) {
    if (!blendshapes || !blendshapes.length) return [];
    const scores = {};
    for (let i = 0; i < blendshapes.length; i += 1) {
      const item = blendshapes[i];
      const name = item && item.categoryName ? String(item.categoryName) : "";
      const score = Number(item && item.score || 0);
      scores[name] = score;
    }
    const smile = (scores.mouthSmileLeft || 0) + (scores.mouthSmileRight || 0);
    const frown = (scores.mouthFrownLeft || 0) + (scores.mouthFrownRight || 0);
    const browDown = (scores.browDownLeft || 0) + (scores.browDownRight || 0);
    const browInnerUp = (scores.browInnerUp || 0);
    const jawOpen = (scores.jawOpen || 0);
    const lipPress = (scores.mouthPressLeft || 0) + (scores.mouthPressRight || 0);
    const surprise = Math.min(1, jawOpen * 0.7 + browInnerUp * 0.5);
    const happy = Math.min(1, smile);
    const sad = Math.min(1, frown * 0.6 + browInnerUp * 0.4);
    const angry = Math.min(1, browDown * 0.6 + lipPress * 0.4);
    const neutral = Math.max(0, 1 - Math.max(happy, sad, angry, surprise));
    return [
      { emotion: "happy", score: happy },
      { emotion: "sad", score: sad },
      { emotion: "angry", score: angry },
      { emotion: "surprised", score: surprise },
      { emotion: "neutral", score: neutral }
    ];
  }

  function extractEmbedding(embedResult) {
    if (!embedResult || !embedResult.embeddings || !embedResult.embeddings.length) return [];
    const emb = embedResult.embeddings[0] || {};
    if (Array.isArray(emb.floatEmbedding) && emb.floatEmbedding.length) return emb.floatEmbedding;
    if (Array.isArray(emb.embedding) && emb.embedding.length) return emb.embedding;
    if (Array.isArray(emb.quantizedEmbedding) && emb.quantizedEmbedding.length) {
      return emb.quantizedEmbedding.map(function(v) { return Number(v) / 255; });
    }
    return [];
  }

  function boxFromLandmarks(landmarks, vw, vh) {
    if (!landmarks || !landmarks.length || !vw || !vh) return null;
    let minX = 1, minY = 1, maxX = 0, maxY = 0;
    for (let i = 0; i < landmarks.length; i += 1) {
      const pt = landmarks[i];
      const x = Math.min(1, Math.max(0, Number(pt.x || 0)));
      const y = Math.min(1, Math.max(0, Number(pt.y || 0)));
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    const pad = 0.12;
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(1, maxX + pad);
    maxY = Math.min(1, maxY + pad);
    const x = Math.round(minX * vw);
    const y = Math.round(minY * vh);
    const w = Math.max(1, Math.round((maxX - minX) * vw));
    const h = Math.max(1, Math.round((maxY - minY) * vh));
    return { x, y, width: w, height: h };
  }

  function estimatePoseHint(box, landmarks) {
    const lookup = {};
    const list = Array.isArray(landmarks) ? landmarks : [];
    for (let i = 0; i < list.length; i += 1) {
      const pt = list[i];
      const name = String(pt && pt.name || "");
      if (name && !(name in lookup)) lookup[name] = pt;
    }
    const leftEye = lookup.left_eye;
    const rightEye = lookup.right_eye;
    const nose = lookup.nose;
    if (leftEye && rightEye && nose) {
      const eyeMidX = (Number(leftEye.x || 0) + Number(rightEye.x || 0)) / 2;
      const noseDx = Number(nose.x || 0) - eyeMidX;
      if (noseDx <= -0.03) return "left";
      if (noseDx >= 0.03) return "right";
    }
    const x = Number(box && box.x || 0);
    const y = Number(box && box.y || 0);
    const w = Number(box && box.width || 0);
    const h = Number(box && box.height || 0);
    const cx = x + (w / 2);
    const cy = y + (h / 2);
    const area = w * h;
    if (area >= 0.2) return "close";
    if (cx < 0.38) return "left";
    if (cx > 0.62) return "right";
    if (cy < 0.38) return "up";
    if (cy > 0.62) return "down";
    return "center";
  }

  function estimateFrameLuma() {
    if (!visVideoEl) return 1;
    const canvas = getVisProcessingCanvas();
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return 1;
    const w = 32;
    const h = 24;
    canvas.width = w;
    canvas.height = h;
    try {
      ctx.drawImage(visVideoEl, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data;
      let sum = 0;
      const count = data.length / 4;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        sum += (0.299 * r + 0.587 * g + 0.114 * b);
      }
      return count ? (sum / count) / 255 : 1;
    } catch (e) {
      return 1;
    }
  }

  function updateLightingStatus() {
    const luma = estimateFrameLuma();
    const low = luma < VIS_LIGHTING_MIN_LUMA;
    if (low && !visLightingLow) {
      visLightingLow = true;
      visLightingWarnAt = Date.now();
      addLog("assistant", "Aevra AI: Lighting too low for facial recognition.");
      pushVisDebug("Lighting too low for facial recognition.");
    } else if (!low && visLightingLow) {
      visLightingLow = false;
      addLog("assistant", "Aevra AI: Lighting improved. Recognition stabilizing.");
      pushVisDebug("Lighting improved for facial recognition.");
    }
  }

  function renderAdjustedFrame() {
    if (!visVideoEl) return visVideoEl;
    const vw = visVideoEl.videoWidth || 0;
    const vh = visVideoEl.videoHeight || 0;
    if (!vw || !vh) return visVideoEl;
    if (!visLightingCanvas) visLightingCanvas = document.createElement("canvas");
    const canvas = visLightingCanvas;
    const w = Math.min(320, vw);
    const h = Math.min(240, vh);
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return visVideoEl;
    try {
      ctx.drawImage(visVideoEl, 0, 0, w, h);
      const img = ctx.getImageData(0, 0, w, h);
      const data = img.data;
      const contrast = 1.2;
      const brightness = 12;
      for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.max(0, Math.min(255, (data[i] - 128) * contrast + 128 + brightness));
        data[i + 1] = Math.max(0, Math.min(255, (data[i + 1] - 128) * contrast + 128 + brightness));
        data[i + 2] = Math.max(0, Math.min(255, (data[i + 2] - 128) * contrast + 128 + brightness));
      }
      ctx.putImageData(img, 0, 0);
      return canvas;
    } catch (e) {
      return visVideoEl;
    }
  }

  function getVisFrameSource() {
    if (!visVideoEl) return null;
    if (!visVideoEl.videoWidth || !visVideoEl.videoHeight) return null;
    const canvas = getVisProcessingCanvas();
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    canvas.width = visVideoEl.videoWidth;
    canvas.height = visVideoEl.videoHeight;
    try {
      ctx.drawImage(visVideoEl, 0, 0, canvas.width, canvas.height);
      return canvas;
    } catch (e) {
      return null;
    }
  }

  function waitForVideoReady(videoEl, timeoutMs) {
    if (!videoEl) return Promise.resolve(false);
    if (videoEl.videoWidth && videoEl.videoHeight) return Promise.resolve(true);
    const timeout = typeof timeoutMs === "number" ? timeoutMs : 2000;
    return new Promise(function (resolve) {
      let settled = false;
      const done = function (ok) {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(!!ok);
      };
      const onReady = function () {
        if (videoEl.videoWidth && videoEl.videoHeight) done(true);
      };
      const cleanup = function () {
        try { videoEl.removeEventListener("loadedmetadata", onReady); } catch (e) {}
        try { videoEl.removeEventListener("loadeddata", onReady); } catch (e) {}
        try { videoEl.removeEventListener("playing", onReady); } catch (e) {}
      };
      try { videoEl.addEventListener("loadedmetadata", onReady); } catch (e) {}
      try { videoEl.addEventListener("loadeddata", onReady); } catch (e) {}
      try { videoEl.addEventListener("playing", onReady); } catch (e) {}
      setTimeout(function () { done(false); }, timeout);
    });
  }

  function getFaceCropCanvas(sourceCanvas, box) {
    if (!sourceCanvas || !box) return null;
    const canvas = getVisProcessingCanvas();
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    const w = sourceCanvas.width || sourceCanvas.videoWidth || 0;
    const h = sourceCanvas.height || sourceCanvas.videoHeight || 0;
    if (!w || !h) return null;
    const x = Math.max(0, Math.min(w - 1, box.x));
    const y = Math.max(0, Math.min(h - 1, box.y));
    const bw = Math.max(1, Math.min(w - x, box.width));
    const bh = Math.max(1, Math.min(h - y, box.height));
    const target = 224;
    canvas.width = target;
    canvas.height = target;
    try {
      ctx.drawImage(sourceCanvas, x, y, bw, bh, 0, 0, target, target);
      return canvas;
    } catch (e) {
      return null;
    }
  }

  function boxIoU(a, b) {
    if (!a || !b) return 0;
    const x1 = Math.max(a.x, b.x);
    const y1 = Math.max(a.y, b.y);
    const x2 = Math.min(a.x + a.width, b.x + b.width);
    const y2 = Math.min(a.y + a.height, b.y + b.height);
    const interW = Math.max(0, x2 - x1);
    const interH = Math.max(0, y2 - y1);
    const inter = interW * interH;
    const areaA = Math.max(0, a.width) * Math.max(0, a.height);
    const areaB = Math.max(0, b.width) * Math.max(0, b.height);
    const union = areaA + areaB - inter;
    if (!union) return 0;
    return inter / union;
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

  function enrollmentDescriptorStable(vectors) {
    const src = Array.isArray(vectors) ? vectors.filter(Array.isArray) : [];
    if (src.length < VIS_ENROLL_MIN_STABLE_SAMPLES) return false;
    const recent = src.slice(-VIS_ENROLL_STABILITY_WINDOW);
    if (recent.length < Math.min(VIS_ENROLL_STABILITY_WINDOW, VIS_ENROLL_MIN_STABLE_SAMPLES)) return false;
    const avg = averageVectors(recent);
    if (!avg.length) return false;
    let totalDistance = 0;
    for (let i = 0; i < recent.length; i += 1) {
      totalDistance += euclideanDistance(recent[i], avg);
    }
    const meanDistance = totalDistance / Math.max(1, recent.length);
    return meanDistance <= VIS_ENROLL_MAX_AVG_DISTANCE;
  }

  function addLog(role, text) {
    const row = document.createElement("div");
    row.className = "pi-log-row " + (role === "user" ? "user" : "assistant");
    const content = String(text || "")
      .replace(/^You:\s*/i, "")
      .replace(/^Aevra AI:\s*/i, "");
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
      addLog("assistant", "Aevra AI: Wake word detected (" + heard + ").");
    } else {
      addLog("assistant", "Aevra AI: Wake word detected.");
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
      addLog("assistant", "Aevra AI: Wake mode active. Say 'Hey Aevra AI' or 'Aevra AI'.");
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
      if (isOffline()) return null;
      if (!window.firebase || !firebase.firestore) return null;
      return firebase.firestore();
    } catch (e) {
      return null;
    }
  }

  function getFirebaseAuthedUser() {
    try {
      if (isOffline()) return null;
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
        if (isOffline()) {
          dbg("cloud memory disabled: offline mode");
          return;
        }
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
          const who = m.role === "assistant" ? "Aevra AI" : "User";
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
    if (topStatusLabelEl) {
      visLastKnownUserLabel = label || visLastKnownUserLabel || "Unknown";
      updateTopStatusLabel();
    }
  }

  function getVisProfileStorePath(uid, fileName) {
    return "users/" + String(uid || "") + "/pi_vis_identity_profiles/" + String(fileName || "");
  }

  function setAssistantStateForVisOffline(reason) {
    setAssistantState("idle", "Offline");
    setVisOfflineState(true, reason || "Offline - no face");
  }

  function setVisScanStatus(message, options) {
    const opts = options && typeof options === "object" ? options : {};
    const offline = opts.offline !== false;
    const label = String(opts.label || "Scanning");
    const reason = String(message || label || "Scanning");
    orbBtn.classList.remove("idle", "listening", "thinking", "speaking");
    orbBtn.classList.add("idle");
    panel.classList.remove("state-idle", "state-listening", "state-thinking", "state-speaking");
    panel.classList.add("state-idle");
    assistantState = "idle";
    stateEl.textContent = label;
    setVisOfflineState(offline, reason);
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
      addLog("assistant", "Aevra AI: " + String(pending.answer || ""));
      pushHistory("assistant", String(pending.answer || ""));
      await playAevraAITTS(String(pending.speakText || pending.answer || ""));
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
    const identity = getAuthIdentity();
    const db = getFirestoreDb();
    const au = getFirebaseAuthedUser();
    const uid = au && au.uid ? String(au.uid) : getCurrentUid();
    if (!identity || !profile || !db || !uid) return false;
    try {
      const payload = Object.assign({}, profile, {
        updated_at: nowIso(),
        auth_identity: {
          user_id: identity.user_id,
          email: identity.email,
          name: identity.name,
          avatar: identity.avatar,
        },
      });
      await db.collection("users")
        .doc(uid)
        .collection("pi_vis_identity_profiles")
        .doc(String(profile.file_name))
        .set(payload, { merge: true });
      return true;
    } catch (e) {
      dbg("VIS cloud profile save failed", e && e.message);
      return false;
    }
  }

  async function loadVisProfilesFromCloud() {
    if (visCloudLoadInFlight) return visRecognitionIndex.slice();
    const identity = getAuthIdentity();
    const db = getFirestoreDb();
    const au = getFirebaseAuthedUser();
    const uid = au && au.uid ? String(au.uid) : getCurrentUid();
    if (!identity || !db || !uid) return [];
    visCloudLoadInFlight = true;
    try {
      const snap = await db.collection("users")
        .doc(uid)
        .collection("pi_vis_identity_profiles")
        .limit(1)
        .get();
      let profile = null;
      if (snap && snap.forEach) {
        snap.forEach(function (docSnap) {
          if (profile) return;
          const data = docSnap && docSnap.data ? docSnap.data() : null;
          if (!data) return;
          profile = data;
        });
      }
      if (!profile) {
        profile = buildAuthBackedProfile(identity, null);
        await saveVisProfileToCloud(profile);
      }
      visRecognitionIndex = [{
        profileFile: String(profile.file_name || ""),
        vector: [],
        username: String((profile.user_identity && profile.user_identity.username) || identity.user_id),
        profile: profile,
        vector_model: "auth_identity",
      }];
      visIndexLoaded = true;
      updateVisExpectedProfile();
      dbg("VIS auth index loaded", visRecognitionIndex.length);
      return visRecognitionIndex.slice();
    } catch (e) {
      dbg("VIS auth index load failed", e && e.message);
      const fallbackProfile = buildAuthBackedProfile(identity, null);
      visRecognitionIndex = [{
        profileFile: String(fallbackProfile.file_name || ""),
        vector: [],
        username: String((fallbackProfile.user_identity && fallbackProfile.user_identity.username) || identity.user_id),
        profile: fallbackProfile,
        vector_model: "auth_identity",
      }];
      visIndexLoaded = true;
      updateVisExpectedProfile();
      return visRecognitionIndex.slice();
    } finally {
      visCloudLoadInFlight = false;
    }
  }

  async function loadVisProfilesFromRepoIndex() {
    try {
      const res = await fetch("vis_identity_profiles/index.json", { cache: "no-store" });
      if (!res.ok) return visRecognitionIndex.slice();
      const data = await res.json();
      if (!Array.isArray(data)) return visRecognitionIndex.slice();
      visRecognitionIndex = data.map(function (row) {
        return {
          profileFile: String(row.profileFile || row.file_name || ""),
          vector: Array.isArray(row.vector) ? row.vector.slice(0) : [],
          username: String(row.username || row.profileFile || "user"),
          profile: null,
          vector_model: String(row.vector_model || row.signature_model || "legacy"),
        };
      }).filter(function (row) { return row.profileFile && row.vector.length; });
      visIndexLoaded = true;
      updateVisExpectedProfile();
      dbg("VIS index loaded (repo)", visRecognitionIndex.length);
      return visRecognitionIndex.slice();
    } catch (e) {
      dbg("VIS repo index load failed", e && e.message);
      return visRecognitionIndex.slice();
    }
  }

  async function fetchVisProfileFromRepo(profileFile) {
    const file = String(profileFile || "").trim();
    if (!file) return null;
    try {
      const res = await fetch("vis_identity_profiles/" + encodeURIComponent(file), { cache: "no-store" });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data || !data.file_name) return null;
      return data;
    } catch (e) {
      return null;
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
    if (!p) {
      visAgentContext = null;
      try { window.__PI_AGENT_CONTEXT__ = null; } catch (e) {}
      return;
    }
    visActiveProfile = p;
    visLastKnownUserLabel = getVisDisplayName(p);
    visPersonalizationProfile = Object.assign({}, visPersonalizationProfile || {}, p.personalization_profile || {});
    visBehaviorConfig = Object.assign({}, visBehaviorConfig || {}, p.ai_behavior_configuration || {});
    visUserInstance = {
      profile_file: String(p.file_name || ""),
      runtime_key: "vis_instance_" + String(p.file_name || "") + "_" + Date.now().toString(36),
      loaded_at: nowIso(),
    };
    syncPiAgentContext(p);
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
    if (topStatusLabelEl) updateTopStatusLabel();
  }

  async function switchToVisProfile(profile) {
    if (!profile || !profile.file_name) return;
    const hydratedProfile = await hydratePiUserConfig(profile);
    const nextFile = String(profile.file_name);
    const currentFile = visActiveProfile && visActiveProfile.file_name ? String(visActiveProfile.file_name) : "";
    if (currentFile && currentFile !== nextFile && visSpeechState.active) {
      captureSpeechStateIntoPendingResponse();
      stopAevraAIAudio();
      visPausedAudioByOffline = false;
      visSpeechState = { active: false, text: "", started_at_ms: 0, provider: "" };
    }
    if (currentFile && currentFile !== nextFile) await persistActiveVisProfileNow();
    applyVisProfileToRuntime(hydratedProfile || profile);
    setVisOfflineState(false, "Online - " + visLastKnownUserLabel);
    showVisWelcome(visLastKnownUserLabel);
    if (visActiveProfile) {
      visActiveProfile.session_state = Object.assign({}, visActiveProfile.session_state || {}, {
        paused: false,
        last_active_timestamp: nowIso(),
      });
      scheduleVisProfileSave();
    }
    await resumeFromVisOnline();
    ensureVisPersonalAgent(visActiveProfile, "profile_switch");
  }

  async function savePiUserConfig(profile, answers) {
    if (!profile) return null;
    const userId = String((profile.user_identity && profile.user_identity.username) || profile.file_name || "").trim();
    if (!userId) return null;
    try {
      return await fetchSiteJson("/personal-intelligence/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          answers: answers || {},
          profile: profile,
          known_facts: knownFacts || {},
        }),
      });
    } catch (e) {
      dbg("PI config save failed", e && e.message);
      return null;
    }
  }

  function syncPiAgentContext(profile) {
    const p = profile && typeof profile === "object" ? profile : null;
    const agent = p && p.personal_intelligence_agent && typeof p.personal_intelligence_agent === "object"
      ? p.personal_intelligence_agent
      : {};
    const cloudConfig = agent.cloud_config && typeof agent.cloud_config === "object" ? agent.cloud_config : {};
    const aiConfig = p && p.ai_behavior_configuration && typeof p.ai_behavior_configuration === "object"
      ? p.ai_behavior_configuration
      : {};
    const personalizationPrompt = String(
      agent.personalization_prompt ||
      aiConfig.personalization_prompt ||
      cloudConfig.personalization_prompt ||
      (cloudConfig.ai_config && cloudConfig.ai_config.personalization_prompt) ||
      ""
    ).trim();
    visAgentContext = {
      user_id: String((p && p.user_identity && p.user_identity.username) || "").trim(),
      unique_id: String(agent.unique_identifier || cloudConfig.unique_id || cloudConfig.unique_identifier || "").trim(),
      profile_file: String((p && p.file_name) || "").trim(),
      personalization_prompt: personalizationPrompt,
      status: String(agent.status || "").trim() || "pending",
      profile_verified: !!agent.profile_verified,
      profile_verified_at: String(agent.profile_verified_at || "").trim(),
    };
    try {
      window.__PI_AGENT_CONTEXT__ = Object.assign({}, visAgentContext);
    } catch (e) {}
    if (visAgentContext.user_id || visAgentContext.unique_id) {
      pushVisDebug(
        "Active PI agent context ready: " +
        String(visAgentContext.user_id || "unknown") +
        (visAgentContext.unique_id ? (" / " + visAgentContext.unique_id) : "")
      );
    }
  }

  function getPiAgentRequestContext() {
    const base = visAgentContext && typeof visAgentContext === "object" ? visAgentContext : {};
    const profile = visActiveProfile && typeof visActiveProfile === "object" ? visActiveProfile : {};
    const agent = profile.personal_intelligence_agent && typeof profile.personal_intelligence_agent === "object"
      ? profile.personal_intelligence_agent
      : {};
    const cloudConfig = agent.cloud_config && typeof agent.cloud_config === "object" ? agent.cloud_config : {};
    return {
      user_id: String(base.user_id || (profile.user_identity && profile.user_identity.username) || "").trim(),
      unique_id: String(base.unique_id || agent.unique_identifier || cloudConfig.unique_id || cloudConfig.unique_identifier || "").trim(),
      profile_file: String(base.profile_file || profile.file_name || "").trim(),
      personalization_prompt: String(
        base.personalization_prompt ||
        agent.personalization_prompt ||
        (profile.ai_behavior_configuration && profile.ai_behavior_configuration.personalization_prompt) ||
        (cloudConfig.ai_config && cloudConfig.ai_config.personalization_prompt) ||
        ""
      ).trim(),
      profile_verified: typeof base.profile_verified === "boolean" ? base.profile_verified : !!agent.profile_verified,
      profile_verified_at: String(base.profile_verified_at || agent.profile_verified_at || "").trim(),
      status: String(base.status || agent.status || "").trim() || "pending",
    };
  }

  function emitVisHarmonyDebug(detail) {
    try {
      window.dispatchEvent(new CustomEvent("pi:harmony-debug", { detail: detail || {} }));
    } catch (e) {}
  }

  async function verifyPiProfileAssociation(profile, uniqueId) {
    const trimmedUniqueId = String(uniqueId || "").trim();
    const authIdentity = getAuthIdentity();
    const currentUserId = String((authIdentity && authIdentity.user_id) || (profile && profile.user_identity && profile.user_identity.username) || "").trim();
    const currentAccount = String((authIdentity && authIdentity.email) || "").trim().toLowerCase();
    const out = {
      ok: false,
      unique_identifier: trimmedUniqueId,
      verified_at: nowIso(),
      cloud_profile_found: false,
      account_match: false,
      firestore_file_found: false,
      file_name: String((profile && profile.file_name) || "").trim(),
      error: "",
    };
    if (!profile || !currentUserId || !trimmedUniqueId) {
      out.error = "missing_identity_verification_data";
      return out;
    }
    try {
      const cloud = await fetchSiteJson("/personal-intelligence/config?unique_id=" + encodeURIComponent(trimmedUniqueId), {
        method: "GET",
      });
      const savedProfile = cloud && cloud.profile ? cloud.profile : null;
      const savedUserId = String((savedProfile && savedProfile.user_id) || "").trim();
      const personalizationData = savedProfile && savedProfile.personalization_data && typeof savedProfile.personalization_data === "object"
        ? savedProfile.personalization_data
        : {};
      const identitySnapshot = personalizationData.identity_snapshot && typeof personalizationData.identity_snapshot === "object"
        ? personalizationData.identity_snapshot
        : {};
      const savedEmail = String(identitySnapshot.email || "").trim().toLowerCase();
      out.cloud_profile_found = !!savedProfile;
      out.account_match = savedUserId === currentUserId || (!!currentAccount && savedEmail === currentAccount);
      if (!out.cloud_profile_found || !out.account_match) {
        out.error = !out.cloud_profile_found ? "unique_id_not_found" : "unique_id_account_mismatch";
        return out;
      }
    } catch (e) {
      out.error = "profile_lookup_failed";
      return out;
    }
    try {
      const db = getFirestoreDb();
      const au = getFirebaseAuthedUser();
      const uid = au && au.uid ? String(au.uid) : getCurrentUid();
      if (!db || !uid || !out.file_name) {
        out.error = "firestore_unavailable";
        return out;
      }
      const snap = await db.collection("users")
        .doc(uid)
        .collection("pi_vis_identity_profiles")
        .doc(out.file_name)
        .get();
      const data = snap && snap.exists && snap.data ? snap.data() : null;
      const auth = data && data.auth_identity && typeof data.auth_identity === "object" ? data.auth_identity : {};
      out.firestore_file_found = !!data;
      const fileMatches = !!data && (
        String(auth.user_id || "").trim() === currentUserId ||
        String(auth.email || "").trim().toLowerCase() === currentAccount
      );
      out.ok = out.cloud_profile_found && out.account_match && out.firestore_file_found && fileMatches;
      if (!out.ok) out.error = out.firestore_file_found ? "firestore_account_mismatch" : "firestore_profile_missing";
      return out;
    } catch (e) {
      out.error = "firestore_profile_lookup_failed";
      return out;
    }
  }

  async function warmHarmonyPersonalization(profile, answers, uniqueId) {
    try {
      const tailoredAgent = buildTailoredAgentSnapshot(profile, answers);
      const expectedUniqueId = String(uniqueId || (profile && profile.personal_intelligence_agent && profile.personal_intelligence_agent.unique_identifier) || "").trim();
      const activationPrompt = [
        "Personalization completed for a newly registered Personal Intelligence user.",
        "Use every onboarding detail below to initialize this user's unique tailored agent.",
        "Store and respect the preferred_name for normal conversation.",
        "Store and respect the full_name for formal requests.",
        "Return exactly one line in this format: UNIQUE_ID:" + expectedUniqueId,
        "Onboarding answers JSON:",
        JSON.stringify(answers || {}),
        "Tailored agent JSON:",
        JSON.stringify(tailoredAgent || {}),
      ].join("\n");
      const response = await fetchJson("/personal-intelligence/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: activationPrompt,
          email: EMAIL,
          language: localStorage.getItem("g9_language") || "English",
          subject: localStorage.getItem("g9_subject") || "General",
          title: "Personal Intelligence",
          history: [],
          known_facts: Object.assign({}, knownFacts, answers || {}, {
            name: String(answers && (answers.preferred_name || answers.full_name) || "").trim(),
            preferred_name: String(answers && answers.preferred_name || "").trim(),
            full_name: String(answers && answers.full_name || "").trim(),
            formal_name: String(answers && answers.full_name || "").trim(),
          }),
          mode: "personalized_activation",
          memory_context: buildLongTermMemoryContext(),
          system_prompt: buildAevraAISystemPrompt("personalized_activation", localStorage.getItem("g9_language") || "English", localStorage.getItem("g9_subject") || "General", knownFacts),
          user_id: String((profile && profile.user_identity && profile.user_identity.username) || "").trim(),
          unique_id: expectedUniqueId,
          personalization_prompt: String((profile && profile.personal_intelligence_agent && profile.personal_intelligence_agent.personalization_prompt) || "").trim(),
        }),
      });
      const answer = String(response && response.answer || "").trim();
      const echoedId = answer.indexOf("UNIQUE_ID:") >= 0 ? answer.split("UNIQUE_ID:").pop().trim() : "";
      return !!(response && !response.harmony_failed && (!expectedUniqueId || echoedId === expectedUniqueId));
    } catch (e) {
      pushVisDebug("Harmony personalization warmup failed: " + String((e && e.message) || e));
      return false;
    }
  }

  function mergePiConfigIntoProfile(profile, config) {
    if (!profile || !config || typeof config !== "object") return profile;
    const next = Object.assign({}, profile);
    const sourceConfig = config.user_config && typeof config.user_config === "object" ? config.user_config : config;
    const onboardingAnswers = sourceConfig.personalization_data && sourceConfig.personalization_data.onboarding_answers && typeof sourceConfig.personalization_data.onboarding_answers === "object"
      ? sourceConfig.personalization_data.onboarding_answers
      : {};
    if (sourceConfig.personalization_data || sourceConfig.ai_config) {
      next.personalization_profile = Object.assign({}, next.personalization_profile || {}, sourceConfig.personalization_data || {});
      next.ai_behavior_configuration = Object.assign({}, next.ai_behavior_configuration || {}, sourceConfig.ai_config || {});
      next.learned_preferences = Object.assign(
        {},
        next.learned_preferences || {},
        sourceConfig.personalization_data && sourceConfig.personalization_data.memory && sourceConfig.personalization_data.memory.known_facts || {}
      );
    } else {
      next.personalization_profile = Object.assign({}, next.personalization_profile || {}, sourceConfig.preferences || {});
      next.ai_behavior_configuration = Object.assign({}, next.ai_behavior_configuration || {}, sourceConfig.ai_behavior || {});
      next.learned_preferences = Object.assign({}, next.learned_preferences || {}, (sourceConfig.memory && sourceConfig.memory.facts) || {});
    }
    next.personal_intelligence_agent = Object.assign({}, next.personal_intelligence_agent || {}, {
      cloud_config: sourceConfig,
      unique_identifier: sourceConfig.unique_id || sourceConfig.unique_identifier || "",
      status: "ready",
      personalization_answers: Object.assign({}, next.personal_intelligence_agent && next.personal_intelligence_agent.personalization_answers || {}, onboardingAnswers),
      tailored_agent: Object.assign({}, next.personal_intelligence_agent && next.personal_intelligence_agent.tailored_agent || {}, {
        unique_id: sourceConfig.unique_id || sourceConfig.unique_identifier || "",
        preferred_name: String(onboardingAnswers.preferred_name || "").trim(),
        full_name: String(onboardingAnswers.full_name || "").trim(),
        interests: Array.isArray(sourceConfig.personalization_data && sourceConfig.personalization_data.interests) ? sourceConfig.personalization_data.interests.slice(0, 12) : [],
        goals: Array.isArray(sourceConfig.personalization_data && sourceConfig.personalization_data.goals) ? sourceConfig.personalization_data.goals.slice(0, 12) : [],
        tone: String(sourceConfig.ai_config && sourceConfig.ai_config.tone || "").trim(),
        communication_style: String(sourceConfig.ai_config && sourceConfig.ai_config.communication_style || "").trim(),
        response_identity_rules: {
          casual_name: String(onboardingAnswers.preferred_name || onboardingAnswers.full_name || "").trim(),
          formal_name: String(onboardingAnswers.full_name || onboardingAnswers.preferred_name || "").trim(),
        },
      }),
    });
    next.user_identity = Object.assign({}, next.user_identity || {}, {
      display_name: String(onboardingAnswers.preferred_name || onboardingAnswers.full_name || (next.user_identity && next.user_identity.display_name) || "").trim() || String((next.user_identity && next.user_identity.display_name) || ""),
      preferred_name: String(onboardingAnswers.preferred_name || (next.user_identity && next.user_identity.preferred_name) || "").trim(),
      full_name: String(onboardingAnswers.full_name || (next.user_identity && next.user_identity.full_name) || "").trim(),
    });
    next.learned_preferences = Object.assign({}, next.learned_preferences || {}, {
      name: String(onboardingAnswers.preferred_name || onboardingAnswers.full_name || (next.learned_preferences && next.learned_preferences.name) || "").trim(),
      preferred_name: String(onboardingAnswers.preferred_name || (next.learned_preferences && next.learned_preferences.preferred_name) || "").trim(),
      full_name: String(onboardingAnswers.full_name || (next.learned_preferences && next.learned_preferences.full_name) || "").trim(),
      formal_name: String(onboardingAnswers.full_name || (next.learned_preferences && next.learned_preferences.formal_name) || "").trim(),
    });
    return next;
  }

  async function hydratePiUserConfig(profile) {
    const userId = String((profile && profile.user_identity && profile.user_identity.username) || profile.file_name || "").trim();
    if (!userId) return profile;
    try {
      const out = await fetchSiteJson("/personal-intelligence/config?user_id=" + encodeURIComponent(userId), {
        method: "GET",
      });
      if (!out) return profile;
      if (out.profile) return mergePiConfigIntoProfile(profile, out.profile);
      if (!out.config) return profile;
      return mergePiConfigIntoProfile(profile, out.config.user_config || out.config);
    } catch (e) {
      dbg("PI config hydrate failed", e && e.message);
      return profile;
    }
  }

  async function detectFacesFromVideo() {
    return [];
  }

  function extractVisFaceVector(face) {
    if (!visVideoEl || !face || !face.boundingBox) return [];
    const box = face.boundingBox;
    const vw = Number(visVideoEl.videoWidth || 0);
    const vh = Number(visVideoEl.videoHeight || 0);
    if (vw < 16 || vh < 16) return [];
    const sx = Math.max(0, Math.floor(box.x));
    const sy = Math.max(0, Math.floor(box.y));
    const sw = Math.max(8, Math.floor(box.width));
    const sh = Math.max(8, Math.floor(box.height));
    const canvas = getVisProcessingCanvas();
    canvas.width = 48;
    canvas.height = 48;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
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

  function findVisMatch(vector, vectorModel) {
    const input = Array.isArray(vector) ? vector : [];
    if (!input.length || !visRecognitionIndex.length) return null;
    let best = null;
    for (let i = 0; i < visRecognitionIndex.length; i += 1) {
      const row = visRecognitionIndex[i];
      if (vectorModel) {
        const rowModel = String(row.vector_model || "").toLowerCase();
        if (rowModel && rowModel !== String(vectorModel).toLowerCase()) continue;
      }
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
    visSetupState = Object.assign({}, visSetupState, {
      step: 1,
      agreed: false,
      retrievalReady: false,
      retrievalMessage: "",
      pendingProfile: null,
      enrollmentCoverage: {},
      enrollmentInstruction: "",
      enrollmentCaptured: 0,
      enrollmentConfidence: 0,
      enrollmentStable: false,
    });
    setAssistantStateForVisOffline("Setup required - enroll visual identity");
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
        '<div class="pi-vis-actions"><button type="button" class="pi-vis-btn" data-vis-action="continue">Continue</button></div>' +
        '<div class="pi-vis-note">Enrollment flow will complete in under 15 seconds once you proceed.</div>';
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
    } else if (visSetupState.step === 6) {
      const ready = !!visSetupState.retrievalReady;
      const message = String(visSetupState.retrievalMessage || (ready
        ? "Identity file retrieved successfully. Continue to start testing."
        : "Waiting for file creation and retrieval..."));
      body.innerHTML =
        '<p><strong>Creating and retrieving your visual identity file...</strong></p>' +
        '<p>This stage waits until your enrolled identity file is available to the assistant runtime.</p>' +
        '<div class="pi-vis-progress"><div class="pi-vis-progress-bar"></div></div>' +
        '<div class="pi-vis-note">' + message.replace(/[<>&]/g, function (ch) {
          return ch === "<" ? "&lt;" : (ch === ">" ? "&gt;" : "&amp;");
        }) + '</div>' +
        '<div class="pi-vis-actions"><button type="button" class="pi-vis-btn" data-vis-action="continue" ' + (ready ? "" : "disabled") + '>Continue</button></div>';
      const bar = body.querySelector(".pi-vis-progress-bar");
      if (bar) bar.style.width = ready ? "100%" : "72%";
    } else {
      const captured = Math.max(0, Number(visSetupState.enrollmentCaptured || 0));
      const pct = visSetupState.enrollmentStable ? 100 : Math.min(94, Math.round(Math.min(captured, VIS_ENROLL_MIN_STABLE_SAMPLES) / Math.max(1, VIS_ENROLL_MIN_STABLE_SAMPLES) * 100));
      const instruction = String(visSetupState.enrollmentInstruction || "Registering face... keep your face inside the frame while the system learns your facial signature.");
      body.innerHTML =
        '<p>Scanning in progress...</p>' +
        '<div class="pi-vis-camera-stage" style="margin:12px 0 14px;position:relative;border-radius:18px;overflow:hidden;border:1px solid rgba(96,165,250,0.35);background:#020617;">' +
          '<div class="pi-vis-camera-mount" style="position:relative;width:100%;aspect-ratio:4/3;min-height:240px;"></div>' +
        '</div>' +
        '<div class="pi-vis-progress"><div class="pi-vis-progress-bar"></div></div>' +
        '<div class="pi-vis-note">' + instruction.replace(/[<>&]/g, function (ch) {
          return ch === "<" ? "&lt;" : (ch === ">" ? "&gt;" : "&amp;");
        }) + '</div>' +
        '<div class="pi-vis-note">Native samples captured: ' + String(captured) + '.</div>' +
        '<div class="pi-vis-note">Live confidence: ' + Number(visSetupState.enrollmentConfidence || 0).toFixed(2) + ' / ' + VIS_ENROLL_MIN_CONFIDENCE.toFixed(2) + '.</div>' +
        '<div class="pi-vis-note">Registration stability: ' + (visSetupState.enrollmentStable ? 'stable - ready to continue.' : 'measuring until your face signature is consistent.') + '</div>';
      const bar = body.querySelector(".pi-vis-progress-bar");
      if (bar) bar.style.width = pct + "%";
    }
    syncVisPreviewMount();

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
        btn.addEventListener("click", function (ev) {
          if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
          if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
          const action = String(btn.getAttribute("data-vis-action") || "");
          if (action === "back") {
            visSetupState.step = Math.max(1, visSetupState.step - 1);
            renderVisSetup();
            return;
          }
          if (action === "continue") {
            if (visSetupState.step === 6) {
              if (!visSetupState.retrievalReady || !visSetupState.pendingProfile) return;
              visAllowTestingStage = true;
              closeVisSetup();
              startVisVerificationStage(visSetupState.pendingProfile);
              return;
            }
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
    if (visEnrollmentSubmitting) return;
    const payload = visPendingEnrollmentPayload;
    if (!payload || !Array.isArray(payload.frames) || !payload.frames.length) {
      pushVisDebug("Enrollment continue clicked without pending payload.");
      return;
    }
    visEnrollmentSubmitting = true;
    try {
      const identityHints = getSignedInIdentityHints();
      const requested = sanitizeVisUsername(visSetupState.username) || sanitizeVisUsername(identityHints.username) || "user";
      const signatureModel = String((payload && payload.signatureModel) || VIS_ACTIVE_FACE_ENGINE || "faceapi");
      const descriptorVectors = Array.isArray(payload && payload.descriptors) ? payload.descriptors.filter(Array.isArray) : [];
      const averagedDescriptor = averageVectors(descriptorVectors);
      if (signatureModel === "faceapi" && !averagedDescriptor.length) throw new Error("face-api descriptor capture failed");
      const profile = getDefaultVisProfile(requested, identityHints.account_identifier, {
        scan_mode: visSetupState.infrared ? "infrared_assisted" : "standard_rgb",
        frame_count: payload.frameCount || 0,
        landmark_vectors: Array.isArray(payload && payload.landmarkVectors) ? payload.landmarkVectors.slice(0) : [],
        feature_embedding: averagedDescriptor.slice(0),
        feature_vector: averagedDescriptor.slice(0),
        signature_model: signatureModel,
        symmetry_metrics: {
          embedding_dimensions: averagedDescriptor.length,
          sample_count: payload.frameCount || 0,
        },
        geometry_map: {
          geometry_snapshots: Array.isArray(payload && payload.geometrySnapshots) ? payload.geometrySnapshots.slice(0) : [],
          extraction: "face-api.js browser registration",
        },
        created_at: nowIso(),
      });
      profile.face_registration = {
        provider: "face-api.js",
        registered_frames: payload.frameCount || 0,
        coverage: Array.isArray(payload.coverage) ? payload.coverage.slice(0) : [],
      };
      visSetupState.step = 6;
      visSetupState.retrievalReady = false;
      visSetupState.retrievalMessage = "Waiting for file creation and retrieval...";
      visSetupState.pendingProfile = null;
      renderVisSetup();
      pushVisDebug("Creating identity file and waiting for retrieval.");
      await saveVisProfileToCloud(profile);
      await createVisProfileArtifactInRepo(profile);
      const retrievedProfile = await waitForRetrievedVisProfile(profile);
      const existingIndex = visRecognitionIndex.find(function (row) {
        return row && String(row.profileFile || "") === String(retrievedProfile.file_name || "");
      });
      if (existingIndex) {
        existingIndex.username = String((retrievedProfile.user_identity && retrievedProfile.user_identity.username) || existingIndex.username || "");
        existingIndex.profile = retrievedProfile;
        existingIndex.vector_model = signatureModel;
        existingIndex.vector = averagedDescriptor.slice(0);
      } else {
        visRecognitionIndex.push({
          profileFile: retrievedProfile.file_name,
          username: retrievedProfile.user_identity.username,
          vector: averagedDescriptor.slice(0),
          profile: retrievedProfile,
          vector_model: signatureModel,
        });
      }
      pushVisDebug("Identity profile file created: " + profile.file_name);
      pushVisDebug("Identity username resolved as: " + String((profile.user_identity && profile.user_identity.username) || "unknown"));
      pushVisDebug("Identity profile retrieval complete. Continue to start testing stage.");
      visPendingEnrollmentPayload = null;
      visSetupState.retrievalReady = true;
      visSetupState.retrievalMessage = "Identity file retrieved successfully. Continue to start testing.";
      visSetupState.pendingProfile = retrievedProfile;
      renderVisSetup();
    } catch (error) {
      pushVisDebug("Enrollment failed: " + String((error && error.message) || error));
      addLog("assistant", "Aevra AI: Visual setup could not finish yet. Please try the scan again.");
      visSetupState.step = 5;
      visSetupState.retrievalReady = false;
      visSetupState.retrievalMessage = "";
      visSetupState.pendingProfile = null;
      renderVisSetup();
    } finally {
      visEnrollmentSubmitting = false;
    }
  }

  async function waitForRetrievedVisProfile(profile) {
    const targetFile = String((profile && profile.file_name) || "").trim();
    const targetUser = String((profile && profile.user_identity && profile.user_identity.username) || "").trim();
    if (!targetFile && !targetUser) throw new Error("Missing identity file reference");
    for (let attempt = 1; attempt <= VIS_SETUP_RETRIEVE_MAX_TRIES; attempt += 1) {
      visSetupState.retrievalMessage =
        "Waiting for file creation and retrieval... attempt " + attempt + " of " + VIS_SETUP_RETRIEVE_MAX_TRIES + ".";
      renderVisSetup();
      const index = await loadVisProfilesFromCloud();
      const row = (Array.isArray(index) ? index : []).find(function (entry) {
        if (!entry) return false;
        const fileMatch = targetFile && String(entry.profileFile || "") === targetFile;
        const userMatch = targetUser && String(entry.username || "") === targetUser;
        return !!(fileMatch || userMatch);
      }) || null;
      if (row && row.profile && row.profile.file_name) {
        return row.profile;
      }
      const repoProfile = await fetchVisProfileFromRepo(targetFile);
      if (repoProfile && repoProfile.file_name) {
        return repoProfile;
      }
      if (attempt < VIS_SETUP_RETRIEVE_MAX_TRIES) {
        await new Promise(function (resolve) { setTimeout(resolve, VIS_SETUP_RETRIEVE_DELAY_MS); });
      }
    }
    throw new Error("Timed out waiting for identity file retrieval");
  }

  async function startVisEnrollment() {
    if (visScanning) return;
    visScanning = true;
    visSetupState.step = 4;
    visSetupState.enrollmentCoverage = {};
    visSetupState.enrollmentCaptured = 0;
    visSetupState.enrollmentConfidence = 0;
    visSetupState.enrollmentStable = false;
    visSetupState.enrollmentInstruction = "Registering face... keep your face inside the frame while the system learns your facial signature.";
    try { renderVisSetup(); } catch (e) { pushVisDebug("scan step render failed: " + String((e && e.message) || e)); }
    pushVisDebug("Face scan started (face-api.js browser runtime).");
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
    const frames = [];
    const descriptors = [];
    const landmarkVectors = [];
    const geometrySnapshots = [];
    const confidenceSamples = [];
    let idleLoops = 0;
    while (true) {
      await new Promise(function (resolve) { setTimeout(resolve, VIS_ENROLL_CAPTURE_DELAY_MS); });
      const frame = captureVisFrameDataUrl();
      if (!frame) {
        idleLoops += 1;
        visSetupState.enrollmentInstruction = "Camera frame unavailable. Keep the camera on your face.";
        try { renderVisSetup(); } catch (e) {}
        continue;
      }
      let detect = null;
      try {
        detect = await processVisFaceApiFrame();
      } catch (e) {
        detect = null;
      }
      if (!detect || !detect.faceDetected || !Array.isArray(detect.faces) || !detect.faces.length) {
        renderVisTrackingOverlay([], null);
        idleLoops += 1;
        visSetupState.enrollmentInstruction = "No face detected. Bring your full face back into the frame so registration can continue.";
        try { renderVisSetup(); } catch (e) {}
        continue;
      }
      idleLoops = 0;
      if (Number(detect.faceCount || 0) > 1) {
        visSetupState.enrollmentInstruction = "Only one face can be registered at a time. Keep a single face in frame.";
        try { renderVisSetup(); } catch (e) {}
        continue;
      }
      const primaryFace = selectPrimaryFace(detect.faces);
      const liveConfidence = Number(primaryFace && primaryFace.confidence || 0);
      visSetupState.enrollmentConfidence = liveConfidence;
      renderVisTrackingOverlay(detect.faces, primaryFace);
      const faceDescriptor = primaryFace && Array.isArray(primaryFace.descriptor) ? primaryFace.descriptor.slice(0) : [];
      if (!faceDescriptor.length) {
        visSetupState.enrollmentInstruction = "Registering face... hold still while the system reads more facial details.";
        try { renderVisSetup(); } catch (e) {}
        continue;
      }
      descriptors.push(faceDescriptor);
      frames.push(frame);
      confidenceSamples.push(liveConfidence);
      if (confidenceSamples.length > VIS_ENROLL_STABILITY_WINDOW) confidenceSamples.shift();
      const faceLandmarks = getFaceLandmarks(primaryFace);
      if (faceLandmarks.length) landmarkVectors.push(faceLandmarks);
      const box = getFaceBox(primaryFace);
      if (box) {
        geometrySnapshots.push({
          box: Object.assign({}, box),
          pose_hint: String(primaryFace.pose_hint || "center"),
          emotion: String(primaryFace.emotion || "neutral"),
          captured_at: nowIso(),
        });
      }
      visSetupState.enrollmentCaptured = descriptors.length;
      const stableDescriptors = enrollmentDescriptorStable(descriptors);
      const avgConfidence = confidenceSamples.length
        ? (confidenceSamples.reduce(function (sum, n) { return sum + Number(n || 0); }, 0) / confidenceSamples.length)
        : 0;
      visSetupState.enrollmentStable = !!(stableDescriptors && avgConfidence >= VIS_ENROLL_MIN_CONFIDENCE);
      visSetupState.enrollmentInstruction = visSetupState.enrollmentStable
        ? "Registration stable. Your face signature is ready. Continue when ready."
        : "Registering face... still learning your facial signature. Hold steady and keep your face centered.";
      try { renderVisSetup(); } catch (e) {}
      if (visSetupState.enrollmentStable) {
        pushVisDebug("Enrollment stabilized after " + String(descriptors.length) + " samples at avg confidence " + avgConfidence.toFixed(2));
        break;
      }
      if (idleLoops > 150) {
        break;
      }
    }
    visScanning = false;
    if (!frames.length) {
      visSetupState.step = 3;
      try { renderVisSetup(); } catch (e) { pushVisDebug("scan fail render failed: " + String((e && e.message) || e)); }
      pushVisDebug("Face scan captured 0 valid frames.");
      addLog("assistant", "Aevra AI: Setup scan failed. Keep face in frame and retry.");
      return;
    }
    pushVisDebug("Scan completed with face-api.js registration frames: " + String(frames.length));
    visPendingEnrollmentPayload = {
      frames: frames.slice(0),
      frameCount: frames.length,
      signatureModel: "faceapi",
      coverage: [],
      descriptors: descriptors.slice(0),
      landmarkVectors: landmarkVectors.slice(0),
      geometrySnapshots: geometrySnapshots.slice(0),
    };
    visSetupState.step = 5;
    renderVisSetup();
    pushVisDebug("Scan complete step ready. Click Continue to create file and run testing stage.");
  }

  async function handleVisRecognitionVector(result) {
    if (!result || !result.faceDetected) {
      visRecognizingSince = 0;
      renderVisTrackingOverlay([], null);
      setVisScanStatus("No Face Detected", { label: "Offline", offline: true });
      return;
    }
    const primaryFace = selectPrimaryFace(result.faces || []);
    renderVisTrackingOverlay(result.faces || [], primaryFace);
    setVisScanStatus("Face Detected", { label: "Scanning", offline: true });
    const userId = String(result.user_id || "");
    if (!userId) {
      visNoMatchCount += 1;
      if (visNoMatchCount >= VIS_MATCH_STABLE_COUNT) {
        if (!visRecognizingSince) visRecognizingSince = Date.now();
        if (visExpectedProfileFile) {
          if (Date.now() - visRecognizingSince < 1800) {
            setVisScanStatus("Recognizing user", { label: "Scanning", offline: true });
          } else {
            visExpectedProfileFile = "";
            setVisScanStatus("User Not Registered", { label: "Scanning", offline: true });
            if (!visSetupOpen && !visPersonalizeOpen) openVisSetup();
          }
        } else {
          if (!visUnknownFaceSince) visUnknownFaceSince = Date.now();
          if (Date.now() - visUnknownFaceSince > 2500) {
            setVisScanStatus("User Not Registered", { label: "Scanning", offline: true });
            if (!visSetupOpen && !visPersonalizeOpen) openVisSetup();
          }
        }
      }
      return;
    }
    visUnknownFaceSince = 0;
    visRecognizingSince = 0;
    visNoMatchCount = 0;
    if (visRecognitionCandidate.profileFile === userId) {
      visRecognitionCandidate.count += 1;
    } else {
      visRecognitionCandidate = { profileFile: userId, count: 1 };
    }
    if (visRecognitionCandidate.count < VIS_MATCH_STABLE_COUNT) {
      setVisScanStatus("Recognizing user", { label: "Scanning", offline: true });
      return;
    }
    visLastRecognitionAt = Date.now();
    dbg("recognized user = true");
    dbg("recognized users username = " + String(userId || "unknown"));
    const activeUser = visActiveProfile && visActiveProfile.user_identity && visActiveProfile.user_identity.username
      ? String(visActiveProfile.user_identity.username)
      : "";
    if (activeUser !== userId) {
      await loadVisProfilesFromCloud();
      let profile = null;
      const hit = visRecognitionIndex.find(function (row) {
        return String(row && (row.username || row.user_id || "")) === userId;
      });
      if (hit && hit.profile) profile = hit.profile;
      if (!profile) profile = await fetchVisProfileFromRepo(userId + VIS_PROFILE_EXTENSION);
      if (profile) {
        setVisScanStatus("Recognized user: " + userId, { label: "Scanning", offline: false });
        await switchToVisProfile(profile);
      } else {
        setVisScanStatus("User Not Registered", { label: "Scanning", offline: true });
        if (!visSetupOpen && !visPersonalizeOpen) openVisSetup();
      }
    } else {
      setVisScanStatus("Recognized user: " + userId, { label: "Scanning", offline: false });
      if (visOffline) await resumeFromVisOnline();
      if (visActiveProfile) ensureVisPersonalAgent(visActiveProfile, "recognition");
    }
  }

  async function processVisFrame() {
    if (visDetectBusy || !visVideoEl || visSetupOpen || visScanning || visVerificationBusy) return;
    visDetectBusy = true;
    try {
      if (!visVideoEl.srcObject || !visVideoEl.videoWidth || !visVideoEl.videoHeight) {
        const now = Date.now();
        if ((now - visLastCameraReadyAttemptAt) >= VIS_CAMERA_READY_RETRY_MS) {
          visLastCameraReadyAttemptAt = now;
          setVisScanStatus("Requesting camera access", { label: "Scanning", offline: true });
          const cameraReady = await ensureVisCameraReady();
          if (!cameraReady) return;
        } else {
          setVisScanStatus("Requesting camera access", { label: "Scanning", offline: true });
          return;
        }
      }
      if (!visIndexLoaded) await loadVisProfilesFromCloud();
      if (VIS_ACTIVE_FACE_ENGINE !== "faceapi" && visBackendBackoffUntil > Date.now()) {
        setVisScanStatus("VIS backend busy - retrying", { label: "Offline", offline: true });
        return;
      }
      const result = await processVisBackendFrame();
      visLastBackendError = "";
      visBackendBackoffUntil = 0;
      if (!result || !result.faceDetected) {
        if (visLastRecognitionAt && (Date.now() - visLastRecognitionAt) < VIS_RECOGNITION_HOLD_MS && visActiveProfile) {
          setVisScanStatus("Recognized user: " + String(visLastKnownUserLabel || "User"), { label: "Scanning", offline: false });
          return;
        }
        visFacePresent = false;
        visRecognizingSince = 0;
        visRecognitionCandidate = { profileFile: "", count: 0 };
        visNoMatchCount = 0;
        const scanAge = visCurrentCameraScanStartedAt ? (Date.now() - visCurrentCameraScanStartedAt) : 0;
        if (scanAge < VIS_CAMERA_SCAN_PER_INPUT_MS) {
          setVisScanStatus("Searching " + getCurrentVisCameraLabel(), { label: "Scanning", offline: true });
          return;
        }
        await advanceVisCameraInput();
        pauseForVisOffline("No Face Detected");
        return;
      }
      if (!result.liveness_passed) {
        if (visLastRecognitionAt && (Date.now() - visLastRecognitionAt) < VIS_RECOGNITION_HOLD_MS && visActiveProfile) {
          setVisScanStatus("Recognized user: " + String(visLastKnownUserLabel || "User"), { label: "Scanning", offline: false });
          return;
        }
        visFacePresent = false;
        visRecognizingSince = 0;
        visRecognitionCandidate = { profileFile: "", count: 0 };
        visNoMatchCount = 0;
        setVisScanStatus("No Live Face Detected", { label: "Offline", offline: true });
        return;
      }
      visLastFaceSeenAt = Date.now();
      visFacePresent = true;
      setVisScanStatus("Face Detected", { label: "Scanning", offline: true });
      const emotion = topEmotionLabel(result.emotion || {});
      if (emotion && emotion !== visLastEmotion) {
        visLastEmotion = emotion;
        if (visActiveProfile && visActiveProfile.session_state) {
          visActiveProfile.session_state.last_emotion = emotion;
        }
        updateTopStatusLabel();
      }
      if (Array.isArray(visRecognitionIndex) && visRecognitionIndex.length === 0) {
        setVisScanStatus("Starting setup", { label: "Scanning", offline: true });
        if (!visSetupOpen) openVisSetup();
        else maybeOpenVisSetupForFirstRun("no_index");
        return;
      }
      await handleVisRecognitionVector(result);
    } catch (e) {
      if (isVisBackendBusyError(e)) {
        visLastBackendError = String((e && e.message) || e || "usage_exceeded");
        visBackendBackoffUntil = Date.now() + VIS_BACKEND_BUSY_RETRY_MS;
        visFacePresent = false;
        setVisScanStatus("VIS backend busy - retrying", { label: "Offline", offline: true });
      } else if (VIS_ACTIVE_FACE_ENGINE === "faceapi") {
        visLastBackendError = String((e && e.message) || e || "face-api unavailable");
        visFacePresent = false;
        setVisScanStatus("Face Runtime Unavailable", { label: "Offline", offline: true });
      }
      dbg("VIS frame processing failed", e && e.message);
    } finally {
      visDetectBusy = false;
    }
  }

  async function ensureVisCameraReady() {
    if (VIS_CAMERA_DISABLED) return false;
    if (!visVideoEl) return false;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;
    if (visVideoEl.srcObject && visVideoEl.videoWidth && visVideoEl.videoHeight) {
      window.__visVideoTarget = visVideoEl;
      return true;
    }
    try {
      setVisScanStatus("Requesting camera access", { label: "Scanning", offline: true });
      dbg("VIS requesting camera access");
      if (!visCameraInputs.length) {
        try {
          const bootstrap = await navigator.mediaDevices.getUserMedia({
            video: getPreferredVisVideoConstraints(""),
            audio: false,
          });
          visVideoEl.srcObject = bootstrap;
          await visVideoEl.play();
          await waitForVideoReady(visVideoEl, 2500);
          const devices = await navigator.mediaDevices.enumerateDevices();
          visCameraInputs = devices.filter(function (device) {
            return device && device.kind === "videoinput";
          });
          if (!visCameraInputs.length) {
            window.__visVideoTarget = visVideoEl;
            return !!(visVideoEl.videoWidth && visVideoEl.videoHeight);
          }
          const bootstrapTrack = bootstrap.getVideoTracks()[0];
          const currentId = bootstrapTrack && typeof bootstrapTrack.getSettings === "function"
            ? String(bootstrapTrack.getSettings().deviceId || "")
            : "";
          if (currentId) {
            const foundIndex = visCameraInputs.findIndex(function (device) {
              return String(device.deviceId || "") === currentId;
            });
            visCameraInputIndex = foundIndex >= 0 ? foundIndex : 0;
          } else if (visCameraInputIndex < 0) {
            visCameraInputIndex = 0;
          }
        } catch (bootstrapError) {}
      }

      if (!visCameraInputs.length) {
        const fallback = await navigator.mediaDevices.getUserMedia({
          video: getPreferredVisVideoConstraints(""),
          audio: false,
        });
        visVideoEl.srcObject = fallback;
        await visVideoEl.play();
        await waitForVideoReady(visVideoEl, 2500);
        window.__visVideoTarget = visVideoEl;
        return !!(visVideoEl.videoWidth && visVideoEl.videoHeight);
      }

      if (visCameraInputIndex < 0) visCameraInputIndex = 0;
      const targetDevice = visCameraInputs[visCameraInputIndex] || visCameraInputs[0];
      const stream = await navigator.mediaDevices.getUserMedia({
        video: getPreferredVisVideoConstraints(targetDevice && targetDevice.deviceId ? String(targetDevice.deviceId) : ""),
        audio: false,
      });
      const prevStream = visVideoEl.srcObject;
      if (prevStream && prevStream !== stream && typeof prevStream.getTracks === "function") {
        prevStream.getTracks().forEach(function (track) {
          try { track.stop(); } catch (e) {}
        });
      }
      visVideoEl.srcObject = stream;
      await visVideoEl.play();
      await waitForVideoReady(visVideoEl, 2500);
      window.__visVideoTarget = visVideoEl;
      visLastCameraSwitchAt = Date.now();
      visCurrentCameraScanStartedAt = visLastCameraSwitchAt;
      dbg("VIS camera ready", visVideoEl.videoWidth + "x" + visVideoEl.videoHeight);
      return !!(visVideoEl.videoWidth && visVideoEl.videoHeight);
    } catch (e) {
      dbg("VIS webcam init failed", e && e.message);
      const name = String((e && e.name) || "").toLowerCase();
      const message = String((e && e.message) || "").toLowerCase();
      if (name.includes("notallowed") || message.includes("denied") || message.includes("permission")) {
        setVisScanStatus("Camera Access Denied", { label: "Offline", offline: true });
      } else {
        setVisScanStatus("Camera Unavailable", { label: "Offline", offline: true });
      }
      setAssistantStateForVisOffline("Offline - camera denied");
      return false;
    }
  }

  async function advanceVisCameraInput() {
    if (VIS_CAMERA_DISABLED) return false;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;
    if (Date.now() - visLastCameraSwitchAt < VIS_CAMERA_SWITCH_COOLDOWN_MS) return false;
    if (Date.now() - visCurrentCameraScanStartedAt < VIS_CAMERA_SCAN_PER_INPUT_MS) return false;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const nextInputs = devices.filter(function (device) {
        return device && device.kind === "videoinput";
      });
      if (!nextInputs.length) return false;
      visCameraInputs = nextInputs;
      if (visCameraInputs.length < 2) return false;
      visCameraInputIndex = (visCameraInputIndex + 1) % visCameraInputs.length;
      const switched = await ensureVisCameraReady();
      if (switched) {
        const cam = visCameraInputs[visCameraInputIndex];
        const label = cam && cam.label ? String(cam.label).trim() : ("camera " + String(visCameraInputIndex + 1));
        dbg("VIS switched camera input to", label);
      }
      return switched;
    } catch (e) {
      dbg("VIS camera advance failed", e && e.message);
      return false;
    }
  }

  function initVisDetector() {
    visDetector = null;
    visDetectorUnsupported = false;
  }

  async function initVisualIntelligenceSystem() {
    window.__PI_MANAGED_VIS_ACTIVE__ = true;
    closeVisTestStage();
    visAllowTestingStage = false;
    visPendingEnrollmentPayload = null;
    window.PI_VIS_HOOKS = {
      isManagedFlowActive: function () {
        return !!(
          visSetupOpen ||
          visScanning ||
          visEnrollmentSubmitting ||
          visVerificationBusy ||
          visPersonalizeOpen ||
          (visTestEl && !visTestEl.hidden)
        );
      },
      getSetupSuppressMs: function () {
        return 90000;
      },
      loadProfile: function (profile) {
        if (!profile) return;
        visActiveProfile = {
          user_identity: { username: String(profile.user_id || "user") },
          personalization_profile: Object.assign({}, profile.personalization_profile || {}),
          ai_behavior_configuration: Object.assign({}, profile.ai_config || {}),
          conversation_memory: Object.assign({}, profile.memory || {}),
          session_state: Object.assign({}, profile.session_state || {}),
          face_folder_path: String(profile.face_folder_path || ""),
        };
        visLastKnownUserLabel = String(profile.user_id || "User");
        applyVisProfileToRuntime(visActiveProfile);
      },
      activateAI: function () {
        if (visOffline) {
          resumeFromVisOnline();
        } else {
          setVisOfflineState(false, "Online - " + String(visLastKnownUserLabel || "User"));
        }
        if (visActiveProfile) ensureVisPersonalAgent(visActiveProfile, "vis_controller");
      },
      pauseAI: function () {
        pauseForVisOffline("Offline - no face");
      },
      setOfflineUI: function (offline) {
        if (offline) pauseForVisOffline("Offline - no face");
        else setVisOfflineState(false, "Online - " + String(visLastKnownUserLabel || "User"));
      },
      startSetupFlow: async function () {
        if (!this.isManagedFlowActive()) {
          openVisSetup();
        }
        return { suppress_setup_ms: this.getSetupSuppressMs() };
      },
      getRecognitionIndex: function () {
        return Array.isArray(visRecognitionIndex) ? visRecognitionIndex.slice(0) : [];
      },
      loadProfileByUserId: async function (userId) {
        const target = String(userId || "").trim();
        if (!target) return null;
        const hit = (Array.isArray(visRecognitionIndex) ? visRecognitionIndex : []).find(function (row) {
          return String((row && (row.username || row.user_id || row.profileFile)) || "") === target;
        }) || null;
        if (hit && hit.profile) return hit.profile;
        const identity = getAuthIdentity();
        if (!identity) return null;
        const out = await fetchSiteJson("/personal-intelligence/config?user_id=" + encodeURIComponent(identity.user_id), {
          method: "GET",
        }).catch(function () { return null; });
        return buildAuthBackedProfile(identity, out && out.profile ? out.profile : null);
      },
      registerFaceFrames: async function () {
        return {
          ok: false,
          deferred_to_setup: false,
          registered_faces: 0,
        };
      },
    };

    async function applyAuthRuntimeProfile() {
      const identity = getAuthIdentity();
      if (!identity) {
        visActiveProfile = null;
        visAgentContext = null;
        try { window.__PI_AGENT_CONTEXT__ = null; } catch (e) {}
        visRecognitionIndex = [];
        visIndexLoaded = true;
        pauseForVisOffline("Offline - sign in");
        return null;
      }
      let profile = null;
      const rows = await loadVisProfilesFromCloud().catch(function () { return []; });
      if (Array.isArray(rows) && rows[0] && rows[0].profile) {
        profile = rows[0].profile;
      }
      if (!profile) {
        const out = await fetchSiteJson("/personal-intelligence/config?user_id=" + encodeURIComponent(identity.user_id), {
          method: "GET",
        }).catch(function () { return null; });
        profile = buildAuthBackedProfile(identity, out && out.profile ? out.profile : null);
      } else {
        profile = await hydratePiUserConfig(profile);
      }
      applyVisProfileToRuntime(profile);
      visRecognitionIndex = [{
        profileFile: String(profile.file_name || ""),
        vector: [],
        username: String((profile.user_identity && profile.user_identity.username) || identity.user_id),
        profile: profile,
        vector_model: "auth_identity",
      }];
      visIndexLoaded = true;
      updateVisExpectedProfile();
      setVisOfflineState(false, "LUMEN Active - " + String(visLastKnownUserLabel || "User"));
      if (enabled) setAssistantState("listening", "Listening");
      showVisWelcome(visLastKnownUserLabel);
      ensureVisPersonalAgent(visActiveProfile, "auth_bootstrap");
      return profile;
    }

    window.addEventListener("g9:auth_state", function () {
      applyAuthRuntimeProfile().catch(function (e) {
        dbg("PI auth profile sync failed", e && e.message);
      });
    });

    return applyAuthRuntimeProfile();
  }

  function classifyEnrollmentBucket(face, box) {
    const poseHint = face && face.pose_hint ? String(face.pose_hint).toLowerCase() : "";
    if (poseHint && VIS_ENROLL_GUIDANCE_BUCKETS.indexOf(poseHint) >= 0) return poseHint;
    if (!box) return "";
    const width = Number(box.width || 0);
    const height = Number(box.height || 0);
    const x = Number(box.x || 0);
    const y = Number(box.y || 0);
    if (width <= 0 || height <= 0) return "";
    const cx = x + (width / 2);
    const cy = y + (height / 2);
    const area = width * height;
    if (area >= 0.2) return "close";
    if (cx < 0.38) return "left";
    if (cx > 0.62) return "right";
    if (cy < 0.38) return "up";
    if (cy > 0.62) return "down";
    return "center";
  }

  function nextEnrollmentBucket(coverage) {
    const state = coverage && typeof coverage === "object" ? coverage : {};
    for (let i = 0; i < VIS_ENROLL_GUIDANCE_BUCKETS.length; i += 1) {
      const bucket = VIS_ENROLL_GUIDANCE_BUCKETS[i];
      if (!state[bucket]) return bucket;
    }
    return "";
  }

  function enrollmentInstructionForBucket(bucket) {
    switch (String(bucket || "")) {
      case "left": return "Turn slightly to your left until the left side is scanned.";
      case "right": return "Turn slightly to your right until the right side is scanned.";
      case "up": return "Tilt your face upward until the upper face is scanned.";
      case "down": return "Tilt your face downward until the lower face is scanned.";
      case "close": return "Move a little closer so the scan captures more facial detail.";
      case "center": return "Look straight at the camera for the center scan.";
      default: return "Scan complete. Preparing your biometric identity signature.";
    }
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

  function stopAevraAIAudio() {
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
      const ctx = ensureAudioContext();
      if (ctx && ctx.state === "suspended" && typeof ctx.resume === "function") {
        try { await ctx.resume(); } catch (e) {}
      }
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
    const cleaned = String(text || "").replace(/\s+/g, " ").trim();
    if (!cleaned) throw new Error("TTS_TEXT_EMPTY");
    await ensurePuterReady(false);
    const ai = window.puter && window.puter.ai;
    if (!ai) throw new Error("PUTER_NOT_LOADED");
    async function tryMethod(fn, options) {
      const payloadA = Object.assign({ text: cleaned }, options || {});
      const payloadB = Object.assign({ input: cleaned }, options || {});
      try { return await fn(cleaned, options || {}); } catch (e1) {}
      try { return await fn(payloadA); } catch (e2) {}
      return fn(payloadB);
    }
    const attempts = [];
    const seen = new Set();
    function queueOptions(options) {
      const safe = options && typeof options === "object" ? Object.assign({}, options) : {};
      const key = JSON.stringify(safe);
      if (seen.has(key)) return;
      seen.add(key);
      attempts.push(safe);
    }
    queueOptions(voiceOptions || {});
    const catalog = window.PuterVoiceCatalog;
    if (catalog && typeof catalog.getDefault === "function") {
      const fallback = catalog.getDefault();
      if (fallback && fallback.options) queueOptions(fallback.options);
    }
    queueOptions({ provider: "openai", model: "gpt-4o-mini-tts", voice: "alloy" });
    const methods = [];
    if (typeof ai.txt2speech === "function") methods.push(ai.txt2speech.bind(ai));
    if (typeof ai.text2speech === "function") methods.push(ai.text2speech.bind(ai));
    if (typeof ai.tts === "function") methods.push(ai.tts.bind(ai));
    let lastError = null;
    for (let i = 0; i < methods.length; i += 1) {
      const method = methods[i];
      for (let j = 0; j < attempts.length; j += 1) {
        try {
          return await tryMethod(method, attempts[j]);
        } catch (error) {
          lastError = error;
        }
      }
    }
    if (lastError) throw lastError;
    throw new Error("PUTER_TTS_UNAVAILABLE");
  }

  function withTimeout(promise, timeoutMs, errorMessage) {
    return new Promise(function (resolve, reject) {
      let settled = false;
      const timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        reject(new Error(errorMessage || "TIMEOUT"));
      }, Math.max(1, Number(timeoutMs || 1)));
      Promise.resolve(promise).then(function (value) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      }).catch(function (error) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  async function speakWithBrowserFallback(text) {
    const cleaned = String(text || "").replace(/\s+/g, " ").trim();
    if (!cleaned) throw new Error("TTS_TEXT_EMPTY");
    if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined") {
      throw new Error("BROWSER_TTS_UNAVAILABLE");
    }
    return new Promise(function (resolve, reject) {
      let rejected = false;
      let resolved = false;
      const utterance = new SpeechSynthesisUtterance(cleaned);
      utterance.volume = 1;
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.onstart = function () {
        visSpeechState = {
          active: true,
          text: cleaned,
          started_at_ms: Date.now(),
          provider: "speech_synthesis",
        };
        setAssistantState("speaking", "Speaking");
      };
      utterance.onend = function () {
        if (rejected) return;
        visSpeechState = { active: false, text: "", started_at_ms: 0, provider: "" };
        setAssistantState("listening", "Listening");
        armIdleTimer();
        if (!resolved) {
          resolved = true;
          resolve(true);
        }
      };
      utterance.onerror = function (event) {
        if (rejected) return;
        rejected = true;
        const errorCode = event && event.error ? String(event.error) : "BROWSER_TTS_ERROR";
        visSpeechState = { active: false, text: "", started_at_ms: 0, provider: "" };
        setAssistantState("idle", "Idle");
        reject(new Error(errorCode));
      };
      try {
        window.speechSynthesis.cancel();
        try { window.speechSynthesis.resume(); } catch (e) {}
        window.speechSynthesis.speak(utterance);
        if (!resolved) {
          resolved = true;
          resolve({ queued: true });
        }
      } catch (error) {
        if (rejected) return;
        rejected = true;
        reject(error);
      }
    });
  }

  async function ensurePuterReady(interactive) {
    if (isOffline()) throw new Error("OFFLINE_MODE");
    if (window.__VIS_TEST_USE_MOCK || navigator.onLine === false) return;
    if ((!window.puter || !window.puter.ai) && window.AevraVoicePuter && typeof window.AevraVoicePuter.load === "function") {
      await window.AevraVoicePuter.load();
    }
    if (!window.puter || !window.puter.ai) {
      // Wait up to 5 seconds for puter.js to load asynchronously
      let attempts = 0;
      while ((!window.puter || !window.puter.ai) && attempts < 50) {
        await new Promise(r => setTimeout(r, 100));
        attempts++;
      }
      if (!window.puter || !window.puter.ai) throw new Error("PUTER_NOT_LOADED");
    }
    if (!window.puter.auth || !window.puter.auth.isSignedIn || !window.puter.auth.signIn) return;
    let signed = false;
    try { signed = !!(await window.puter.auth.isSignedIn()); } catch (socketErr) {
      console.warn('[PI] Puter socket.io connection failed:', socketErr && socketErr.message);
      window.__puterSocketIOFailed = true;
      return;
    }
    if (!signed && interactive) {
      try {
        await window.puter.auth.signIn({ attempt_temp_user_creation: true });
      } catch (authErr) {
        console.warn('[PI] Puter auth failed:', authErr && authErr.message);
        throw authErr;
      }
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
    return fallbackPuterModels();
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

  function buildAevraAISystemPrompt(mode, language, subject, facts) {
    const knownFactsLine = "Known user facts: " + (Object.keys(facts || {}).length ? JSON.stringify(facts) : "none");
    const namingLine = [
      "Naming policy:",
      "use preferred_name or name for normal conversation,",
      "use full_name or formal_name for formal requests, official writing, or respectful formal replies."
    ].join(" ");
    const behaviorCfg = visBehaviorConfig && typeof visBehaviorConfig === "object" ? visBehaviorConfig : {};
    const personalization = visPersonalizationProfile && typeof visPersonalizationProfile === "object" ? visPersonalizationProfile : {};
    const corePersona =
      "You are Aevra AI, a personal intelligence system and trusted companion, strategist, and creative partner. " +
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

    const emotionLine = "Detected user emotion: " + String(visLastEmotion || "neutral") + ". If emotion suggests stress/sadness/anger/fear, respond more calmly and empathetically.";

    return [corePersona, principles, modeInstructions, styleRules, behaviorRules, personalizationRules, emotionLine, namingLine, knownFactsLine].join("\n");
  }

  async function fetchPuterVoices() {
    if (isOffline()) return [];
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
    if (isVisMockMode()) return;
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
      if (ctx.state === "suspended" && typeof ctx.resume === "function") {
        ctx.resume().catch(function () {});
      }
      stopSpeakerAnalyser();
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
      stopAevraAIAudio();
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
      if (VIS_CAMERA_DISABLED) {
        setVisOfflineState(false, "LUMEN Active - " + String(visLastKnownUserLabel || "User"));
        setAssistantState("listening", "Listening");
        return;
      }
      if (visOffline) {
        setAssistantStateForVisOffline("Offline - sign in");
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

  async function fetchSiteJson(path, options) {
    const res = await fetch(path, options);
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
    return "";
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
    return {};
  }

  async function inferModelMemoryFactsWithPuter(userText, assistantAnswer, updates) {
    return {};
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
      // Fact files are retired; facts live inside VIS identity profiles now.
      return;
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
        addLog("assistant", "Aevra AI: Fact already exists. Skipped duplicate update.");
      } else if (out && out.ok) {
        addLog("assistant", "Aevra AI: Local evolution updated Fact Evolution.json");
      } else {
        addLog("assistant", "Aevra AI: Local evolution did not write code (" + String((out && (out.error || out.stage)) || "unknown") + ").");
      }
    } catch (e) {
      dbg("local evolution failed", e && e.message);
      addLog("assistant", "Aevra AI: Local evolution failed (" + String((e && e.message) || "unknown") + ").");
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

  async function playAevraAITTS(text) {
    const cleanedText = String(text || "").replace(/\s+/g, " ").trim();
    if (!cleanedText) {
      setAssistantState("idle", "Idle");
      return;
    }
    if (!visCanOperateAI()) {
      visPendingResponse = {
        answer: cleanedText,
        speakText: cleanedText,
        ts: Date.now(),
      };
      scheduleVisProfileSave();
      return { ok: false, queued: true, provider: "pending" };
    }
    stopAevraAIAudio();
    try {
      await primeAudioPlayback();
      visSpeechState = {
        active: false,
        text: cleanedText,
        started_at_ms: 0,
        provider: "audio_element",
      };
      const voiceOptions = getSelectedPuterVoiceOptions();
      const out = await withTimeout(requestPuterTts(cleanedText, voiceOptions), TTS_TIMEOUT_MS, "PUTER_TTS_TIMEOUT");
      const normalized = normalizePuterTtsSource(out);
      if (!normalized || !normalized.src) throw new Error("PUTER_EMPTY_AUDIO");
      const url = normalized.src;
      tutorAudio = new Audio(url);
      tutorAudio.__revoke = !!normalized.revoke;
      tutorAudio.preload = "auto";
      tutorAudio.playsInline = true;
      tutorAudio.volume = 1;
      stopSpeakerAnalyser();
      connectSpeakerAnalyserForAudioElement(tutorAudio);
      await withTimeout(new Promise(function (resolve, reject) {
        let settled = false;
        const cleanupStartHandlers = function () {
          tutorAudio.onplay = null;
          tutorAudio.onerror = null;
        };
        tutorAudio.onplay = function () {
          if (settled) return;
          settled = true;
          cleanupStartHandlers();
          visSpeechState.active = true;
          visSpeechState.started_at_ms = Date.now();
          setAssistantState("speaking", "Speaking");
          resolve(true);
        };
        tutorAudio.onended = function () {
          visSpeechState = { active: false, text: "", started_at_ms: 0, provider: "" };
          setAssistantState("listening", "Listening");
          armIdleTimer();
          try { if (tutorAudio && tutorAudio.__revoke) URL.revokeObjectURL(url); } catch (e) {}
        };
        tutorAudio.onerror = function () {
          if (settled) return;
          settled = true;
          cleanupStartHandlers();
          reject(new Error("AUDIO_ELEMENT_ERROR"));
        };
        tutorAudio.play().catch(function (playErr) {
          if (settled) return;
          settled = true;
          cleanupStartHandlers();
          reject(playErr);
        });
      }), Math.max(TTS_TIMEOUT_MS, 8000), "AUDIO_PLAYBACK_TIMEOUT");
      return { ok: true, provider: "puter_tts" };
    } catch (e) {
      dbg("Puter TTS failed, fallback to browser TTS", e && e.message);
      addLog("assistant", "Aevra AI: Voice engine fallback (" + String((e && e.message) || "TTS error") + ").");
      try {
        await speakWithBrowserFallback(cleanedText);
        return { ok: true, provider: "browser_tts_fallback", fallback_from: String((e && e.message) || "unknown") };
      } catch (e2) {
        const blocked = String((e2 && e2.message) || "").toLowerCase();
        if (blocked.includes("not allowed") || blocked.includes("user agent")) {
          addLog("assistant", "Aevra AI: Audio playback is blocked. Tap the orb once, then try again.");
        }
        setAssistantState("idle", "Idle");
        return {
          ok: false,
          provider: "none",
          error: String((e2 && e2.message) || e2 || "VOICE_FAILED"),
          fallback_from: String((e && e.message) || "unknown"),
        };
      }
    }
  }
  async function runAevraAIResponseForText(text) {
    const t = String(text || "").trim();
    if (!t || !enabled || !visCanOperateAI()) return;
    setAssistantState("thinking", "Thinking");
    showTypingIndicator();
    armIdleTimer();
    try {
      const language = localStorage.getItem("g9_language") || "English";
      const subject = localStorage.getItem("g9_subject") || "General";
      const mode = detectSupportMode(t);
      const agentContext = getPiAgentRequestContext();
      emitVisHarmonyDebug({
        status: "Processing...",
        observatory: {
          type: mode,
          complexity: "analyzing",
          queries: [{ text: t }],
        },
        harmony: {
          model_used: "Selecting...",
          fallback_used: false,
        },
        agent: agentContext,
      });
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
            system_prompt: buildAevraAISystemPrompt(mode, language, subject, knownFacts),
            user_id: agentContext.user_id,
            unique_id: agentContext.unique_id,
            profile_file: agentContext.profile_file,
            personalization_prompt: agentContext.personalization_prompt,
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
        addLog("assistant", "Aevra AI: " + actionAnswer);
        pushHistory("assistant", actionAnswer);
        if (actionData && actionData.learned_facts) mergeKnownFacts(actionData.learned_facts);
        if (actionData && actionData.memory_updates) mergeKnownFacts(actionData.memory_updates);
        if (actionData && actionData.action) executeAssistantAction(actionData.action);
        renderEvolutionStatus(actionData);
        emitVisHarmonyDebug({
          status: "Complete",
          observatory: actionData && actionData.observatory ? actionData.observatory : { type: mode, complexity: "action", queries: [{ text: t }] },
          harmony: actionData && actionData.agent_harmony ? actionData.agent_harmony : { model_used: "local_action", fallback_used: false },
          agent: agentContext,
          ai_provider: actionData && actionData.ai_provider ? actionData.ai_provider : "local_action",
        });
        dbg("AI provider:", "local_action", "ok:", true);
        await playAevraAITTS(actionSpeakText);
        return;
      }

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
          system_prompt: buildAevraAISystemPrompt(detectSupportMode(t), localStorage.getItem("g9_language") || "English", localStorage.getItem("g9_subject") || "General", knownFacts),
          user_id: agentContext.user_id,
          unique_id: agentContext.unique_id,
          profile_file: agentContext.profile_file,
          personalization_prompt: agentContext.personalization_prompt,
        }),
      });
      let answer = data && data.answer ? String(data.answer) : "";
      if (data && data.harmony_failed) {
        hideTypingIndicator();
        emitVisHarmonyDebug({
          status: "Failed",
          observatory: data && data.observatory ? data.observatory : { type: mode, complexity: "-", queries: [{ text: t }] },
          harmony: data && data.agent_harmony ? data.agent_harmony : { model_used: "-", fallback_used: false },
          agent: agentContext,
          ai_provider: data && data.ai_provider ? data.ai_provider : "",
        });
        addLog("assistant", "Aevra AI: Harmony error: " + String((data && data.ai_error) || "Harmony is unavailable right now."));
        setAssistantState("idle", "Idle");
        renderEvolutionStatus(data);
        return;
      }
      if (!answer) {
        hideTypingIndicator();
        emitVisHarmonyDebug({
          status: "Failed",
          observatory: data && data.observatory ? data.observatory : { type: mode, complexity: "-", queries: [{ text: t }] },
          harmony: data && data.agent_harmony ? data.agent_harmony : { model_used: "-", fallback_used: false },
          agent: agentContext,
          ai_provider: data && data.ai_provider ? data.ai_provider : "",
        });
        addLog("assistant", "Aevra AI: Harmony returned no response.");
        setAssistantState("idle", "Idle");
        renderEvolutionStatus(data);
        return;
      }
      const speakText = buildSpeakText(answer);
      if (!visCanOperateAI()) {
        visPendingResponse = { answer: answer, speakText: speakText, ts: Date.now() };
        scheduleVisProfileSave();
        hideTypingIndicator();
        return;
      }
      hideTypingIndicator();
      addLog("assistant", "Aevra AI: " + answer);
      pushHistory("assistant", answer);
      if (data && data.learned_facts) mergeKnownFacts(data.learned_facts);
      if (data && data.memory_updates) mergeKnownFacts(data.memory_updates);
      if (data && data.action) executeAssistantAction(data.action);
      renderEvolutionStatus(data);
      emitVisHarmonyDebug({
        status: "Complete",
        observatory: data && data.observatory ? data.observatory : { type: mode, complexity: "-", queries: [{ text: t }] },
        harmony: data && data.agent_harmony ? data.agent_harmony : { model_used: data && data.ai_provider ? data.ai_provider : "agent_harmony", fallback_used: false },
        ncs: data && data.ncs ? data.ncs : undefined,
        learned_facts: data && data.learned_facts ? data.learned_facts : undefined,
        memory_updates: data && data.memory_updates ? data.memory_updates : undefined,
        agent: agentContext,
        ai_provider: data && data.ai_provider ? data.ai_provider : "",
      });
      dbg("AI provider:", data && data.ai_provider ? data.ai_provider : "agent_harmony", "ok:", true);
      await playAevraAITTS(speakText);
    } catch (e) {
      hideTypingIndicator();
      emitVisHarmonyDebug({
        status: "Failed",
        observatory: { type: detectSupportMode(t), complexity: "-", queries: [{ text: t }] },
        harmony: { model_used: "-", fallback_used: false },
        agent: getPiAgentRequestContext(),
        ai_provider: "",
      });
      addLog("assistant", "Aevra AI: Request failed. Please try again.");
      setAssistantState("idle", "Idle");
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
        addLog("assistant", "Aevra AI: Processing " + String(batch.length) + " queued messages together.");
      }
      await runAevraAIResponseForText(combined);
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

  async function askAevraAIText(text) {
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

  async function verifyVoiceIdentityFromText(text) {
    const phrase = String(text || "").trim();
    if (!phrase) return null;
    try {
      const body = JSON.stringify({ action: "match", transcript: phrase });
      const res = await (window.Api && window.Api.apiFetch
        ? window.Api.apiFetch("/voice/identity", { method: "POST", headers: { "Content-Type": "application/json" }, body })
        : fetch("/voice/identity", { method: "POST", headers: { "Content-Type": "application/json" }, body }));
      const data = await res.json().catch(function () { return {}; });
      if (data && data.ok && data.match && data.match.matched) {
        visLastKnownUserLabel = String((data.match.profile && (data.match.profile.display_name || data.match.profile.user_id)) || "Verified");
        visOffline = false;
        updateTopStatusLabel("Voice verified");
      }
      return data && data.match ? data.match : null;
    } catch (e) {
      return null;
    }
  }

  async function startServerListening() {
    if (!enabled || !visCanOperateAI()) return;
    const host = String(location.hostname || "").toLowerCase();
    const isLocal = host === "localhost" || host === "127.0.0.1";
    if (!window.isSecureContext && !isLocal) {
      addLog("assistant", "Aevra AI: Microphone needs HTTPS on iPhone/Chrome. Open the secure site URL and try again.");
      setAssistantState("idle", "Idle");
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === "undefined") {
      addLog("assistant", "Aevra AI: Voice recognition is not supported in this environment.");
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
            await verifyVoiceIdentityFromText(text);
            if (!visCanOperateAI()) {
              pendingPiMessages.push({ text: String(text), at: Date.now(), source: "stt_paused_resume" });
              scheduleVisProfileSave();
              setAssistantStateForVisOffline("Offline - voice identity pending");
              return;
            }
            await askAevraAIText(text);
          } else {
            setAssistantState("idle", "Idle");
          }
        } catch (e) {
          dbg("server STT failed", e && e.message);
          addLog("assistant", "Aevra AI: Voice server not responding (STT).");
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
        addLog("assistant", "Aevra AI: Microphone permission denied. In iPhone Settings > Chrome > Microphone, allow access.");
      } else {
        addLog("assistant", "Aevra AI: Microphone access is blocked.");
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
        if (text) askAevraAIText(String(text));
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
    const confirmText = "Aevra AI wants to run: " + action.type.replace(/_/g, " ") + ". Continue?";
    if (shouldConfirmAction(action)) {
      const ok = window.confirm(confirmText);
      if (!ok) {
        addLog("assistant", "Aevra AI: Action cancelled.");
        return;
      }
    }

    try {
      if (window.DesktopAssistant && window.DesktopAssistant.executeAction) {
        const desktopResult = await window.DesktopAssistant.executeAction(action);
        if (desktopResult && desktopResult.ok) return;
        if (desktopResult && desktopResult.denied) {
          addLog("assistant", "Aevra AI: Creator denied desktop action.");
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
      addLog("assistant", "Aevra AI: Spotify connection initiated.");
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
          addLog("assistant", "Aevra AI: File picker opened.");
          return;
        }
      } catch (e) {}
      addLog("assistant", "Aevra AI: Could not open file picker in this browser.");
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
        addLog("assistant", "Aevra AI: Sign in to continue with Personal Intelligence.");
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
      askAevraAIText(v);
    });
    textInputEl.addEventListener("keydown", function (ev) {
      if (!ev || ev.key !== "Enter") return;
      ev.preventDefault();
      const v = String(textInputEl.value || "").trim();
      if (!v) return;
      textInputEl.value = "";
      askAevraAIText(v);
    });
  }

  if (textMicBtn) {
    textMicBtn.addEventListener("click", async function () {
      await primeAudioPlayback();
      setUIMode("voice");
      if (!enabled) setEnabled(true);
      if (!visCanOperateAI()) {
        addLog("assistant", "Aevra AI: Waiting for your signed-in profile before voice mode.");
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
          stopAevraAIAudio();
          addLog("assistant", "Aevra AI: Voice output muted.");
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
  window.ShowCameraBox = async function () {
    return false;
  };
  window.CloseCameraBox = function () {
    closeVisDebugPreview();
    return true;
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

  // Wire vis_controller events only when camera runtime is enabled.
  if (!VIS_CAMERA_DISABLED) {
    window.addEventListener('vis:offline', function (e) {
      var reason = (e && e.detail && e.detail.reason) || 'no_face';
      pauseForVisOffline("Offline - " + reason);
    });
    window.addEventListener('vis:online', function () {
      resumeFromVisOnline();
    });
    window.addEventListener('vis:resume', function () {
      resumeFromVisOnline();
    });
  }

  try {
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  } catch (e) {}
})();

