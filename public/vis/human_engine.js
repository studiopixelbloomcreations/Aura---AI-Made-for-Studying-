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
    window.__visHumanInitError = err || new Error('DeepFace backend init failed');
  }
}

function getApiFetch() {
  return (window.Api && window.Api.apiFetch) ? window.Api.apiFetch : function(path, options) {
    return fetch(path, options);
  };
}

function captureFrameDataUrl(video) {
  if (!video || !video.videoWidth || !video.videoHeight) return null;
  const canvas = window.__visCaptureCanvas || document.createElement('canvas');
  window.__visCaptureCanvas = canvas;
  const w = Math.min(320, video.videoWidth);
  const h = Math.min(240, video.videoHeight);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(video, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.7);
  } catch (_) {
    return null;
  }
}

export async function initHuman() {
  if (window.__visHuman) return window.__visHuman;
  if (window.__visHumanInitFailed) return null;
  try {
    const res = await getApiFetch()('/vis/face/health', { method: 'GET' });
    const data = res && res.ok ? await res.json() : null;
    if (!data || !data.ok) throw new Error('DeepFace backend not ready');
    window.__visHuman = { backend: 'deepface' };
    return window.__visHuman;
  } catch (err) {
    markHumanFailure(err);
    return null;
  }
}

export async function detectFace(video) {
  const testMode = isTestMode();
  const useMock = testMode && window.__VIS_TEST_USE_MOCK !== false;
  if (useMock) {
    const face = buildTestFace();
    return { result: { face: [face] }, face };
  }
  const ready = await initHuman();
  if (!ready) return { result: null, face: null };
  if (window.__visBackendDetectBusy) return { result: null, face: null };
  const dataUrl = captureFrameDataUrl(video);
  if (!dataUrl) return { result: null, face: null };
  window.__visBackendDetectBusy = true;
  try {
    const res = await getApiFetch()('/vis/face/embedding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_base64: dataUrl,
        model: window.__VIS_DEEPFACE_MODEL || 'Facenet512',
        detector: window.__VIS_DEEPFACE_DETECTOR || 'opencv'
      })
    });
    if (!res || !res.ok) return { result: null, face: null };
    const data = await res.json();
    const faces = data && Array.isArray(data.faces) ? data.faces : [];
    const face = faces[0] || null;
    return { result: { face: faces }, face };
  } catch (err) {
    return { result: null, face: null };
  } finally {
    window.__visBackendDetectBusy = false;
  }
}
