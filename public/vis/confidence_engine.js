// VIS Confidence Engine
(function () {
  const VIS = (window.VIS = window.VIS || {});
  VIS.confidenceEngine = {
    current: null,
    count: 0,
    update(userId) {
      if (!userId) { this.current = null; this.count = 0; return false; }
      if (this.current === userId) this.count += 1; else { this.current = userId; this.count = 1; }
      return this.count >= 3;
    },
    reset() { this.current = null; this.count = 0; }
  };
})();
