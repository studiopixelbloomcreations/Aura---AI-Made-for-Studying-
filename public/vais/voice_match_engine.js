(function (global) {
  "use strict";

  const DEFAULT_THRESHOLD = 0.85;

  class VoiceMatchEngine {
    constructor(options) {
      this.threshold = Number(options && options.threshold) || DEFAULT_THRESHOLD;
      this.recent = [];
      this.logs = [];
    }

    cosineSim(a, b) {
      const len = Math.min(a.length, b.length);
      let dot = 0, magA = 0, magB = 0;
      for (let i = 0; i < len; i++) {
        dot += a[i] * b[i];
        magA += a[i] * a[i];
        magB += b[i] * b[i];
      }
      return magA && magB ? dot / (Math.sqrt(magA) * Math.sqrt(magB)) : 0;
    }

    findMatch(liveEmbedding, storedSignatures) {
      let best = { userId: null, confidence: 0, matched: false };
      (storedSignatures || []).forEach((signature) => {
        const embedding = signature.embedding instanceof Float32Array ? signature.embedding : new Float32Array(signature.embedding || []);
        const confidence = this.cosineSim(liveEmbedding, embedding);
        if (confidence > best.confidence) best = { userId: signature.userId || signature.user_id, confidence, matched: false };
      });
      this.recent.push(best);
      this.recent = this.recent.slice(-3);
      const confirmed = this.recent.length === 3 && this.recent.every((m) => m.userId === best.userId && m.confidence >= this.threshold);
      best.matched = !!(best.userId && confirmed);
      this.logs.push({ at: new Date().toISOString(), userId: best.userId, confidence: best.confidence, matched: best.matched });
      return best;
    }
  }

  global.AuraVoiceMatchEngine = VoiceMatchEngine;
})(window);
