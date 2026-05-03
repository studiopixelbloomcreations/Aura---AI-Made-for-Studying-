(function (global) {
  "use strict";

  class AevraIdentityEngine {
    constructor() {
      this.identifiedCallbacks = [];
      this.onboardingCallbacks = [];
      this.matchEngine = new global.AevraVoiceMatchEngine();
    }

    onUserIdentified(callback) { if (typeof callback === "function") this.identifiedCallbacks.push(callback); }
    onboardingRequired(callback) { if (typeof callback === "function") this.onboardingCallbacks.push(callback); }

    async initialize() {
      const session = global.AevraSessionManager && global.AevraSessionManager.getSession();
      if (session) {
        this._identified(session);
        return session;
      }
      return null;
    }

    async identifyFromAudio(audioBlob) {
      const data = await global.AevraVoiceEmbeddingEngine.recognizeAudioBlob(audioBlob);
      if (data.matched && data.userId) {
        const profile = { userId: data.userId, displayName: data.displayName || "Student", voiceConfidence: data.confidence };
        global.AevraSessionManager.setSession(profile);
        if (global.AevraState) global.AevraState.setCurrentUser(profile);
        this._identified(profile);
        return profile;
      }
      if (Number(data.confidence || 0) >= 0.70) throw new Error("Voice match was close. Please repeat the phrase.");
      this.onboardingCallbacks.forEach((callback) => callback(data));
      return null;
    }

    _identified(profile) { this.identifiedCallbacks.forEach((callback) => callback(profile)); }
  }

  global.AevraIdentityEngine = AevraIdentityEngine;
})(window);
