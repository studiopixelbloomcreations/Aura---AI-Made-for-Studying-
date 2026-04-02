import { initCamera, captureFrame, captureFrames } from './camera_engine.js';
import { createPresenceEngine } from './presence_engine.js';
import { createConfidenceEngine } from './confidence_engine.js';
import { topEmotion } from './emotion_engine.js';
import { saveSession, loadSession } from './session_manager.js';
import { loadAI, pauseAI, resumeAI } from './ai_router.js';
import { processFaceFrame, loadProfileByUserId, registerFaceFrames } from './identity_engine.js';

const DETECT_INTERVAL_MS = 500;
const UNKNOWN_SETUP_DELAY_MS = 2000;
const REGISTRATION_FRAME_COUNT = 10;
const REGISTRATION_RETRY_COOLDOWN_MS = 15000;
const MANAGED_FLOW_RETRY_COOLDOWN_MS = 60000;

let activeUserId = null;
let activeProfile = null;
let videoRef = null;
let loopTimer = null;
let setupInProgress = false;
let unknownSince = 0;
let registrationRetryBlockedUntil = 0;

const presence = createPresenceEngine();
const confidence = createConfidenceEngine();

function ensureMetrics() {
  if (!window.__VIS_METRICS) {
    window.__VIS_METRICS = {
      timings: {},
      counters: {},
      events: []
    };
  }
  return window.__VIS_METRICS;
}

function nowMs() {
  return window.performance && typeof window.performance.now === 'function'
    ? window.performance.now()
    : Date.now();
}

function recordEvent(type, data) {
  const metrics = ensureMetrics();
  metrics.events.push({ type, data: data || null, at: Date.now() });
}

function recordTiming(name, value) {
  const metrics = ensureMetrics();
  metrics.timings[name] = value;
  recordEvent(`timing:${name}`, { value });
}

function emit(name, detail) {
  window.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
}

function scheduleNextLoop() {
  window.clearTimeout(loopTimer);
  loopTimer = window.setTimeout(runLoop, DETECT_INTERVAL_MS);
}

function resetRecognitionState(reason) {
  confidence.reset();
  unknownSince = 0;
  if (activeUserId) {
    recordEvent('user_inactive', { user_id: activeUserId, reason: reason || 'unknown' });
  }
  pauseAI();
  emit('vis:idle', { reason: reason || 'idle', activeUserId });
}

async function activateRecognizedUser(result, emotionLabel) {
  const confirmed = confidence.update(result.user_id);
  if (!confirmed) return;

  const profileChanged = activeUserId !== result.user_id || !activeProfile;
  if (profileChanged) {
    activeProfile = await loadProfileByUserId(result.user_id);
    activeUserId = result.user_id;
  }

  const sessionState = {
    ...(activeProfile && activeProfile.session_state ? activeProfile.session_state : {}),
    ...loadSession(result.user_id),
    last_emotion: emotionLabel,
    last_face_token: result.faceToken || '',
    last_face_confidence: Number(result.confidence || 0),
    last_seen_at: new Date().toISOString()
  };
  const profile = {
    ...(activeProfile || { user_id: result.user_id }),
    user_id: result.user_id,
    session_state: sessionState,
    face_token: result.faceToken || null,
    strongest_emotion: emotionLabel
  };

  activeProfile = profile;
  saveSession(result.user_id, sessionState);

  if (profileChanged) {
    loadAI(profile);
    emit('vis:user-recognized', { user_id: result.user_id, confidence: result.confidence, emotion: emotionLabel });
  } else {
    resumeAI(profile);
  }

  const metrics = ensureMetrics();
  if (!metrics.timings.total_verification_time_ms && metrics.timings.verification_start_ms) {
    recordTiming('total_verification_time_ms', nowMs() - metrics.timings.verification_start_ms);
  }
}

