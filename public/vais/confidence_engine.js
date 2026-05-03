(function (global) {
  "use strict";

  const HIGH = 0.85;
  const MEDIUM = 0.70;
  const LOW = 0.50;

  class ConfidenceEngine {
    constructor() {
      this.score = 0;
      this.lowStreak = 0;
    }

    addSample(sample) {
      const next = Math.max(0, Math.min(1, Number(sample) || 0));
      this.score = this.score ? (0.7 * this.score + 0.3 * next) : next;
      const band = this.getBand();
      this.lowStreak = band === "low" || band === "rejected" ? this.lowStreak + 1 : 0;
      return { score: this.score, band: this.lowStreak >= 3 ? "rejected" : band };
    }

    getBand() {
      if (this.score >= HIGH) return "high";
      if (this.score >= MEDIUM) return "medium";
      if (this.score >= LOW) return "low";
      return "rejected";
    }

    reset() {
      this.score = 0;
      this.lowStreak = 0;
    }
  }

  global.AevraConfidenceEngine = { ConfidenceEngine, HIGH, MEDIUM, LOW };
})(window);
