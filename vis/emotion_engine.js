export function topEmotion(list) {
  if (typeof list === 'string' && list.trim()) return list.trim().toLowerCase();
  if (Array.isArray(list)) {
    if (!list.length) return 'neutral';
    let best = list[0];
    for (const entry of list) {
      if ((entry.score || 0) > (best.score || 0)) best = entry;
    }
    return String(best.emotion || best.label || 'neutral').toLowerCase();
  }
  if (list && typeof list === 'object') {
    let label = 'neutral';
    let score = -1;
    for (const [key, value] of Object.entries(list)) {
      const next = Number(value || 0);
      if (next > score) {
        label = key;
        score = next;
      }
    }
    return String(label || 'neutral').toLowerCase();
  }
  return 'neutral';
}
