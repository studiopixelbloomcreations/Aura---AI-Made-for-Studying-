export function createConfidenceEngine() {
  let current = null;
  let count = 0;
  return {
    update(userId) {
      if (!userId) { current = null; count = 0; return false; }
      if (current === userId) count += 1; else { current = userId; count = 1; }
      return count >= 3;
    },
    reset() { current = null; count = 0; }
  };
}
