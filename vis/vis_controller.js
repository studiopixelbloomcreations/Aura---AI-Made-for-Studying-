import { initHuman, detectFace } from './human_engine.js';
import { initCamera } from './camera_engine.js';
import { createPresenceEngine } from './presence_engine.js';
import { loadProfiles, saveProfile } from './identity_engine.js';
import { matchIdentity } from './identity_engine.js';
import { createConfidenceEngine } from './confidence_engine.js';
import { topEmotion } from './emotion_engine.js';
import { saveSession, loadSession } from './session_manager.js';
import { loadAI, pauseAI, resumeAI } from './ai_router.js';

const DETECT_INTERVAL_MS = 300;
const EMBED_FRAMES = 12;

let profiles = [];
let activeUser = null;
let unknownSince = 0;
let lastActiveUserId = null;
let visOffline = true; // Start offline until face detected

const presence = createPresenceEngine();
const confidence = createConfidenceEngine();

// --- Offline/Online mode ---
function setVisOffline(offline, reason) {
  const wasOffline = visOffline;
  visOffline = !!offline;
  if (visOffline !== wasOffline) {
    const eventName = visOffline ? 'vis:offline' : 'vis:online';
    window.dispatchEvent(new CustomEvent(eventName, {
      detail: { reason: reason || '', lastUser: lastActiveUserId }
    }));
  }
  // Toggle overlay
  let overlay = document.getElementById('vis-offline-overlay');
  if (visOffline) {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'vis-offline-overlay';
      overlay.innerHTML = '<div class="vis-offline-msg">No face detected — AI paused</div>';
      document.body.appendChild(overlay);
    }
    overlay.style.display = '';
    document.body.classList.add('vis-offline-body');
  } else {
    if (overlay) overlay.style.display = 'none';
    document.body.classList.remove('vis-offline-body');
  }
}

function ensureOfflineStyles() {
  if (document.getElementById('visOfflineCSS')) return;
  const s = document.createElement('style');
  s.id = 'visOfflineCSS';
  s.textContent =
    '.vis-offline-body { filter: grayscale(0.85) brightness(0.7); pointer-events: none; transition: filter 0.6s ease; }' +
    '#vis-offline-overlay { position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;pointer-events:none; }' +
    '.vis-offline-msg { background:rgba(6,10,20,0.85);color:#8ba3cc;padding:14px 28px;border-radius:14px;font-size:15px;letter-spacing:0.3px;border:1px solid rgba(100,140,200,0.25);box-shadow:0 12px 40px rgba(0,0,0,0.4);pointer-events:none; }';
  document.head.appendChild(s);
}

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
  return (window.performance && typeof window.performance.now === 'function')
    ? window.performance.now()
    : Date.now();
}

function recordTiming(name, value) {
  const metrics = ensureMetrics();
  metrics.timings[name] = value;
  metrics.events.push({ type: 'timing', name, value, at: Date.now() });
  console.log(`[VIS_METRIC] ${name}: ${Math.round(value)}ms`);
}

function recordEvent(name, data) {
  const metrics = ensureMetrics();
  metrics.events.push({ type: name, data: data || null, at: Date.now() });
}

function recordVerificationFailure(reason) {
  const metrics = ensureMetrics();
  if (metrics.timings.verification_start_ms && !metrics.timings.verification_failed_time_ms) {
    const total = nowMs() - metrics.timings.verification_start_ms;
    metrics.timings.verification_failed_time_ms = total;
    recordEvent('verification_failed', { reason: reason || 'unknown', total_ms: total });
  }
}

function buildSetupModal(step, progress) {
  const prog = progress || 0;
  if (step === 1) {
    return `
      <div class="vis-setup-card">
        <div class="vis-setup-title">Visual Intelligence Setup</div>
        <div class="vis-setup-body">We will scan your facial features to create a secure biometric identity signature for personalized AI.</div>
        <div class="vis-setup-actions"><button class="vis-setup-btn" data-next>Continue</button></div>
      </div>
    `;
  }
  if (step === 2) {
    return `
      <div class="vis-setup-card">
        <div class="vis-setup-title">Privacy Agreement</div>
        <div class="vis-setup-body">Facial data is used only for identity recognition and personalization.</div>
        <div class="vis-setup-actions"><button class="vis-setup-btn" data-next>Agree</button></div>
      </div>
    `;
  }
  if (step === 3) {
    return `
      <div class="vis-setup-card">
        <div class="vis-setup-title">Create Identity</div>
        <div class="vis-setup-body">Enter your username for the identity file.</div>
        <input class="vis-setup-input" placeholder="username" />
        <div class="vis-setup-actions"><button class="vis-setup-btn" data-next>Start Scan</button></div>
      </div>
    `;
  }
  return `
    <div class="vis-setup-card">
      <div class="vis-setup-title">Scanning</div>
      <div class="vis-setup-body">Keep your face centered and slightly change angle.</div>
      <div class="vis-setup-progress"><div class="vis-setup-bar" style="width:${prog}%;"></div></div>
      <div class="vis-setup-note">This will take ~5 seconds.</div>
    </div>
  `;
}

