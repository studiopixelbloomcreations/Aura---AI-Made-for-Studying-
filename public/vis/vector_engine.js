// VIS Vector Engine
(function () {
  const VIS = (window.VIS = window.VIS || {});
  function cosine(a, b) {
    const n = Math.min(a.length, b.length);
    if (!n) return 0;
    let dot = 0, ax = 0, by = 0;
    for (let i = 0; i < n; i += 1) {
      const x = Number(a[i] || 0);
      const y = Number(b[i] || 0);
      dot += x * y; ax += x * x; by += y * y;
    }
    if (!ax || !by) return 0;
    return dot / (Math.sqrt(ax) * Math.sqrt(by));
  }

  VIS.vectorEngine = {
    cosine,
    match(embedding, index, threshold) {
      let best = null;
      let bestScore = -1;
      for (const row of index) {
        const score = cosine(embedding, row.vector || []);
        if (score > bestScore) {
          bestScore = score;
          best = row;
        }
      }
      if (!best || bestScore < threshold) return null;
      return { user_id: best.user_id, similarity_score: bestScore, profile: best.profile };
    }
  };
})();
