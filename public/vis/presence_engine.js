// VIS Presence Engine
(function () {
  const VIS = (window.VIS = window.VIS || {});
  VIS.presenceEngine = {
    lastSeenAt: 0,
    update(hasFace) {
      if (hasFace) this.lastSeenAt = Date.now();
      return this.isPresent();
    },
    isPresent() {
      return (Date.now() - this.lastSeenAt) < 700;
    }
  };
})();
