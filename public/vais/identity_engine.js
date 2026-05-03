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

    async identifyFromAudio(audioBuffer) {
      const embedding = await global.AevraVoiceEmbeddingEngine.generateEmbedding(audioBuffer);
      const response = await fetch("/voice/recognize", {
        method: "POST",
        headers: { "content-type": "application/json", "x-aevra-csrf": sessionStorage.getItem("aevra_csrf") || "browser" },
        body: JSON.stringify({ embedding: Array.from(embedding) }),
      });
      const data = await response.json();
      if (data.matched && data.userId) {
        const profile = { userId: data.userId, displayName: data.displayName || "Student", voiceConfidence: data.confidence };
        global.AevraSessionManager.setSession(profile);
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