function ensureSetupStyles() {
  if (document.getElementById('visSetupStyles')) return;
  const style = document.createElement('style');
  style.id = 'visSetupStyles';
  style.textContent =
    '.vis-setup-overlay{position:fixed;inset:0;background:rgba(6,10,20,.72);z-index:9999;display:flex;align-items:center;justify-content:center;}' +
    '.vis-setup-card{width:520px;max-width:90vw;background:#0b1529;border:1px solid rgba(120,160,255,.35);border-radius:16px;padding:18px 20px;color:#e9f2ff;box-shadow:0 20px 50px rgba(0,0,0,.45);font-family:inherit;}' +
    '.vis-setup-title{font-weight:600;margin-bottom:8px;}' +
    '.vis-setup-body{font-size:14px;line-height:1.5;opacity:.9;}' +
    '.vis-setup-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px;}' +
    '.vis-setup-btn{background:#1c2b4a;border:1px solid rgba(120,160,255,.4);color:#e9f2ff;padding:6px 12px;border-radius:8px;cursor:pointer;}' +
    '.vis-setup-input{width:100%;margin-top:10px;padding:8px;border-radius:8px;border:1px solid rgba(120,160,255,.35);background:#0c1b36;color:#e9f2ff;}' +
    '.vis-setup-progress{height:6px;background:#1a2a4d;border-radius:6px;overflow:hidden;margin-top:12px;}' +
    '.vis-setup-bar{height:100%;background:#6ad0ff;transition:width .2s ease;}' +
    '.vis-setup-note{font-size:12px;opacity:.7;margin-top:8px;}';
  document.head.appendChild(style);
}

function openSetup(step, progress) {
  ensureSetupStyles();
  let modal = document.querySelector('.vis-setup-overlay');
  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'vis-setup-overlay';
    document.body.appendChild(modal);
  }
  modal.innerHTML = buildSetupModal(step, progress);
  return modal;
}

function closeSetup() {
  const modal = document.querySelector('.vis-setup-overlay');
  if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
}

async function setupFlow(video) {
  let step = 1;
  let username = '';

  function render(progress) {
    const modal = openSetup(step, progress);
    const nextBtn = modal.querySelector('[data-next]');
    if (nextBtn) {
      nextBtn.addEventListener('click', async () => {
        if (step === 3) {
          const input = modal.querySelector('.vis-setup-input');
          username = (input && input.value || '').trim() || 'user';
        }
        step += 1;
        render(0);
        if (step === 4) {
          const scanStart = nowMs();
          const vectors = [];
          for (let i = 0; i < EMBED_FRAMES; i += 1) {
            await new Promise(r => setTimeout(r, 120));
            const { face } = await detectFace(video);
            if (face && face.embedding) vectors.push(face.embedding.slice(0));
            const percent = Math.round(((i + 1) / EMBED_FRAMES) * 100);
            openSetup(4, percent);
          }
          const avg = vectors.length ? vectors[0].map((_, idx) => vectors.reduce((s, v) => s + (v[idx] || 0), 0) / vectors.length) : [];
          const profile = {
            user_identity: { username },
            facial_signature: { feature_vector: avg },
            personalization_profile: {},
            learned_preferences: {},
            ai_behavior_configuration: {},
            conversation_memory: {},
            session_state: {}
          };
          await saveProfile(profile);
          profiles = await loadProfiles();
          recordTiming('biometric_signature_creation_time_ms', nowMs() - scanStart);
          recordEvent('profile_created', { username: profile.user_identity.username });
          closeSetup();
        }
      }, { once: true });
    }
  }

  render(0);
}

function livenessCheck(face) {
  if (!face || !face.box) return false;
  const now = Date.now();
  if (!livenessCheck.lastBox) {
    livenessCheck.lastBox = face.box;
    livenessCheck.lastMoveAt = now;
    return true;
  }
  const dx = Math.abs(face.box.x - livenessCheck.lastBox.x);
  const dy = Math.abs(face.box.y - livenessCheck.lastBox.y);
  if (dx + dy > 3) {
    livenessCheck.lastBox = face.box;
    livenessCheck.lastMoveAt = now;
    return true;
  }
  return (now - livenessCheck.lastMoveAt) < 2000;
}

