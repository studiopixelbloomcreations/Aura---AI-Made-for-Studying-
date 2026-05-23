(function (global) {
  "use strict";

  class AuraIdentityEngine {
    constructor() {
      this.identifiedCallbacks = [];
      this.onboardingCallbacks = [];
      this.matchEngine = new global.AuraVoiceMatchEngine();
    }

    onUserIdentified(callback) { if (typeof callback === "function") this.identifiedCallbacks.push(callback); }
    onboardingRequired(callback) { if (typeof callback === "function") this.onboardingCallbacks.push(callback); }

    async initialize() {
      const session = global.AuraSessionManager && global.AuraSessionManager.getSession();
      if (session) {
        this._identified(session);
        return session;
      }
      return null;
    }

    async identifyFromAudio(audioBlob) {
      const data = await global.AuraVoiceEmbeddingEngine.recognizeAudioBlob(audioBlob);
      if (data.matched && data.userId) {
        const profile = { userId: data.userId, displayName: data.displayName || "Student", voiceConfidence: data.confidence };
        global.AuraSessionManager.setSession(profile);
        if (global.AuraState) global.AuraState.setCurrentUser(profile);
        this._identified(profile);
        return profile;
      }
      if (Number(data.confidence || 0) >= 0.70) throw new Error("Voice match was close. Please repeat the phrase.");
      this.onboardingCallbacks.forEach((callback) => callback(data));
      return null;
    }

    _identified(profile) { this.identifiedCallbacks.forEach((callback) => callback(profile)); }
  }

  global.AuraIdentityEngine = AuraIdentityEngine;
})(window);
