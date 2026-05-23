import { useAppStore } from '../store/useAppStore';

// Local development talks to the FastAPI server. Production talks to same-origin
// Netlify functions so deploys do not depend on temporary tunnels.
export const API_BASE_URL =
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://127.0.0.1:8000'
    : '';

export type AuraIdentity = {
  user_id: string;
  email: string;
  name: string;
  avatar: string;
  guest?: boolean;
};

export function getAuraIdentity(): AuraIdentity {
  const authUser = (window as any).Auth && typeof (window as any).Auth.getUser === "function"
    ? (window as any).Auth.getUser()
    : null;
  let stored: any = null;
  try {
    stored = JSON.parse(localStorage.getItem("aura_identity") || "null");
  } catch {
    stored = null;
  }
  const email = String(authUser?.email || stored?.email || localStorage.getItem("aura_email") || "").trim();
  const name = String(authUser?.name || authUser?.displayName || stored?.name || localStorage.getItem("aura_name") || "Student").trim();
  const userId = String(authUser?.uid || authUser?.user_id || stored?.user_id || email || "").trim();
  return {
    user_id: userId || "guest@student.com",
    email,
    name,
    avatar: String(authUser?.photoURL || authUser?.avatar || stored?.avatar || "").trim(),
    guest: !authUser && !stored,
  };
}

function endpoint(path: string) {
  return `${API_BASE_URL}${path}`;
}

async function postJson(path: string, body: unknown) {
  const res = await fetch(endpoint(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
}

export async function getPersonalIntelligenceProfile() {
  const identity = getAuraIdentity();
  const res = await fetch(endpoint(`/personal-intelligence/config?user_id=${encodeURIComponent(identity.user_id)}`), {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok && data?.profile) return data.profile;
  return null;
}

export async function ensurePersonalIntelligenceProfile(answers: Record<string, unknown> = {}) {
  const identity = getAuraIdentity();
  const existing = await getPersonalIntelligenceProfile().catch(() => null);
  if (existing?.unique_id || existing?.unique_identifier) return existing;

  const data = await postJson("/personal-intelligence/config", {
    identity,
    user: identity,
    user_id: identity.user_id,
    email: identity.email,
    name: identity.name,
    answers,
    personalization_answers: answers,
  });
  return data.profile || data.data?.profile || null;
}

export async function createRealtimeSession() {
  const identity = getAuraIdentity();
  return postJson("/personal-intelligence/realtime/session", { identity, user_id: identity.user_id, email: identity.email });
}

export async function askBackend(message: string, history: any[] = []) {
  try {
    const store = useAppStore.getState();
    const identity = getAuraIdentity();
    const profile = await ensurePersonalIntelligenceProfile({
      teachingStyle: store.teachingStyle,
      responseLength: store.responseLength,
      difficultyLevel: store.difficultyLevel,
      toneAdjustment: store.toneAdjustment,
      memoryPreference: store.memoryPreference,
      learningSpeed: store.learningSpeed,
      subject: store.subject,
      language: store.language,
      hobbies: store.intelligenceProfile.hobbies,
      weakSubjects: store.intelligenceProfile.weakSubjects,
      targetGrade: store.intelligenceProfile.targetGrade,
      vocalStyle: store.intelligenceProfile.vocalStyle,
    }).catch(() => null);
    
    // Task 5: Dynamic typing speed calculation based on input length
    const words = message.trim().split(/\s+/).length;
    const typingSpeedEstimate = Math.min(100, Math.max(35, Math.round(words * 2.5))); // Realistic dynamic WPM

    const reqBody = {
      message: message,
      student_question: message, // fallback for legacy /ask
      title: 'Aura AI',
      history: history,
      identity,
      user: identity,
      user_id: identity.user_id,
      email: identity.email,
      name: identity.name,
      profile,
      unique_id: profile?.unique_id || profile?.unique_identifier || "",
      subject: store.subject,
      language: store.language,
      // Task 5: Live Context Sync
      context: {
        activeTab: store.activeTab,
        subject: store.subject,
        language: store.language,
        elapsedTime: `${Math.round(performance.now() / 1000)}s`,
        theme: store.theme,
        teachingStyle: store.teachingStyle,
        responseLength: store.responseLength,
        difficultyLevel: store.difficultyLevel,
        toneAdjustment: store.toneAdjustment,
        memoryPreference: store.memoryPreference,
        learningSpeed: store.learningSpeed,
        typingSpeed: `${typingSpeedEstimate} WPM`
      }
    };

    const res = await fetch(endpoint("/personal-intelligence/ask"), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody)
    });

    if (!res.ok) {
      // fallback to standard ask
      const fallbackRes = await fetch(endpoint("/ask"), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody)
      });
      if (!fallbackRes.ok) throw new Error('API request failed');
      const data = await fallbackRes.json();
      return data.answer || "No response received";
    }

    const data = await res.json();
    
    // Task 7: Neural Command System Action Executor
    if (data && data.action) {
      const action = data.action;
      if (action.type === 'navigate_tab' && action.tab) {
        store.setActiveTab(action.tab);
      } else if (action.type === 'directions_home' && action.maps_url) {
        window.open(action.maps_url, '_blank');
      } else if (action.type === 'connect_spotify' && action.oauth_url) {
        window.open(action.oauth_url, '_blank');
      }
    }

    return data.answer || "No response received";
  } catch (error) {
    console.error("Backend fetch error:", error);
    return "Sorry, I am having trouble connecting to the backend.";
  }
}
