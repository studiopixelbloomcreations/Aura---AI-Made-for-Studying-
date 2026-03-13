// VIS Controller
(function () {
  const VIS = (window.VIS = window.VIS || {});
  let running = false;
  let video = null;
  let profiles = [];
  let activeProfile = null;
  let unknownSince = 0;
  let lastCenter = null;
  let lastMoveAt = 0;
  let modalEl = null;

  function ensureModalStyles() {
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
      '.vis-setup-bar{height:100%;width:0%;background:#6ad0ff;transition:width .2s ease;}' +
      '.vis-setup-note{font-size:12px;opacity:.7;margin-top:8px;}';
    document.head.appendChild(style);
  }

  function openModal(content) {
    ensureModalStyles();
    if (modalEl && modalEl.parentNode) modalEl.parentNode.removeChild(modalEl);
    modalEl = document.createElement('div');
    modalEl.className = 'vis-setup-overlay';
    modalEl.innerHTML = content;
    document.body.appendChild(modalEl);
  }

  function closeModal() {
    if (modalEl && modalEl.parentNode) modalEl.parentNode.removeChild(modalEl);
    modalEl = null;
  }

  function selectPrimary(detections) {
    if (!detections.length) return null;
    let best = null;
    let bestScore = -1;
    for (const d of detections) {
      const box = d.boundingBox;
      if (!box) continue;
      const area = box.width * box.height;
      const cx = box.xmin + box.width / 2;
      const cy = box.ymin + box.height / 2;
      const centerScore = 1 - Math.min(1, Math.hypot(cx - 0.5, cy - 0.5));
      const score = area + centerScore;
      if (score > bestScore) { bestScore = score; best = d; }
    }
    return best || detections[0];
  }

  function isLive(box) {
    if (!box) return false;
    const cx = box.xmin + box.width / 2;
    const cy = box.ymin + box.height / 2;
    const now = Date.now();
    if (!lastCenter) {
      lastCenter = { cx, cy };
      lastMoveAt = now;
      return true;
    }
    const moved = Math.hypot(cx - lastCenter.cx, cy - lastCenter.cy);
    if (moved > 0.01) {
      lastCenter = { cx, cy };
      lastMoveAt = now;
      return true;
    }
    return (now - lastMoveAt) < 2000;
  }

  async function setupFlow() {
    let step = 1;
    let username = '';

    function render() {
      if (step === 1) {
        openModal(`
          <div class="vis-setup-card">
            <div class="vis-setup-title">Visual Intelligence Setup</div>
            <div class="vis-setup-body">We will scan your facial features to create a secure biometric identity signature for personalized AI.</div>
            <div class="vis-setup-actions"><button class="vis-setup-btn" data-next>Continue</button></div>
          </div>
        `);
      } else if (step === 2) {
        openModal(`
          <div class="vis-setup-card">
            <div class="vis-setup-title">Privacy Agreement</div>
            <div class="vis-setup-body">Facial data is used only for identity recognition and personalization.</div>
            <div class="vis-setup-actions"><button class="vis-setup-btn" data-next>Agree</button></div>
          </div>
        `);
      } else if (step === 3) {
        openModal(`
          <div class="vis-setup-card">
            <div class="vis-setup-title">Create Identity</div>
            <div class="vis-setup-body">Enter your username for the identity file.</div>
            <input class="vis-setup-input" placeholder="username" />
            <div class="vis-setup-actions"><button class="vis-setup-btn" data-next>Start Scan</button></div>
          </div>
        `);
      } else if (step === 4) {
        openModal(`
          <div class="vis-setup-card">
            <div class="vis-setup-title">Scanning</div>
            <div class="vis-setup-body">Keep your face centered and slightly change angle.</div>
            <div class="vis-setup-progress"><div class="vis-setup-bar"></div></div>
            <div class="vis-setup-note">This will take ~5 seconds.</div>
          </div>
        `);
      }

      const nextBtn = modalEl.querySelector('[data-next]');
      if (nextBtn) {
        nextBtn.addEventListener('click', async () => {
          if (step === 3) {
            const input = modalEl.querySelector('.vis-setup-input');
            username = (input && input.value || '').trim() || 'user';
          }
          step += 1;
          render();
          if (step === 4) {
            const bar = modalEl.querySelector('.vis-setup-bar');
            const frames = 12;
            const vectors = [];
            for (let i = 0; i < frames; i += 1) {
              await new Promise(r => setTimeout(r, 120));
              const emb = await VIS.embeddingEngine.embed(video);
              if (emb.embedding && emb.embedding.length) vectors.push(emb.embedding);
              if (bar) bar.style.width = Math.round(((i + 1) / frames) * 100) + '%';
            }
            const avg = vectors.length ? vectors[0].map((_, idx) => vectors.reduce((s, v) => s + (v[idx] || 0), 0) / vectors.length) : [];
            const profile = {
              user_identity: { username },
              facial_signature: { feature_vector: avg }
            };
            VIS.identityEngine.saveProfile(profile, avg);
            profiles = await VIS.identityEngine.loadProfiles();
            closeModal();
          }
        });
      }
    }

    render();
  }

  async function loop() {
    if (!running) return;
    try {
      const detections = await VIS.detectorEngine.detect(video);
      const primary = selectPrimary(detections);
      const box = primary ? primary.boundingBox : null;
      VIS.trackerEngine.update(box);

      const present = VIS.presenceEngine.update(!!box);
      if (!present) {
        VIS.confidenceEngine.reset();
        activeProfile = null;
        VIS.aiRouter.pause();
        setTimeout(loop, 300);
        return;
      }

      if (!isLive(box)) {
        setTimeout(loop, 300);
        return;
      }

      const emb = await VIS.embeddingEngine.embed(video);
      if (!emb.embedding || !emb.embedding.length) { setTimeout(loop, 300); return; }

      const match = VIS.vectorEngine.match(emb.embedding, profiles, 0.9);
      if (!match) {
        if (!unknownSince) unknownSince = Date.now();
        if (Date.now() - unknownSince > 2000) {
          await setupFlow();
          unknownSince = 0;
        }
        setTimeout(loop, 300);
        return;
      }

      unknownSince = 0;
      const confirmed = VIS.confidenceEngine.update(match.user_id);
      if (confirmed) {
        activeProfile = match.profile;
        VIS.aiRouter.load(activeProfile);
      }
      setTimeout(loop, 300);
    } catch (e) {
      console.error('[VIS]', e && e.message);
      setTimeout(loop, 300);
    }
  }

  VIS.visController = {
    async start() {
      if (running) return;
      running = true;
      const cam = await VIS.cameraEngine.init();
      video = cam.video;
      await VIS.detectorEngine.init();
      await VIS.embeddingEngine.init();
      profiles = await VIS.identityEngine.loadProfiles();
      loop();
    }
  };
})();
