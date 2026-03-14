const ENC_STORAGE_KEY = 'vis_profiles_local_enc';
const LEGACY_STORAGE_KEY = 'vis_profiles_local';
let cachedKeyPromise = null;

function getSeed() {
  return window.__VIS_PROFILE_KEY_SEED || (location.origin + '|' + navigator.userAgent);
}

function bytesToBase64(bytes) {
  let binary = '';
  const len = bytes.length || 0;
  for (let i = 0; i < len; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value || '');
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

async function getCryptoKey() {
  if (!window.crypto || !window.crypto.subtle) return null;
  if (cachedKeyPromise) return cachedKeyPromise;
  cachedKeyPromise = (async function () {
    const saltKey = 'vis_profiles_salt';
    let salt = localStorage.getItem(saltKey);
    if (!salt) {
      const saltBytes = window.crypto.getRandomValues(new Uint8Array(16));
      salt = bytesToBase64(saltBytes);
      localStorage.setItem(saltKey, salt);
    }
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
      'raw',
      enc.encode(getSeed()),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );
    return window.crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: base64ToBytes(salt), iterations: 100000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  })();
  return cachedKeyPromise;
}

async function encryptProfiles(profiles) {
  const key = await getCryptoKey();
  if (!key) return null;
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const payload = enc.encode(JSON.stringify(profiles || []));
  const cipher = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, payload);
  return { v: 1, iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(cipher)) };
}

async function decryptProfiles(payload) {
  const key = await getCryptoKey();
  if (!key || !payload || !payload.iv || !payload.data) return null;
  try {
    const iv = base64ToBytes(payload.iv);
    const data = base64ToBytes(payload.data);
    const plain = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    const dec = new TextDecoder();
    const parsed = JSON.parse(dec.decode(plain));
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return null;
  }
}

async function readLocalProfiles() {
  const encRaw = localStorage.getItem(ENC_STORAGE_KEY);
  if (encRaw) {
    try {
      const payload = JSON.parse(encRaw);
      const decrypted = await decryptProfiles(payload);
      if (Array.isArray(decrypted)) return decrypted;
    } catch (e) {}
  }
  const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || '[]');
  return Array.isArray(legacy) ? legacy : [];
}

async function writeLocalProfiles(profiles) {
  const payload = await encryptProfiles(profiles);
  if (payload) {
    localStorage.setItem(ENC_STORAGE_KEY, JSON.stringify(payload));
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return true;
  }
  localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(profiles || []));
  return false;
}

export async function loadProfiles() {
  const profiles = [];
  try {
    const res = await fetch('/vis_profiles/index.json', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) profiles.push(...data);
      if (data && Array.isArray(data.profiles)) profiles.push(...data.profiles);
    }
  } catch {}
  const local = await readLocalProfiles();
  profiles.push(...local);
  return profiles.map((p) => ({
    user_id: p.user_identity?.username || p.username || p.user_id,
    embedding: p.facial_signature?.feature_vector || p.embedding || [],
    profile: p
  }));
}

export async function saveProfile(profile) {
  const local = await readLocalProfiles();
  local.push(profile);
  await writeLocalProfiles(local);
}

function cosineSimilarity(a, b) {
  const x = Array.isArray(a) ? a : [];
  const y = Array.isArray(b) ? b : [];
  const n = Math.min(x.length, y.length);
  if (!n) return 0;
  let dot = 0;
  let ax = 0;
  let by = 0;
  for (let i = 0; i < n; i += 1) {
    const xv = Number(x[i] || 0);
    const yv = Number(y[i] || 0);
    dot += xv * yv;
    ax += xv * xv;
    by += yv * yv;
  }
  if (ax <= 0 || by <= 0) return 0;
  return dot / (Math.sqrt(ax) * Math.sqrt(by));
}

export function matchIdentity(embedding, profiles, threshold = 0.88) {
  const rows = Array.isArray(profiles) ? profiles : [];
  const input = Array.isArray(embedding) ? embedding : [];
  if (!rows.length || !input.length) return null;
  let best = null;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const score = cosineSimilarity(input, row.embedding);
    if (!best || score > best.score) {
      best = {
        user_id: row.user_id,
        profile: row.profile,
        score: score
      };
    }
  }
  if (!best || best.score < Number(threshold || 0)) return null;
  return best;
}
