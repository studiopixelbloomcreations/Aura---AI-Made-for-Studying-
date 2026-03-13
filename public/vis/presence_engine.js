export function createPresenceEngine() {
  let lastSeen = 0;
  return {
    update(hasFace) {
      if (hasFace) lastSeen = Date.now();
      return this.isPresent();
    },
    isPresent() {
      return Date.now() - lastSeen < 700;
    }
  };
}
