(function () {
  function createRuntime(options) {
    const opts = options || {};
    const recognitionLib = window.PI_VIS_RECOGNITION;
    const setupLib = window.PI_VIS_SETUP_MODAL;
    if (!recognitionLib || !setupLib) return null;

    const state = {
      detector: null,
      monitorTimer: null,
      detectBusy: false,
      active: false,
      indexRows: [],
      indexLoaded: false,
      noMatchCount: 0,
      candidate: { profileFile: "", count: 0 },
      facePresent: false,
      hardware: {
        infrared_supported: false,
        capability_probe: {},
      },
    };

    const cfg = {
      threshold: Number(opts.threshold || 0.93),
      stableCount: Number(opts.stableCount || 3),
      scanIntervalMs: Number(opts.scanIntervalMs || 220),
      scanFrameCount: Number(opts.scanFrameCount || 18),
    };

    const setup = setupLib.createSetupController({
      backdropEl: opts.setupEl,
      scanFrameCount: cfg.scanFrameCount,
      getIdentityHints: function () {
        return typeof opts.getIdentityHints === "function" ? opts.getIdentityHints() : { username: "user", account_identifier: "unknown" };
      },
      getHardwareCapabilities: function () {
        return Object.assign({}, state.hardware || {});
      },
      captureFrames: async function (params) {
        return captureFrames(params);
      },
      onProfileReady: async function (profile, vector) {
        if (typeof opts.saveProfile === "function") await opts.saveProfile(profile);
        state.indexRows.push({
          profileFile: String(profile.file_name),
          username: String((profile.user_identity && profile.user_identity.username) || profile.file_name),
          vector: Array.isArray(vector) ? vector.slice(0, 256) : [],
          profile: profile,
        });
        if (typeof opts.onProfileCreated === "function") await opts.onProfileCreated(profile);
      },
      onScanFailed: function () {
        if (typeof opts.onScanFailed === "function") opts.onScanFailed();
      },
    });

    function emitStatus(status) {
      if (typeof opts.onStatus === "function") opts.onStatus(status);
    }

    async function loadIndex() {
      if (typeof opts.loadIndex !== "function") {
        state.indexRows = [];
        state.indexLoaded = true;
        return;
      }
      const rows = await opts.loadIndex();
      state.indexRows = Array.isArray(rows) ? rows : [];
      state.indexLoaded = true;
    }

    function initDetector() {
      try {
        if ("FaceDetector" in window) {
          state.detector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
          return true;
        }
      } catch (e) {}
      state.detector = null;
      emitStatus("Offline - face API unsupported");
      if (typeof opts.onOffline === "function") opts.onOffline("Offline - face API unsupported");
      return false;
    }

    async function ensureCamera() {
      if (!opts.videoEl || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;
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
        opts.videoEl.srcObject = stream;
        await opts.videoEl.play();
        const track = stream.getVideoTracks && stream.getVideoTracks()[0] ? stream.getVideoTracks()[0] : null;
        const capabilities = track && track.getCapabilities ? track.getCapabilities() : {};
        const settings = track && track.getSettings ? track.getSettings() : {};
        const inferredInfrared = !!(
          (capabilities && (capabilities.depthNear || capabilities.depthFar || capabilities.irisMode || capabilities.eyeGazeCorrection)) ||
          (settings && (settings.depthNear || settings.depthFar || settings.irisMode || settings.eyeGazeCorrection))
        );
        state.hardware = {
          infrared_supported: inferredInfrared,
          capability_probe: {
            capabilities: capabilities || {},
            settings: settings || {},
          },
        };
        return true;
      } catch (e) {
        emitStatus("Offline - camera denied");
        if (typeof opts.onOffline === "function") opts.onOffline("Offline - camera denied");
        return false;
      }
    }

    async function detectFaces() {
      if (!state.detector || !opts.videoEl) return [];
      try {
        const faces = await state.detector.detect(opts.videoEl);
        return Array.isArray(faces) ? faces : [];
      } catch (e) {
        return [];
      }
    }

    async function captureFrames(params) {
      const count = Math.max(8, Number(params && params.frameCount ? params.frameCount : cfg.scanFrameCount));
      const vectors = [];
      const landmarks = [];
      const signatures = [];
      for (let i = 0; i < count; i += 1) {
        await new Promise(function (resolve) { setTimeout(resolve, 120); });
        const faces = await detectFaces();
        if (!faces.length) continue;
        const face = faces[0];
        const signature = recognitionLib.extractFaceSignature
          ? recognitionLib.extractFaceSignature(opts.videoEl, opts.canvasEl, face)
          : { feature_vector: recognitionLib.extractFaceVector(opts.videoEl, opts.canvasEl, face), landmarks: [], geometry: {} };
        const vector = Array.isArray(signature.feature_vector) ? signature.feature_vector : [];
        if (vector.length) vectors.push(vector);
        signatures.push(signature);
        if (face.landmarks && Array.isArray(face.landmarks)) {
          landmarks.push(face.landmarks.map(function (p) {
            return { x: Number(p.x || 0), y: Number(p.y || 0), type: String(p.type || "") };
          }));
        }
        if (opts.setupEl) {
          const bar = opts.setupEl.querySelector(".pi-vis-progress-bar");
          if (bar) bar.style.width = Math.min(100, Math.round(((i + 1) / count) * 100)) + "%";
        }
      }
      return {
        vectors: vectors,
        landmarks: landmarks,
        signatures: signatures,
        hardware: Object.assign({}, state.hardware || {}),
      };
    }

    async function processFrame() {
      if (!state.active || state.detectBusy || (setup && setup.isOpen())) return;
      state.detectBusy = true;
      try {
        if (!state.indexLoaded) await loadIndex();
        const faces = await detectFaces();
        if (!faces.length) {
          state.facePresent = false;
          state.candidate = { profileFile: "", count: 0 };
          state.noMatchCount = 0;
          if (typeof opts.onOffline === "function") opts.onOffline("Offline - no face");
          emitStatus("Offline - no face");
          return;
        }

        state.facePresent = true;
        const vector = recognitionLib.extractFaceVector(opts.videoEl, opts.canvasEl, faces[0]);
        if (!vector.length) {
          if (typeof opts.onOffline === "function") opts.onOffline("Offline - no face");
          emitStatus("Offline - no face");
          return;
        }

        const match = recognitionLib.findBestMatch(vector, state.indexRows);
        if (!match || match.score < cfg.threshold) {
          state.noMatchCount += 1;
          if (state.noMatchCount >= cfg.stableCount) {
            emitStatus("Offline - unrecognized face");
            if (typeof opts.onOffline === "function") opts.onOffline("Offline - unrecognized face");
            if (setup && !setup.isOpen()) {
              const hints = typeof opts.getIdentityHints === "function" ? opts.getIdentityHints() : { username: "user" };
              try {
                setup.open(hints.username);
              } catch (e) {
                if (typeof opts.onRequireSetupFallback === "function") opts.onRequireSetupFallback();
              }
            } else if (!setup && typeof opts.onRequireSetupFallback === "function") {
              opts.onRequireSetupFallback();
            }
          }
          return;
        }

        state.noMatchCount = 0;
        if (state.candidate.profileFile === match.profileFile) {
          state.candidate.count += 1;
        } else {
          state.candidate = { profileFile: match.profileFile, count: 1 };
        }

        if (state.candidate.count < cfg.stableCount) {
          emitStatus("Recognizing user...");
          if (typeof opts.onRecognizing === "function") opts.onRecognizing();
          return;
        }

        emitStatus("Online - " + String(match.username || "User"));
        if (typeof opts.onProfileMatched === "function") await opts.onProfileMatched(match);
      } finally {
        state.detectBusy = false;
      }
    }

    async function start() {
      if (state.active) return true;
      const hasDetector = initDetector();
      if (!hasDetector) return false;
      await loadIndex();
      const cameraOk = await ensureCamera();
      if (!cameraOk) return false;
      state.active = true;
      emitStatus("Scanning for face...");
      if (state.monitorTimer) clearInterval(state.monitorTimer);
      state.monitorTimer = setInterval(function () {
        processFrame();
      }, cfg.scanIntervalMs);
      return true;
    }

    function stop() {
      state.active = false;
      if (state.monitorTimer) clearInterval(state.monitorTimer);
      state.monitorTimer = null;
      try {
        const stream = opts.videoEl && opts.videoEl.srcObject;
        if (stream && stream.getTracks) {
          stream.getTracks().forEach(function (t) { t.stop(); });
        }
      } catch (e) {}
      if (opts.videoEl) opts.videoEl.srcObject = null;
      if (setup) setup.close();
    }

    return {
      start: start,
      stop: stop,
      refreshIndex: loadIndex,
      isSetupOpen: function () { return setup ? setup.isOpen() : false; },
      openSetup: function () {
        if (!setup) return;
        const hints = typeof opts.getIdentityHints === "function" ? opts.getIdentityHints() : { username: "user" };
        setup.open(hints.username);
      },
      closeSetup: function () {
        if (setup) setup.close();
      },
    };
  }

  window.PI_VIS_RUNTIME = {
    createRuntime: createRuntime,
  };
})();
