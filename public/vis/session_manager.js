// VIS Session Manager
(function () {
  const VIS = (window.VIS = window.VIS || {});
  const key = (id) => `vis_session_${id}`;
  VIS.sessionManager = {
    save(userId, state) {
      if (!userId) return;
      try { localStorage.setItem(key(userId), JSON.stringify(state || {})); } catch {}
    },
    load(userId) {
      if (!userId) return {};
      try { return JSON.parse(localStorage.getItem(key(userId)) || '{}'); } catch { return {}; }
    }
  };
})();
