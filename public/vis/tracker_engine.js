// VIS Tracker Engine
(function () {
  const VIS = (window.VIS = window.VIS || {});
  function iou(a, b) {
    if (!a || !b) return 0;
    const x1 = Math.max(a.xmin, b.xmin);
    const y1 = Math.max(a.ymin, b.ymin);
    const x2 = Math.min(a.xmin + a.width, b.xmin + b.width);
    const y2 = Math.min(a.ymin + a.height, b.ymin + b.height);
    const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    const areaA = a.width * a.height;
    const areaB = b.width * b.height;
    const union = areaA + areaB - inter;
    return union <= 0 ? 0 : inter / union;
  }

  VIS.trackerEngine = {
    state: { box: null, stable: 0, lastAt: 0 },
    update(box) {
      const now = Date.now();
      if (!box) {
        this.state = { box: null, stable: 0, lastAt: now };
        return this.state;
      }
      const last = this.state.box;
      const overlap = iou(last, box);
      const stable = overlap > 0.6 ? this.state.stable + 1 : 0;
      this.state = { box, stable, lastAt: now };
      return this.state;
    },
    isTrackingValid() {
      const now = Date.now();
      return this.state.box && (now - this.state.lastAt) < 700 && this.state.stable >= 1;
    }
  };
})();
