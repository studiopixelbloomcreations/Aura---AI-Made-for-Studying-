(function (global) {
  "use strict";

  class AuraVAISController extends EventTarget {
    constructor() {
      super();
      this.identity = new global.AuraIdentityEngine();
      this.ai = new global.AuraAIRouter.AuraAIRouter();
    }

    async init() {
      try {
        this.identity.onUserIdentified(async (profile) => {
          await this.ai.initialize(profile);
          this.dispatchEvent(new CustomEvent("user-identified", { detail: profile }));
        });
        this.identity.onboardingRequired((detail) => this.dispatchEvent(new CustomEvent("onboarding-required", { detail })));
        await this.identity.initialize();
      } catch (error) {
        this.dispatchEvent(new CustomEvent("error", { detail: friendly(error) }));
      }
    }

    async handleVoiceInput(audioBlob) {
      try {
        return await this.identity.identifyFromAudio(audioBlob);
      } catch (error) {
        this.dispatchEvent(new CustomEvent("error", { detail: friendly(error) }));
        return null;
      }
    }

    async handleUserMessage(text, sessionId) {
      try {
        const response = await this.ai.sendMessage(text, sessionId);
        this.dispatchEvent(new CustomEvent("ai-response", { detail: { response, sessionId } }));
        return response;
      } catch (error) {
        this.dispatchEvent(new CustomEvent("error", { detail: friendly(error) }));
        throw error;
      }
    }
  }

  function friendly(error) {
    return String(error && error.message ? error.message : "Aura hit a temporary problem. Please try again.");
  }

  global.AuraVAISController = AuraVAISController;
})(window);
