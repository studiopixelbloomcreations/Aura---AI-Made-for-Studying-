const USER_PROFILE_ENDPOINT = '/user-profile';
const FACE_API_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js';
const FACE_API_MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';
const FACE_API_MIN_CONFIDENCE = 0.5;
const FACE_API_MATCH_DISTANCE = 0.58;

let faceApiReadyPromise = null;
let livenessSamples = [];
let faceMatcherCache = null;
let faceMatcherSignature = '';
let faceMatcherLabelMap = {};

function ensureHooks() {
  return window.PI_VIS_HOOKS || {};
}

function endpoint(key, fallback) {
  const direct = window[key];
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  if (window.Api && typeof window.Api.getBaseUrl === 'function') {
    return window.Api.getBaseUrl() + fallback;
  }
  return fallback;
}

function loadScriptOnce(src, id) {
  const existing = id ? document.getElementById(id) : null;
  if (existing) {
    if (existing.getAttribute('data-loaded') === 'true') return Promise.resolve(true);
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(true), { once: true });
      existing.addEventListener('error', () => reject(new Error('SCRIPT_LOAD_FAILED')), { once: true });
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    if (id) script.id = id;
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      script.setAttribute('data-loaded', 'true');
      resolve(true);
    };
    script.onerror = () => reject(new Error('SCRIPT_LOAD_FAILED'));
    document.head.appendChild(script);
  });
}

async function ensureFaceApiReady() {
  if (window.faceapi && faceApiReadyPromise) return faceApiReadyPromise;
  if (faceApiReadyPromise) return faceApiReadyPromise;
  faceApiReadyPromise = (async () => {
    await loadScriptOnce(FACE_API_SCRIPT_URL, 'visFaceApiScript');
    if (!window.faceapi) throw new Error('face-api.js unavailable');
    await Promise.all([
      window.faceapi.nets.ssdMobilenetv1.loadFromUri(FACE_API_MODEL_URL),
      window.faceapi.nets.faceLandmark68Net.loadFromUri(FACE_API_MODEL_URL),
      window.faceapi.nets.faceRecognitionNet.loadFromUri(FACE_API_MODEL_URL),
      window.faceapi.nets.faceExpressionNet.loadFromUri(FACE_API_MODEL_URL),
    ]);
    return true;
  })().catch((error) => {
    faceApiReadyPromise = null;
    throw error;
  });
  return faceApiReadyPromise;
}

function normalizeProfile(payload, userId) {
  if (!payload || typeof payload !== 'object') {
    return {
      user_id: userId || null,
      personalization_profile: {},
      session_state: {}
    };
  }
  return {
    user_id: payload.user_id || userId || null,
    ...payload,
    personalization_profile: payload.personalization_profile || {},
    session_state: payload.session_state || {}
  };
}

function averagePoint(points, name) {
  const list = Array.isArray(points) ? points : [];
  if (!list.length) return null;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < list.length; i += 1) {
    sx += Number(list[i].x || 0);
    sy += Number(list[i].y || 0);
  }
  return { name, x: sx / list.length, y: sy / list.length };
}

function toNormalizedLandmarks(landmarks, vw, vh) {
  if (!landmarks || !vw || !vh) return [];
  const out = [];
  const positions = Array.isArray(landmarks.positions) ? landmarks.positions : [];
  for (let i = 0; i < positions.length; i += 1) {
    const pt = positions[i];
    out.push({ name: 'p' + i, x: Number(pt.x || 0) / vw, y: Number(pt.y || 0) / vh });
  }
  const leftEye = averagePoint(typeof landmarks.getLeftEye === 'function' ? landmarks.getLeftEye() : [], 'left_eye');
  const rightEye = averagePoint(typeof landmarks.getRightEye === 'function' ? landmarks.getRightEye() : [], 'right_eye');
  const nosePts = typeof landmarks.getNose === 'function' ? landmarks.getNose() : [];
  const nose = averagePoint(nosePts.slice(Math.max(0, nosePts.length - 3)), 'nose');
  const mouth = typeof landmarks.getMouth === 'function' ? landmarks.getMouth() : [];
  const mouthLeft = mouth.length ? { name: 'mouth_left', x: Number(mouth[0].x || 0) / vw, y: Number(mouth[0].y || 0) / vh } : null;
  const mouthRight = mouth.length ? { name: 'mouth_right', x: Number((mouth[6] && mouth[6].x) || 0) / vw, y: Number((mouth[6] && mouth[6].y) || 0) / vh } : null;
  [leftEye, rightEye, nose, mouthLeft, mouthRight].forEach((pt) => {
    if (!pt) return;
    if (pt.name === 'left_eye' || pt.name === 'right_eye' || pt.name === 'nose') {
      pt.x = Number(pt.x || 0) / vw;
      pt.y = Number(pt.y || 0) / vh;
    }
    out.push(pt);
  });
  return out;
}

