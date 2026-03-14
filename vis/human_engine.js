function isTestMode() {
  try {
    const params = new URLSearchParams(window.location.search || '');
    const hasMock = params.has('visMock');
    if (hasMock && typeof window.__VIS_TEST_USE_MOCK === 'undefined') window.__VIS_TEST_USE_MOCK = true;
    if (hasMock) window.__VIS_MOCK_MODE__ = true;
    return !!(window.__VIS_TEST_MODE || window.__VIS_MOCK_MODE__ || params.has('visTest') || hasMock);
  } catch (e) {
    return !!window.__VIS_TEST_MODE;
  }
}

function buildTestEmbedding(length) {
  const out = new Array(length);
  for (let i = 0; i < length; i += 1) out[i] = ((i % 13) + 1) / 13;
  return out;
}

function buildTestFace() {
  const frame = (window.__VIS_TEST_FRAME = (window.__VIS_TEST_FRAME || 0) + 1);
  const drift = (frame % 6) - 3;
  return {
    embedding: buildTestEmbedding(128),
    box: { x: 100 + drift, y: 80, width: 160, height: 160 },
    emotion: [{ emotion: 'neutral', score: 0.9 }]
  };
}

function markHumanFailure(err) {
  if (!window.__visHumanInitFailed) {
    window.__visHumanInitFailed = true;
    window.__visHumanInitError = err || new Error('Human.js init failed');
  }
}

async function loadHuman(humanConfig) {
  const human = new window.Human.Human(humanConfig);
  if (human.load) await human.load();
  // Clean up after load() — it re-registers backends internally
  // WebGL/WebGPU are blocked at browser API level (app.html) so this is safe
  if (human.tf) {
    try { if (human.tf.removeBackend) human.tf.removeBackend('webgl'); } catch (_) {}
    try { if (human.tf.removeBackend) human.tf.removeBackend('webgpu'); } catch (_) {}
    try { await human.tf.setBackend('wasm'); } catch (_) {}
    try { await human.tf.ready(); } catch (_) {}
  }
  return human;
}

export async function initHuman() {
  if (window.__visHuman) return window.__visHuman;
  if (window.__visHumanInitFailed) return null;
  if (!window.Human || !window.Human.Human) throw new Error('Human.js not loaded');
  const humanConfig = {
    backend: 'wasm', // Force wasm to avoid WebGL context crashes
    wasmPath: 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm@4.22.0/dist/',
    modelBasePath: 'https://cdn.jsdelivr.net/npm/@vladmandic/human/models/',
    cacheModels: true,
    face: {
      enabled: true,
      detector: { rotation: true },
      mesh: false,
      iris: false,
      description: true
    },
    emotion: { enabled: true },
    body: { enabled: false },
    hand: { enabled: false }
  };
  let human;
  try {
    human = await loadHuman(humanConfig);
  } catch (err) {
    try {
      const fallbackConfig = Object.assign({}, humanConfig, { backend: 'wasm' });
      human = await loadHuman(fallbackConfig);
    } catch (fallbackErr) {
      markHumanFailure(fallbackErr || err);
      return null;
    }
  }
  window.__visHuman = human;
  return human;
}

export async function detectFace(video) {
  const testMode = isTestMode();
  const useMock = testMode && window.__VIS_TEST_USE_MOCK !== false;
  if (useMock) {
    const face = buildTestFace();
    return { result: { face: [face] }, face };
  }
  const human = await initHuman();
  if (!human) return { result: null, face: null };
  // Check AND acquire lock synchronously to avoid async race condition
  if (window.__visDetectBusy) return { result: null, face: null };
  window.__visDetectBusy = true;
  try {
    if (human.tf && human.tf.engine && human.tf.engine().startScope) human.tf.engine().startScope();
    const result = await human.detect(video);
    if (human.tf && human.tf.engine && human.tf.engine().endScope) human.tf.engine().endScope();
    if (human.tf && human.tf.nextFrame) await human.tf.nextFrame();
    const face = result && result.face && result.face[0] ? result.face[0] : null;
    return { result, face };
  } catch (detectErr) {
    console.warn('[VIS] human.detect error (WebGL may have crashed):', detectErr && detectErr.message);
    try { if (human.tf && human.tf.engine && human.tf.engine().endScope) human.tf.engine().endScope(); } catch (_) {}
    // Trigger recovery: destroy corrupted instance so it reinitializes on next frame
    window.__visHuman = null;
    window.__visHumanInitFailed = true; // Tell UI to use fallback
    return { result: null, face: null };
  } finally {
    window.__visDetectBusy = false;
  }
}
