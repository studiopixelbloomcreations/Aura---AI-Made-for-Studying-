(function (global) {
  "use strict";

  const TRAINING_PHRASES = [
    "Hey Aevra, help me study",
    "I need help with mathematics",
    "Explain photosynthesis to me",
    "What is the quadratic formula",
    "Can you quiz me on history",
    "I want to prepare for my exam",
    "Show me my progress today",
    "Help me understand Newton's laws",
    "I am ready to learn something new",
    "Aevra, let's start a study session",
  ];

  class AevraOnboardingEngine {
    constructor() {
      this.index = 0;
      this.cancelled = false;
      this.samples = [];
      this.userId = crypto.randomUUID();
    }

    getProgress() {
      return { index: this.index, total: TRAINING_PHRASES.length, phrase: TRAINING_PHRASES[this.index], percent: Math.round((this.index / TRAINING_PHRASES.length) * 100) };
    }

    cancelOnboarding() { this.cancelled = true; }

    validateAudio(blob) {
      if (!blob || blob.size < 2500) return "Recording is too short or quiet. Please try that phrase again.";
      return "";
    }

    async capturePhrase(blob) {
      const qualityError = this.validateAudio(blob);
      if (qualityError) throw new Error(qualityError);
      this.samples.push(blob);
      this.index += 1;
      return this.getProgress();
    }

    async startOnboarding(profile) {
      this.cancelled = false;
      this.profile = profile || {};
      return this.getProgress();
    }

    async finish() {
      if (this.samples.length !== TRAINING_PHRASES.length) throw new Error("Voice enrollment needs all training phrases.");
      const combined = new Blob(this.samples, { type: "audio/webm" });
      const audio = await blobToBase64(combined);
      const res = await fetch("/voice/enroll", {
        method: "POST",
        headers: { "content-type": "application/json", "x-aevra-csrf": sessionStorage.getItem("aevra_csrf") || "browser" },
        body: JSON.stringify({ userId: this.userId, profile: this.profile, audio }),
      });
      if (!res.ok) throw new Error("Voice enrollment could not be saved.");
      return res.json();
    }
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || "").split(",", 2)[1] || "");
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  global.AevraOnboardingEngine = { AevraOnboardingEngine, TRAINING_PHRASES };
})(window);
