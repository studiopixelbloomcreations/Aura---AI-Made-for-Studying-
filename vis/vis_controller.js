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

const presence = createPresenceEngine();
const confidence = createConfidenceEngine();

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
          saveProfile(profile);
          profiles = await loadProfiles();
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
  await initHuman();
  const video = await initCamera();
  profiles = await loadProfiles();

  async function loop() {
    try {
      const { face } = await detectFace(video);
      const present = presence.update(!!face);
      if (!present) {
        confidence.reset();
        activeUser = null;
        pauseAI();
        setTimeout(loop, DETECT_INTERVAL_MS);
        return;
      }
      if (!face || !livenessCheck(face)) {
        setTimeout(loop, DETECT_INTERVAL_MS);
        return;
      }
      const embedding = face.embedding || [];
      if (!embedding.length) {
        setTimeout(loop, DETECT_INTERVAL_MS);
        return;
      }
      const match = matchIdentity(embedding, profiles, 0.88);
      if (!match) {
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
        activeUser = match.profile;
        const emotion = topEmotion(face.emotion || []);
        activeUser.session_state = activeUser.session_state || {};
        activeUser.session_state.last_emotion = emotion;
        loadAI(activeUser);
        resumeAI(activeUser);
      }
      setTimeout(loop, DETECT_INTERVAL_MS);
    } catch (err) {
      console.error('[VIS]', err && err.message);
      setTimeout(loop, DETECT_INTERVAL_MS);
    }
  }

  loop();
}

window.addEventListener('load', () => {
  startVIS();
});
