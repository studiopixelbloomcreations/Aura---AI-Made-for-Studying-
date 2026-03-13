export function topEmotion(list) {
  if (!Array.isArray(list) || !list.length) return 'neutral';
  let best = list[0];
  for (const e of list) if ((e.score || 0) > (best.score || 0)) best = e;
  return String(best.emotion || best.label || 'neutral').toLowerCase();
}
