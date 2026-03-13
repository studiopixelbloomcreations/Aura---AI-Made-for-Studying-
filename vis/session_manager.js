const key = (id) => `vis_session_${id}`;

export function saveSession(userId, state) {
  if (!userId) return;
  try { localStorage.setItem(key(userId), JSON.stringify(state || {})); } catch {}
}

export function loadSession(userId) {
  if (!userId) return {};
  try { return JSON.parse(localStorage.getItem(key(userId)) || '{}'); } catch { return {}; }
}
