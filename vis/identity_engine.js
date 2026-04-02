const DETECT_FACE_ENDPOINT = '/detect-face';
const RECOGNIZE_USER_ENDPOINT = '/recognize-user';
const REGISTER_USER_ENDPOINT = '/register-user';
const ANALYZE_EMOTION_ENDPOINT = '/analyze-emotion';
const USER_PROFILE_ENDPOINT = '/user-profile';

function endpoint(key, fallback) {
  const direct = window[key];
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  if (window.Api && typeof window.Api.getBaseUrl === 'function') {
    return window.Api.getBaseUrl() + fallback;
  }
  return fallback;
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload || {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(String(data.error || `HTTP_${response.status}`));
    error.status = response.status;
    error.payload = data;
    throw error;
  }
  return data;
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

export async function processFaceFrame(image) {
  if (!image) {
    return {
      faceDetected: false,
      faceToken: '',
      confidence: 0,
      similarity: 0,
      emotion: 'neutral',
      user_id: null
    };
  }
  const detect = await postJson(endpoint('__VIS_DETECT_FACE_URL', DETECT_FACE_ENDPOINT), { image });
  if (!detect.face_detected) {
    return {
      faceDetected: false,
      faceToken: '',
      confidence: 0,
      similarity: 0,
      emotion: 'neutral',
      user_id: null
    };
  }
  const recognize = await postJson(endpoint('__VIS_RECOGNIZE_USER_URL', RECOGNIZE_USER_ENDPOINT), { image });
  const emotion = await postJson(endpoint('__VIS_ANALYZE_EMOTION_URL', ANALYZE_EMOTION_ENDPOINT), { image });
  return {
    faceDetected: !!detect.face_detected,
    faceToken: '',
    confidence: Number(recognize.confidence || 0),
    similarity: Number(recognize.similarity || 0),
    emotion: emotion.emotion || 'neutral',
    user_id: recognize.user_id || null,
    liveness_passed: !!recognize.liveness_passed
  };
}

export async function loadProfileByUserId(userId) {
  if (!userId) return null;
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
  if (!userId) throw new Error('user_id is required');
  if (!Array.isArray(images) || !images.length) throw new Error('images are required');
  return postJson(endpoint('__VIS_REGISTER_USER_URL', REGISTER_USER_ENDPOINT), {
    username: userId,
    images,
    personalization_profile: profileData.personalization_profile || {},
    ai_config: profileData.ai_config || {},
    memory: profileData.memory || {}
  });
}
