(function (global) {
  "use strict";

  class AevraVAISController extends EventTarget {
    constructor() {
      super();
      this.identity = new global.AevraIdentityEngine();
      this.ai = new global.AevraAIRouter.AevraAIRouter();
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

    async handleVoiceInput(audioBuffer) {
      try {
        return await this.identity.identifyFromAudio(audioBuffer);
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
    return String(error && error.message ? error.message : "Aevra hit a temporary problem. Please try again.");
  }

  global.AevraVAISController = AevraVAISController;
})(window);
