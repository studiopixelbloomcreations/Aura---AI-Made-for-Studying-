(function (global) {
  "use strict";

  const KEY = "aevra_voice_session";
  const EIGHT_HOURS = 8 * 60 * 60 * 1000;
  const REVERIFY_MS = 30 * 60 * 1000;

  function now() { return Date.now(); }

  function getSession() {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (!raw) return null;
      const session = JSON.parse(raw);
      if (!session || isExpired(session)) {
        clearSession();
        return null;
      }
      return session;
    } catch (error) {
      clearSession();
      return null;
    }
  }

  function setSession(profile) {
    const started = now();
    const session = {
      userId: profile.userId || profile.user_id || profile.id,
      displayName: profile.displayName || profile.display_name || profile.name || "Student",
      voiceConfidence: Number(profile.voiceConfidence || profile.confidence || 0),
      sessionStart: started,
      lastActiveAt: started,
      expiresAt: started + EIGHT_HOURS,
    };
    sessionStorage.setItem(KEY, JSON.stringify(session));
    return session;
  }

  function clearSession() {
    sessionStorage.removeItem(KEY);
  }

  function isExpired(session) {
    const s = session || getSession();
    return !s || Number(s.expiresAt || 0) <= now() || (now() - Number(s.lastActiveAt || 0)) > EIGHT_HOURS;
  }

  function touch() {
    const session = getSession();
    if (!session) return null;
    session.lastActiveAt = now();
    session.expiresAt = now() + EIGHT_HOURS;
    sessionStorage.setItem(KEY, JSON.stringify(session));
    return session;
  }

  global.AuraSessionManager = { getSession, setSession, clearSession, isExpired, touch, REVERIFY_MS };
})(window);
