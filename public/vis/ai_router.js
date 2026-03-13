function hooks() { return window.PI_VIS_HOOKS || {}; }

export function loadAI(profile) {
  const h = hooks();
  if (h.loadProfile) h.loadProfile(profile);
  if (h.applyPersonalization) h.applyPersonalization(profile.personalization_profile || {});
  if (h.restoreSession) h.restoreSession(profile.session_state || {});
  if (h.activateAI) h.activateAI(profile);
}

export function pauseAI() {
  const h = hooks();
  if (h.pauseAI) h.pauseAI();
  if (h.setOfflineUI) h.setOfflineUI(true);
}

export function resumeAI(profile) {
  const h = hooks();
  if (h.setOfflineUI) h.setOfflineUI(false);
  if (profile) loadAI(profile);
}
