// VIS AI Router
(function () {
  const VIS = (window.VIS = window.VIS || {});
  function hooks() { return window.PI_VIS_HOOKS || {}; }

  VIS.aiRouter = {
    load(profile) {
      const h = hooks();
      if (h.loadProfile) h.loadProfile(profile);
      if (h.applyPersonalization) h.applyPersonalization(profile.personalization_profile || {});
      if (h.restoreSession) h.restoreSession(profile.session_state || {});
      if (h.activateAI) h.activateAI(profile);
    },
    pause() {
      const h = hooks();
      if (h.pauseAI) h.pauseAI();
      if (h.setOfflineUI) h.setOfflineUI(true);
    },
    resume(profile) {
      const h = hooks();
      if (h.setOfflineUI) h.setOfflineUI(false);
      if (profile) this.load(profile);
    }
  };
})();
