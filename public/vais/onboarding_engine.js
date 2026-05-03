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
      this.embeddings = [];
      this.userId = crypto.randomUUID();
    }

    getProgress() {
      return { index: this.index, total: TRAINING_PHRASES.length, phrase: TRAINING_PHRASES[this.index], percent: Math.round((this.index / TRAINING_PHRASES.length) * 100) };
    }

    cancelOnboarding() { this.cancelled = true; }

    validateAudio(buffer) {
      if (!buffer || buffer.length < 8000) return "Recording is too short. Please try that phrase again.";
      let sum = 0;
      for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
      if (Math.sqrt(sum / buffer.length) < 0.01) return "That was too quiet. Please speak a little closer to the microphone.";
      return "";
    }

    async capturePhrase(buffer) {
      const qualityError = this.validateAudio(buffer);
      if (qualityError) throw new Error(qualityError);
      const embedding = await global.AevraVoiceEmbeddingEngine.generateEmbedding(buffer);
      this.embeddings.push(Array.from(embedding));
      this.index += 1;
      return this.getProgress();
    }

    async startOnboarding(profile) {
      this.cancelled = false;
      this.profile = profile || {};
      return this.getProgress();
    }

    async finish() {
      if (this.embeddings.length !== TRAINING_PHRASES.length) throw new Error("Voice enrollment needs all training phrases.");
      const avg = new Array(this.embeddings[0].length).fill(0);
      this.embeddings.forEach((embedding) => embedding.forEach((v, i) => { avg[i] += v; }));
      for (let i = 0; i < avg.length; i++) avg[i] /= this.embeddings.length;
      const res = await fetch("/voice/enroll", {
        method: "POST",
        headers: { "content-type": "application/json", "x-aevra-csrf": sessionStorage.getItem("aevra_csrf") || "browser" },
        body: JSON.stringify({ userId: this.userId, profile: this.profile, embedding: avg }),
      });
      if (!res.ok) throw new Error("Voice enrollment could not be saved.");
      return res.json();
    }
  }

  global.AevraOnboardingEngine = { AevraOnboardingEngine, TRAINING_PHRASES };
})(window);