export async function startVIS() {
  ensureMetrics();
  ensureOfflineStyles();
  setVisOffline(true, 'initializing');
  recordEvent('vis_start');
  const modelStart = nowMs();
  await initHuman();
  if (!window.__visHuman) {
    console.warn('[VIS] Human init failed, disabling VIS');
    recordEvent('vis_disabled', { reason: 'human_init_failed' });
    setVisOffline(true, 'human_init_failed');
    return;
  }
  recordTiming('model_load_time_ms', nowMs() - modelStart);
  const cameraStart = nowMs();
  const video = await initCamera();
  recordTiming('camera_start_time_ms', nowMs() - cameraStart);
  const metrics = ensureMetrics();
  metrics.counters.camera_init_attempts = (metrics.counters.camera_init_attempts || 0) + 1;
  if (!video) {
    recordEvent('camera_init_failed', { reason: window.__VIS_CAMERA_ERROR || 'unknown' });
    recordTiming('camera_init_failed_ms', nowMs() - cameraStart);
    recordVerificationFailure('camera_unavailable');
    if (metrics.counters.camera_init_attempts < 3) {
      setTimeout(() => startVIS(), 2000);
    }
    return;
  }
  profiles = await loadProfiles();
  recordEvent('profiles_loaded', { count: profiles.length });

  async function loop() {
    try {
      const detectStart = nowMs();
      const { face } = await detectFace(video);
      const detectMs = nowMs() - detectStart;
      const metrics = ensureMetrics();
      metrics.timings.face_detection_last_ms = detectMs;
      metrics.counters.detect_samples = (metrics.counters.detect_samples || 0) + 1;
      if (metrics.counters.detect_samples % 10 === 0) {
        recordTiming('face_detection_latency_ms', detectMs);
      }
      if (window.__visHumanInitFailed && !metrics.counters.human_init_failed) {
        metrics.counters.human_init_failed = 1;
        recordEvent('human_init_failed');
      }
      const present = presence.update(!!face);
      if (!present) {
        confidence.reset();
        // Go OFFLINE — grey out everything
        setVisOffline(true, 'no_face');
        pauseAI();
        metrics.counters.no_face = (metrics.counters.no_face || 0) + 1;
        if (metrics.counters.no_face % 10 === 0) {
          recordEvent('no_face', { count: metrics.counters.no_face });
          recordVerificationFailure('no_face');
        }
        setTimeout(loop, DETECT_INTERVAL_MS);
        return;
      }
      // Face IS present — come back online
      setVisOffline(false, 'face_detected');
      if (!face || !livenessCheck(face)) {
        metrics.counters.liveness_failed = (metrics.counters.liveness_failed || 0) + 1;
        if (metrics.counters.liveness_failed % 10 === 0) {
          recordEvent('liveness_failed', { count: metrics.counters.liveness_failed });
          recordVerificationFailure('liveness_failed');
        }
        setTimeout(loop, DETECT_INTERVAL_MS);
        return;
      }
      const embedding = face.embedding || [];
      if (!embedding.length) {
        metrics.counters.embedding_missing = (metrics.counters.embedding_missing || 0) + 1;
        if (metrics.counters.embedding_missing % 10 === 0) {
          recordEvent('embedding_missing', { count: metrics.counters.embedding_missing });
          recordVerificationFailure('embedding_missing');
        }
        setTimeout(loop, DETECT_INTERVAL_MS);
        return;
      }
      if (!metrics.timings.verification_start_ms) {
        metrics.timings.verification_start_ms = nowMs();
        recordEvent('verification_started');
      }
      const matchStart = nowMs();
      const match = matchIdentity(embedding, profiles, 0.88);
      const matchMs = nowMs() - matchStart;
      metrics.timings.identity_match_time_ms = matchMs;
      if (metrics.counters.detect_samples % 10 === 0) {
        recordTiming('identity_match_time_ms', matchMs);
      }
      if (!match) {
        metrics.counters.no_match = (metrics.counters.no_match || 0) + 1;
        if (metrics.counters.no_match % 10 === 0) {
          recordEvent('no_match', { count: metrics.counters.no_match });
          recordVerificationFailure('no_match');
        }
        if (!unknownSince) unknownSince = Date.now();
        if (Date.now() - unknownSince > 2000) {
          await setupFlow(video);
          unknownSince = 0;
        }
        setTimeout(loop, DETECT_INTERVAL_MS);
        return;
      }
      unknownSince = 0;
      const confirmed = confidence.update(match.user_id);
      if (confirmed) {
        const isSameUser = lastActiveUserId === match.user_id;
        activeUser = match.profile;
        lastActiveUserId = match.user_id;
        const emotion = topEmotion(face.emotion || []);
        activeUser.session_state = activeUser.session_state || {};
        activeUser.session_state.last_emotion = emotion;
        if (isSameUser) {
          // Same user returned — resume where they left off
          resumeAI(activeUser);
          window.dispatchEvent(new CustomEvent('vis:resume', { detail: { user: match.user_id } }));
        } else {
          // Different user — switch context
          loadAI(activeUser);
          resumeAI(activeUser);
          window.dispatchEvent(new CustomEvent('vis:user_changed', { detail: { user: match.user_id } }));
        }
        if (!metrics.timings.total_verification_time_ms && metrics.timings.verification_start_ms) {
          const total = nowMs() - metrics.timings.verification_start_ms;
          recordTiming('total_verification_time_ms', total);
          recordEvent('verification_complete', { user: match.user_id, total_ms: total });
          if (total > 15000) console.warn('[VIS] Verification exceeded 15s');
        }
      }
      setTimeout(loop, DETECT_INTERVAL_MS);
    } catch (err) {
      console.error('[VIS]', err && err.message);
      setTimeout(loop, DETECT_INTERVAL_MS);
    }
  }

  loop();
}

if(document.readyState === 'complete') startVIS(); else window.addEventListener('load', startVIS);