function estimatePoseHint(box, landmarks) {
  const lookup = {};
  const list = Array.isArray(landmarks) ? landmarks : [];
  for (let i = 0; i < list.length; i += 1) {
    const pt = list[i];
    const name = String(pt && pt.name || '');
    if (name && !(name in lookup)) lookup[name] = pt;
  }
  const leftEye = lookup.left_eye;
  const rightEye = lookup.right_eye;
  const nose = lookup.nose;
  if (leftEye && rightEye && nose) {
    const eyeMidX = (Number(leftEye.x || 0) + Number(rightEye.x || 0)) / 2;
    const noseDx = Number(nose.x || 0) - eyeMidX;
    if (noseDx <= -0.03) return 'left';
    if (noseDx >= 0.03) return 'right';
  }
  const x = Number(box && box.x || 0);
  const y = Number(box && box.y || 0);
  const w = Number(box && box.width || 0);
  const h = Number(box && box.height || 0);
  const cx = x + (w / 2);
  const cy = y + (h / 2);
  const area = w * h;
  if (area >= 0.2) return 'close';
  if (cx < 0.38) return 'left';
  if (cx > 0.62) return 'right';
  if (cy < 0.38) return 'up';
  if (cy > 0.62) return 'down';
  return 'center';
}

function topExpression(expressions) {
  if (!expressions || typeof expressions !== 'object') return 'neutral';
  let bestLabel = 'neutral';
  let bestScore = -1;
  Object.keys(expressions).forEach((key) => {
    const score = Number(expressions[key]);
    if (Number.isFinite(score) && score > bestScore) {
      bestScore = score;
      bestLabel = key;
    }
  });
  return String(bestLabel || 'neutral').toLowerCase();
}

function descriptorDistance(a, b) {
  const x = Array.isArray(a) ? a : [];
  const y = Array.isArray(b) ? b : [];
  const n = Math.min(x.length, y.length);
  if (!n) return Infinity;
  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    const d = Number(x[i] || 0) - Number(y[i] || 0);
    sum += d * d;
  }
  return Math.sqrt(sum);
}

function livenessSignature(face) {
  const landmarks = Array.isArray(face.landmarks) ? face.landmarks : [];
  const nose = landmarks.find((pt) => String(pt && pt.name || '') === 'nose') || landmarks[0] || null;
  const box = face.box || null;
  if (!nose || !box) return '';
  return [
    Math.round(Number(nose.x || 0) * 1000),
    Math.round(Number(nose.y || 0) * 1000),
    Math.round(Number(box.x || 0) * 1000),
    Math.round(Number(box.y || 0) * 1000),
    Math.round(Number(box.width || 0) * 1000),
    Math.round(Number(box.height || 0) * 1000),
  ].join(':');
}

function updateLiveness(face) {
  const signature = livenessSignature(face);
  if (!signature) {
    livenessSamples = [];
    return false;
  }
  livenessSamples.push(signature);
  if (livenessSamples.length > 6) livenessSamples = livenessSamples.slice(-6);
  return livenessSamples.length >= 3 && new Set(livenessSamples).size >= 2;
}

function getFaceIndex() {
  const hooks = ensureHooks();
  if (typeof hooks.getRecognitionIndex === 'function') {
    const index = hooks.getRecognitionIndex();
    if (Array.isArray(index)) return index;
  }
  return Array.isArray(window.__PI_VIS_FACE_INDEX__) ? window.__PI_VIS_FACE_INDEX__ : [];
}

function getFaceMatcher() {
  if (!window.faceapi) return null;
  const index = getFaceIndex().filter((row) => !!(row && Array.isArray(row.vector) && row.vector.length && String(row.vector_model || '').toLowerCase() === 'faceapi'));
  const signature = index.map((row) => [
    String(row.profileFile || ''),
    String(row.username || ''),
    String(row.vector_model || ''),
    String(Array.isArray(row.vector) ? row.vector.length : 0),
    String(Number(row.vector && row.vector.length ? row.vector[0] : 0).toFixed(6)),
  ].join(':')).join('|');
  if (signature && signature === faceMatcherSignature && faceMatcherCache) return faceMatcherCache;
  faceMatcherCache = null;
  faceMatcherSignature = signature;
  faceMatcherLabelMap = {};
  if (!index.length) return null;
  const grouped = {};
  index.forEach((row) => {
    const label = String(row.profileFile || row.username || '').trim();
    if (!label) return;
    if (!grouped[label]) grouped[label] = { descriptors: [], row };
    grouped[label].descriptors.push(new Float32Array(row.vector));
  });
  const labels = Object.keys(grouped).filter((label) => grouped[label] && grouped[label].descriptors.length);
  if (!labels.length) return null;
  const labeledDescriptors = labels.map((label) => {
    faceMatcherLabelMap[label] = grouped[label].row;
    return new window.faceapi.LabeledFaceDescriptors(label, grouped[label].descriptors);
  });
  faceMatcherCache = new window.faceapi.FaceMatcher(labeledDescriptors, FACE_API_MATCH_DISTANCE);
  return faceMatcherCache;
}

