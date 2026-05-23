import { useAppStore } from '../store/useAppStore';

// Auto-resolve backend domain based on localhost vs tunnel
export const API_BASE_URL = 
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://127.0.0.1:8000'
    : 'https://c5896366d1ebad.lhr.life';

export async function askBackend(message: string, history: any[] = []) {
  try {
    const store = useAppStore.getState();
    
    // Task 5: Dynamic typing speed calculation based on input length
    const words = message.trim().split(/\s+/).length;
    const typingSpeedEstimate = Math.min(100, Math.max(35, Math.round(words * 2.5))); // Realistic dynamic WPM

    const reqBody = {
      message: message,
      student_question: message, // fallback for legacy /ask
      title: 'Aura AI',
      history: history,
      email: 'guest@student.com',
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

    const res = await fetch(`${API_BASE_URL}/personal-intelligence/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody)
    });

    if (!res.ok) {
      // fallback to standard ask
      const fallbackRes = await fetch(`${API_BASE_URL}/ask`, {
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