async function runRegistrationFlow(video, seedResult) {
  if (setupInProgress) return;
  setupInProgress = true;
  pauseAI();
  emit('vis:setup-required', {
    confidence: Number(seedResult && seedResult.confidence || 0),
    faceToken: seedResult && seedResult.faceToken ? seedResult.faceToken : '',
    emotion: seedResult && seedResult.emotion ? seedResult.emotion : {}
  });

  try {
    const hooks = window.PI_VIS_HOOKS || {};
    let requested = null;
    const hasManagedSetupFlow = typeof hooks.startSetupFlow === 'function';
    const suppressManagedSetupMs = () => {
      const value = typeof hooks.getSetupSuppressMs === 'function'
        ? Number(hooks.getSetupSuppressMs() || 0)
        : 0;
      return Math.max(REGISTRATION_RETRY_COOLDOWN_MS, value || MANAGED_FLOW_RETRY_COOLDOWN_MS);
    };
    const managedFlowActive = typeof hooks.isManagedFlowActive === 'function' && hooks.isManagedFlowActive();
    if (managedFlowActive) {
      registrationRetryBlockedUntil = Date.now() + suppressManagedSetupMs();
      recordEvent('registration_suppressed_by_managed_flow', {
        retry_after_ms: registrationRetryBlockedUntil - Date.now()
      });
      emit('vis:setup-awaiting-enrollment', {
        retry_after_ms: registrationRetryBlockedUntil - Date.now()
      });
      return;
    }
    if (hasManagedSetupFlow) {
      requested = await hooks.startSetupFlow({
        reason: 'unknown_user',
        recommendedFrameCount: REGISTRATION_FRAME_COUNT
      });
    }

    let userId = requested && requested.user_id ? String(requested.user_id).trim() : '';
    let profileData = requested && requested.profile_data && typeof requested.profile_data === 'object'
      ? requested.profile_data
      : {};

    if (!userId && hasManagedSetupFlow) {
      const suppressMs = requested && requested.suppress_setup_ms
        ? Number(requested.suppress_setup_ms || 0)
        : suppressManagedSetupMs();
      registrationRetryBlockedUntil = Date.now() + Math.max(REGISTRATION_RETRY_COOLDOWN_MS, suppressMs || 0);
      recordEvent('registration_deferred_to_setup', {
        retry_after_ms: registrationRetryBlockedUntil - Date.now()
      });
      emit('vis:setup-awaiting-enrollment', {
        retry_after_ms: registrationRetryBlockedUntil - Date.now()
      });
      return;
    }

    if (!userId) {
      recordEvent('registration_cancelled');
      emit('vis:setup-cancelled', {});
      return;
    }

    const frames = await captureFrames(video, REGISTRATION_FRAME_COUNT, 120);
    const startedAt = nowMs();
    const registration = await registerFaceFrames(userId, frames, profileData);
    recordTiming('registration_time_ms', nowMs() - startedAt);
    recordEvent('registration_complete', {
      user_id: userId,
      registered_faces: registration.registered_faces || 0
    });
    emit('vis:registration-complete', {
      user_id: userId,
      registered_faces: registration.registered_faces || 0
    });

    activeProfile = await loadProfileByUserId(userId);
    activeUserId = userId;
    registrationRetryBlockedUntil = 0;
    confidence.reset();
    confidence.update(userId);
    confidence.update(userId);
    confidence.update(userId);
    loadAI(activeProfile);
    resumeAI(activeProfile);
  } catch (error) {
    console.error('[VIS] registration failed:', error);
    registrationRetryBlockedUntil = Date.now() + REGISTRATION_RETRY_COOLDOWN_MS;
    recordEvent('registration_failed', { error: String(error && error.message ? error.message : error) });
    emit('vis:setup-error', {
      error: String(error && error.message ? error.message : error),
      retry_after_ms: REGISTRATION_RETRY_COOLDOWN_MS
    });
  } finally {
    setupInProgress = false;
    unknownSince = registrationRetryBlockedUntil > Date.now() ? Date.now() : 0;
  }
}

async function runLoop() {
  const metrics = ensureMetrics();
  try {
    if (!videoRef) {
      scheduleNextLoop();
      return;
    }

    const image = captureFrame(videoRef);
    if (!image) {
      metrics.counters.capture_skipped = (metrics.counters.capture_skipped || 0) + 1;
      scheduleNextLoop();
      return;
    }

    if (!metrics.timings.verification_start_ms) {
      metrics.timings.verification_start_ms = nowMs();
    }

    const startedAt = nowMs();
    const result = await processFaceFrame(image);
    recordTiming('face_detection_last_ms', nowMs() - startedAt);

    const present = presence.update(!!(result && result.faceDetected));
    const emotionLabel = topEmotion(result && result.emotion ? result.emotion : {});

    metrics.counters.polls = (metrics.counters.polls || 0) + 1;
    metrics.timings.backend_roundtrip_ms = metrics.timings.face_detection_last_ms;

    if (!present || !result || !result.faceDetected) {
      resetRecognitionState('no_face_detected');
      scheduleNextLoop();
      return;
    }

    if (result.user_id) {
      unknownSince = 0;
      await activateRecognizedUser(result, emotionLabel);
      scheduleNextLoop();
      return;
    }

    pauseAI();
    emit('vis:unknown-user', {
      confidence: Number(result.confidence || 0),
      faceToken: result.faceToken || '',
      emotion: emotionLabel
    });

    const now = Date.now();
    if (registrationRetryBlockedUntil && now < registrationRetryBlockedUntil) {
      scheduleNextLoop();
      return;
    }
    if (registrationRetryBlockedUntil && now >= registrationRetryBlockedUntil) {
      registrationRetryBlockedUntil = 0;
    }
    if (!unknownSince) unknownSince = now;
    if (!setupInProgress && now - unknownSince >= UNKNOWN_SETUP_DELAY_MS) {
      await runRegistrationFlow(videoRef, result);
    }
  } catch (error) {
    console.error('[VIS] backend loop failed:', error);
    metrics.counters.errors = (metrics.counters.errors || 0) + 1;
    recordEvent('backend_error', { error: String(error && error.message ? error.message : error) });
    emit('vis:backend-error', { error: String(error && error.message ? error.message : error) });
  } finally {
    scheduleNextLoop();
  }
}

export async function startVIS() {
  if (window.__VIS_STARTED__) return;
  window.__VIS_STARTED__ = true;
  ensureMetrics();
  recordEvent('vis_start');

  const startedAt = nowMs();
  videoRef = await initCamera();
  recordTiming('camera_start_time_ms', nowMs() - startedAt);

  if (!videoRef) {
    recordEvent('camera_unavailable', { reason: window.__VIS_CAMERA_ERROR || 'unknown' });
    return;
  }

  scheduleNextLoop();
}

if (document.readyState === 'complete') startVIS();
else window.addEventListener('load', startVIS, { once: true });
