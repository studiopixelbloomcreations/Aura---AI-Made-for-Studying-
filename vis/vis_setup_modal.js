(function () {
  function createSetupController(options) {
    const opts = options || {};
    const backdropEl = opts.backdropEl;
    const profileLib = window.PI_VIS_PROFILE;
    const recognitionLib = window.PI_VIS_RECOGNITION;
    if (!backdropEl || !profileLib || !recognitionLib) return null;

    let state = {
      step: 1,
      agreed: false,
      infrared: false,
      username: "",
      busy: false,
    };

    function open(initialUsername) {
      state = Object.assign({}, state, {
        step: 1,
        agreed: false,
        infrared: false,
        username: profileLib.sanitizeUsername(initialUsername || state.username || ""),
        busy: false,
      });
      backdropEl.hidden = false;
      try {
        render();
      } catch (e) {
        renderFallback("Failed to render setup step. Please retry.");
      }
    }

    function close() {
      backdropEl.hidden = true;
      state.busy = false;
    }

    function render() {
      const body = backdropEl.querySelector(".pi-vis-setup-body");
      if (!body) return;
      if (state.step === 1) {
        body.innerHTML =
          '<p><strong>Step 1 of 4: Visual Intelligence Introduction</strong></p>' +
          '<p>Visual Intelligence Setup uses facial recognition to identify you and load your personalized AI profile.</p>' +
          '<p>The system will scan your facial features to generate a secure biometric identity signature.</p>' +
          '<label class="pi-vis-field">Username for identity file<input class="pi-vis-input" data-vis="username" type="text" value="' + String(state.username || "") + '" /></label>' +
          '<div class="pi-vis-actions"><button type="button" class="pi-vis-btn" data-vis-action="continue">Continue</button></div>';
      } else if (state.step === 2) {
        body.innerHTML =
          '<p><strong>Step 2 of 4: User Agreement and Privacy Confirmation</strong></p>' +
          '<p>Facial feature data will only be used for identity recognition and AI personalization.</p>' +
          '<label class="pi-vis-check"><input type="checkbox" data-vis="agree" ' + (state.agreed ? "checked" : "") + ' /> I agree to biometric processing for personalization.</label>' +
          '<div class="pi-vis-actions"><button type="button" class="pi-vis-btn ghost" data-vis-action="back">Back</button><button type="button" class="pi-vis-btn" data-vis-action="continue" ' + (state.agreed ? "" : "disabled") + '>Continue</button></div>';
      } else if (state.step === 3) {
        body.innerHTML =
          '<p><strong>Step 3 of 4: Hardware Capability Question</strong></p>' +
          '<p>Does your webcam support infrared facial recognition?</p>' +
          '<label class="pi-vis-radio"><input type="radio" name="pi-vis-ir" value="yes" ' + (state.infrared ? "checked" : "") + ' /> Yes - My webcam supports infrared scanning</label>' +
          '<label class="pi-vis-radio"><input type="radio" name="pi-vis-ir" value="no" ' + (!state.infrared ? "checked" : "") + ' /> No - My webcam does not support infrared scanning (Normal RGB)</label>' +
          '<div class="pi-vis-note">IR mode uses depth cues when available. RGB mode uses high-precision facial geometry and pixel-level feature vectors across multiple frames.</div>' +
          '<div class="pi-vis-actions"><button type="button" class="pi-vis-btn ghost" data-vis-action="back">Back</button><button type="button" class="pi-vis-btn" data-vis-action="start">Begin Face Scan</button></div>';
      } else {
        body.innerHTML =
          '<p><strong>Step 4 of 4: Biometric Face Scanning</strong></p>' +
          '<p>Scanning in progress...</p>' +
          '<div class="pi-vis-progress"><div class="pi-vis-progress-bar"></div></div>' +
          '<div class="pi-vis-note">Keep your face centered and rotate slightly for multi-angle capture.</div>' +
          '<div class="pi-vis-note">The system is generating your biometric identity signature now.</div>';
      }
      bindEvents();
      // Fail-safe: if any external style/script empties the body, repopulate.
      if (!String(body.innerHTML || "").trim()) {
        renderFallback("Setup content reloaded.");
      }
    }

    function renderFallback(note) {
      const body = backdropEl.querySelector(".pi-vis-setup-body");
      if (!body) return;
      body.innerHTML =
        '<p><strong>Step 1 of 4: Visual Intelligence Introduction</strong></p>' +
        '<p>Visual Intelligence Setup is ready.</p>' +
        '<p>' + String(note || "") + '</p>' +
        '<div class="pi-vis-actions"><button type="button" class="pi-vis-btn" data-vis-action="continue">Continue</button></div>';
      bindEvents();
    }

    function bindEvents() {
      const body = backdropEl.querySelector(".pi-vis-setup-body");
      if (!body) return;
      const usernameInput = body.querySelector('[data-vis="username"]');
      if (usernameInput) {
        usernameInput.addEventListener("input", function () {
          state.username = profileLib.sanitizeUsername(usernameInput.value);
        });
      }
      const agreeInput = body.querySelector('[data-vis="agree"]');
      if (agreeInput) {
        agreeInput.addEventListener("change", function () {
          state.agreed = !!agreeInput.checked;
          render();
        });
      }
      const radios = body.querySelectorAll('input[name="pi-vis-ir"]');
      if (radios && radios.length) {
        radios.forEach(function (r) {
          r.addEventListener("change", function () {
            state.infrared = String(r.value || "") === "yes";
          });
        });
      }
      const actionBtns = body.querySelectorAll("[data-vis-action]");
      if (actionBtns && actionBtns.length) {
        actionBtns.forEach(function (btn) {
          btn.addEventListener("click", function () {
            const action = String(btn.getAttribute("data-vis-action") || "");
            if (action === "back") {
              state.step = Math.max(1, state.step - 1);
              render();
              return;
            }
            if (action === "continue") {
              if (state.step === 2 && !state.agreed) return;
              state.step = Math.min(3, state.step + 1);
              render();
              return;
            }
            if (action === "start") startScan();
          });
        });
      }
    }

    async function startScan() {
      if (state.busy || !opts.captureFrames || !opts.onProfileReady) return;
      state.busy = true;
      state.step = 4;
      render();
      const scan = await opts.captureFrames({
        frameCount: Number(opts.scanFrameCount || 18),
      });
      state.busy = false;
      if (!scan || !Array.isArray(scan.vectors) || !scan.vectors.length) {
        state.step = 3;
        render();
        if (typeof opts.onScanFailed === "function") opts.onScanFailed();
        return;
      }
      const avgVector = recognitionLib.averageVectors(scan.vectors);
      const signatureRows = Array.isArray(scan.signatures) ? scan.signatures : [];
      const sampleGeometry = signatureRows.length && signatureRows[0] && signatureRows[0].geometry
        ? signatureRows[0].geometry
        : {};
      const hardware = scan && scan.hardware && typeof scan.hardware === "object" ? scan.hardware : {};
      const infraredAvailable = !!(hardware && hardware.infrared_supported);
      const hints = typeof opts.getIdentityHints === "function" ? opts.getIdentityHints() : { username: "", account_identifier: "" };
      const username = profileLib.sanitizeUsername(state.username || hints.username) || "user";
      const profile = profileLib.buildDefaultProfile(username, hints.account_identifier, {
        scan_mode: state.infrared ? "infrared_assisted" : "high_precision_rgb",
        infrared_mode_requested: !!state.infrared,
        infrared_mode_available: infraredAvailable,
        infrared_mode_effective: !!(state.infrared && infraredAvailable),
        frame_count: scan.vectors.length,
        landmark_snapshots: Array.isArray(scan.landmarks) ? scan.landmarks.slice(0, 6) : [],
        feature_vector: avgVector,
        geometry_data: sampleGeometry,
        frame_signature_samples: signatureRows.slice(0, 8),
        hardware_capabilities: hardware,
        created_at: profileLib.nowIso(),
      });
      await opts.onProfileReady(profile, avgVector);
      close();
    }

    return {
      open: open,
      close: close,
      isOpen: function () { return !backdropEl.hidden; },
    };
  }

  window.PI_VIS_SETUP_MODAL = {
    createSetupController: createSetupController,
  };
})();
