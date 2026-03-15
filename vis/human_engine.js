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
const MP_IMAGE_EMBEDDER_MODEL = 'https://storage.googleapis.com/mediapipe-models/image_embedder/mobilenet_v3_small/float32/1/mobilenet_v3_small.tflite';
const MP_FACE_LANDMARKER_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
let mpReadyPromise = null;
let mpImageEmbedder = null;
let mpFaceLandmarker = null;

async function ensureMediapipeReady() {
  if (mpReadyPromise) return mpReadyPromise;
  mpReadyPromise = (async function() {
    const vision = await import(MP_VISION_CDN);
    const { FilesetResolver, ImageEmbedder, FaceLandmarker } = vision;
    const fileset = await FilesetResolver.forVisionTasks(MP_WASM_PATH);
    mpImageEmbedder = await ImageEmbedder.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MP_IMAGE_EMBEDDER_MODEL },
      runningMode: 'VIDEO',
      l2Normalize: true,
      quantize: false
    });
    mpFaceLandmarker = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MP_FACE_LANDMARKER_MODEL },
      runningMode: 'VIDEO',
      outputFaceBlendshapes: true,
      numFaces: 1
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

function boxFromLandmarks(landmarks, vw, vh) {
  if (!landmarks || !landmarks.length || !vw || !vh) return null;
  let minX = 1, minY = 1, maxX = 0, maxY = 0;
  for (let i = 0; i < landmarks.length; i += 1) {
    const pt = landmarks[i];
    const x = Math.min(1, Math.max(0, Number(pt.x || 0)));
    const y = Math.min(1, Math.max(0, Number(pt.y || 0)));
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const pad = 0.12;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(1, maxX + pad);
  maxY = Math.min(1, maxY + pad);
  const x = Math.round(minX * vw);
  const y = Math.round(minY * vh);
  const w = Math.max(1, Math.round((maxX - minX) * vw));
  const h = Math.max(1, Math.round((maxY - minY) * vh));
  return { x, y, width: w, height: h };
}
function extractEmbedding(embedResult) {
  if (!embedResult || !embedResult.embeddings || !embedResult.embeddings.length) return [];
  const emb = embedResult.embeddings[0] || {};
  if (Array.isArray(emb.floatEmbedding) && emb.floatEmbedding.length) return emb.floatEmbedding;
  if (Array.isArray(emb.embedding) && emb.embedding.length) return emb.embedding;
  if (Array.isArray(emb.quantizedEmbedding) && emb.quantizedEmbedding.length) {
    return emb.quantizedEmbedding.map(function(v) { return Number(v) / 255; });
  }
  return [];
}

function blendshapeToEmotion(blendshapes) {
  if (!blendshapes || !blendshapes.length) return [];
  const scores = {};
  for (const item of blendshapes) {
    const name = item && item.categoryName ? String(item.categoryName) : '';
    const score = Number(item && item.score || 0);
    scores[name] = score;
  }
  const smile = (scores.mouthSmileLeft || 0) + (scores.mouthSmileRight || 0);
  const frown = (scores.mouthFrownLeft || 0) + (scores.mouthFrownRight || 0);
  const browDown = (scores.browDownLeft || 0) + (scores.browDownRight || 0);
  const browInnerUp = (scores.browInnerUp || 0);
  const jawOpen = (scores.jawOpen || 0);
  const lipPress = (scores.mouthPressLeft || 0) + (scores.mouthPressRight || 0);
  const surprise = Math.min(1, jawOpen * 0.7 + browInnerUp * 0.5);
  const happy = Math.min(1, smile);
  const sad = Math.min(1, frown * 0.6 + browInnerUp * 0.4);
  const angry = Math.min(1, browDown * 0.6 + lipPress * 0.4);
  const neutral = Math.max(0, 1 - Math.max(happy, sad, angry, surprise));
  return [
    { emotion: 'happy', score: happy },
    { emotion: 'sad', score: sad },
    { emotion: 'angry', score: angry },
    { emotion: 'surprised', score: surprise },
    { emotion: 'neutral', score: neutral }
  ];
}


export async function initHuman() {
  if (window.__visHuman) return window.__visHuman;
  if (window.__visHumanInitFailed) return null;
  try {
    await ensureMediapipeReady();
    if (!mpImageEmbedder || !mpFaceLandmarker) throw new Error('MediaPipe not initialized');
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
    if (!mpImageEmbedder || !mpFaceLandmarker) return { result: null, face: null };
    const ts = (window.performance && performance.now) ? performance.now() : Date.now();
    const landmarkerResult = mpFaceLandmarker.detectForVideo(video, ts);
    const landmarks = landmarkerResult && landmarkerResult.faceLandmarks && landmarkerResult.faceLandmarks[0]
      ? landmarkerResult.faceLandmarks[0]
      : null;
    if (!landmarks || !landmarks.length) return { result: { face: [] }, face: null };
    const bbox = boxFromLandmarks(landmarks, video.videoWidth || 0, video.videoHeight || 0);
    if (!bbox) return { result: { face: [] }, face: null };
    const crop = captureFaceCrop(video, bbox);
    if (!crop) return { result: { face: [] }, face: null };
    const embedResult = mpImageEmbedder.embedForVideo(crop, ts);
    const embedding = extractEmbedding(embedResult);
    const blendshapes = landmarkerResult && landmarkerResult.faceBlendshapes && landmarkerResult.faceBlendshapes[0]
      ? landmarkerResult.faceBlendshapes[0].categories
      : [];
    const emotion = blendshapeToEmotion(blendshapes);
    const face = { embedding, box: bbox, emotion };
    return { result: { face: [face] }, face };
  } catch (err) {
    return { result: null, face: null };
  } finally {
    window.__visBackendDetectBusy = false;
  }
}
