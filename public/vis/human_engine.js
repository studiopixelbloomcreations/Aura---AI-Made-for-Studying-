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
  // Force CPU backend and disable GPU backends if not in test mode
  if (human.tf) {
    try { if (human.tf.removeBackend) human.tf.removeBackend('webgl'); } catch (_) {}
    try { if (human.tf.removeBackend) human.tf.removeBackend('webgpu'); } catch (_) {}
    try { if (human.tf.removeBackend) human.tf.removeBackend('wasm'); } catch (_) {}
    try { await human.tf.setBackend('cpu'); } catch (_) {}
    try { await human.tf.ready(); } catch (_) {}
  }
  if (!isTestMode() && !human.tf) throw new Error('Human.js TF backend missing');
  return human;
}

export async function initHuman() {
  if (window.__visHuman) return window.__visHuman;
  if (window.__visHumanInitFailed) return null;
  if (!window.Human || !window.Human.Human) throw new Error('Human.js not loaded');

  // Force CPU backend to avoid WebGL/WebGPU crashes
  const humanConfig = {
    backend: 'cpu',
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
      console.warn('[VIS] Initial load failed, retrying with fallback CPU config...');
      const fallbackConfig = Object.assign({}, humanConfig, { backend: 'cpu' });
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
  if (!human) {
    return { result: null, face: null };
  }
  // Global mutex queue for WebGL safety
  window.__visDetectQueue = window.__visDetectQueue || Promise.resolve();

  return new Promise(function(resolve) {
    window.__visDetectQueue = window.__visDetectQueue.then(async function() {
      try {
        const result = await human.detect(video);
        const face = result && result.face && result.face[0] ? result.face[0] : null;
        if (!face && result) {
          window.__visDetectMissCount = (window.__visDetectMissCount || 0) + 1;
          if (window.__visDetectMissCount <= 3 || window.__visDetectMissCount % 10 === 0) {
            console.log('[VIS] detect returned', result.face ? result.face.length : 0, 'faces (miss #' + window.__visDetectMissCount + ')');
          }
        } else if (face) {
          window.__visDetectMissCount = 0;
        }
        resolve({ result, face });
      } catch (detectErr) {
        resolve({ result: null, face: null });
      }
    });
  });
}