function findDescriptorMatch(descriptor) {
  const input = Array.isArray(descriptor) ? descriptor : [];
  if (!input.length) return null;
  const matcher = getFaceMatcher();
  if (!matcher) return null;
  const best = matcher.findBestMatch(new Float32Array(input));
  const label = String(best && best.label || '');
  if (!label || label === 'unknown') return null;
  const row = faceMatcherLabelMap[label] || null;
  if (!row) return null;
  const distance = Number(best && best.distance || 1);
  return {
    user_id: row.username || row.user_id || row.profileFile || null,
    confidence: Math.max(0, Math.round((1 - Math.min(1, distance)) * 100)),
    similarity: Math.max(0, Math.round((1 - Math.min(1, distance)) * 100)),
    distance,
  };
}

async function imageElementFromDataUrl(image) {
  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('IMAGE_LOAD_FAILED'));
    img.src = image;
  });
}

export async function processFaceFrame(image) {
  if (!image) {
    return {
      faceDetected: false,
      faceToken: '',
      confidence: 0,
      similarity: 0,
      emotion: 'neutral',
      user_id: null,
      faces: [],
      liveness_passed: false
    };
  }
  await ensureFaceApiReady();
  const faceapi = window.faceapi;
  const img = await imageElementFromDataUrl(image);
  const detections = await faceapi
    .detectAllFaces(
      img,
      new faceapi.SsdMobilenetv1Options({
        minConfidence: FACE_API_MIN_CONFIDENCE,
      })
    )
    .withFaceLandmarks()
    .withFaceExpressions()
    .withFaceDescriptors();
  const vw = Number(img.naturalWidth || img.width || 0);
  const vh = Number(img.naturalHeight || img.height || 0);
  const faces = (Array.isArray(detections) ? detections : []).map((item) => {
    const box = item && item.detection && item.detection.box ? item.detection.box : null;
    const normalizedBox = box ? {
      x: Number(box.x || 0) / Math.max(1, vw),
      y: Number(box.y || 0) / Math.max(1, vh),
      width: Number(box.width || 0) / Math.max(1, vw),
      height: Number(box.height || 0) / Math.max(1, vh),
    } : null;
    const landmarks = toNormalizedLandmarks(item && item.landmarks, vw, vh);
    return {
      confidence: Number(item && item.detection && item.detection.score || 0),
      box: normalizedBox,
      landmarks,
      pose_hint: normalizedBox ? estimatePoseHint(normalizedBox, landmarks) : '',
      descriptor: Array.from((item && item.descriptor) || []),
      expressions: item && item.expressions ? item.expressions : {},
    };
  }).filter((face) => !!(face && face.box && face.box.width > 0 && face.box.height > 0));

  if (!faces.length) {
    livenessSamples = [];
    return {
      faceDetected: false,
      faceToken: '',
      confidence: 0,
      similarity: 0,
      emotion: 'neutral',
      user_id: null,
      faces: [],
      liveness_passed: false
    };
  }

  const primary = faces[0];
  const match = findDescriptorMatch(primary.descriptor);
  const emotion = topExpression(primary.expressions);

  return {
    faceDetected: true,
    faceToken: '',
    confidence: match ? Number(match.confidence || 0) : Number(primary.confidence || 0),
    similarity: match ? Number(match.similarity || 0) : 0,
    emotion,
    user_id: match && match.user_id ? String(match.user_id) : null,
    liveness_passed: updateLiveness(primary),
    faces,
  };
}

export async function loadProfileByUserId(userId) {
  if (!userId) return null;
  const hooks = ensureHooks();
  if (typeof hooks.loadProfileByUserId === 'function') {
    const profile = await hooks.loadProfileByUserId(userId);
    if (profile) return normalizeProfile(profile, userId);
  }
  const response = await fetch(`${endpoint('__VIS_USER_PROFILE_URL', USER_PROFILE_ENDPOINT)}/${encodeURIComponent(userId)}`);
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(String(result.detail || result.error || `HTTP_${response.status}`));
    error.status = response.status;
    throw error;
  }
  return normalizeProfile({
    user_id: result.username || userId,
    personalization_profile: result.personalization_profile || {},
    ai_config: result.ai_config || {},
    memory: result.memory || {},
    face_folder_path: result.face_folder_path || ''
  }, userId);
}

export async function registerFaceFrames(userId, images, profileData = {}) {
  const hooks = ensureHooks();
  if (typeof hooks.registerFaceFrames === 'function') {
    return await hooks.registerFaceFrames(userId, images, profileData);
  }
  return {
    ok: false,
    error: 'FACE_API_REGISTRATION_REQUIRES_MANAGED_FLOW',
    registered_faces: 0,
  };
}
