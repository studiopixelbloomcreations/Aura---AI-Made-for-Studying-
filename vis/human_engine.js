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
    window.__visHumanInitError = err || new Error('MediaPipe init failed');
  }
}

const MP_VISION_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.mjs';
const MP_WASM_PATH = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MP_FACE_DETECTOR_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';
const MP_IMAGE_EMBEDDER_MODEL = 'https://storage.googleapis.com/mediapipe-models/image_embedder/mobilenet_v3_small/float32/1/mobilenet_v3_small.tflite';
let mpReadyPromise = null;
let mpFaceDetector = null;
let mpImageEmbedder = null;

async function ensureMediapipeReady() {
  if (mpReadyPromise) return mpReadyPromise;
  mpReadyPromise = (async function() {
    const vision = await import(MP_VISION_CDN);
    const { FilesetResolver, FaceDetector, ImageEmbedder } = vision;
    const fileset = await FilesetResolver.forVisionTasks(MP_WASM_PATH);
    mpFaceDetector = await FaceDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MP_FACE_DETECTOR_MODEL },
      runningMode: 'VIDEO'
    });
    mpImageEmbedder = await ImageEmbedder.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MP_IMAGE_EMBEDDER_MODEL },
      runningMode: 'VIDEO',
      l2Normalize: true,
      quantize: false
    });
  })();
  return mpReadyPromise;
}

function captureFaceCrop(video, box) {
  if (!video || !video.videoWidth || !video.videoHeight) return null;
  if (!box) return null;
  const canvas = window.__visCaptureCanvas || document.createElement('canvas');
  window.__visCaptureCanvas = canvas;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const x = Math.max(0, Math.min(vw - 1, box.x));
  const y = Math.max(0, Math.min(vh - 1, box.y));
  const w = Math.max(1, Math.min(vw - x, box.width));
  const h = Math.max(1, Math.min(vh - y, box.height));
  const target = 224;
  canvas.width = target;
  canvas.height = target;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(video, x, y, w, h, 0, 0, target, target);
    return canvas;
  } catch (_) {
    return null;
  }
}

function normalizeBox(bbox) {
  if (!bbox) return null;
  const x = Number(bbox.originX || bbox.x || 0);
  const y = Number(bbox.originY || bbox.y || 0);
  const w = Number(bbox.width || 0);
  const h = Number(bbox.height || 0);
  return { x, y, width: w, height: h };
}


export async function initHuman() {
  if (window.__visHuman) return window.__visHuman;
  if (window.__visHumanInitFailed) return null;
  try {
    await ensureMediapipeReady();
    if (!mpFaceDetector || !mpImageEmbedder) throw new Error('MediaPipe not initialized');
    window.__visHuman = { backend: 'mediapipe' };
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
  window.__visBackendDetectBusy = true;
  try {
    await ensureMediapipeReady();
    if (!mpFaceDetector || !mpImageEmbedder) return { result: null, face: null };
    const ts = (window.performance && performance.now) ? performance.now() : Date.now();
    const detectionResult = mpFaceDetector.detectForVideo(video, ts);
    const detections = detectionResult && Array.isArray(detectionResult.detections) ? detectionResult.detections : [];
    if (!detections.length) return { result: { face: [] }, face: null };
    const bbox = normalizeBox(detections[0].boundingBox);
    const crop = captureFaceCrop(video, bbox);
    if (!crop) return { result: { face: [] }, face: null };
    const embedResult = mpImageEmbedder.embedForVideo(crop, ts);
    const embedding = embedResult && embedResult.embeddings && embedResult.embeddings[0]
      ? (embedResult.embeddings[0].floatEmbedding || [])
      : [];
    const face = { embedding, box: bbox, emotion: [] };
    return { result: { face: [face] }, face };
  } catch (err) {
    return { result: null, face: null };
  } finally {
    window.__visBackendDetectBusy = false;
  }
}
