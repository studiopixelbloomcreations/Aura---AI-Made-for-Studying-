// VIS Identity Engine
(function () {
  const VIS = (window.VIS = window.VIS || {});
  const LOCAL_KEY = 'vis_local_profiles';

  function loadLocal() {
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); } catch { return []; }
  }
  function saveLocal(list) {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(list || [])); } catch {}
  }

  VIS.identityEngine = {
    async loadProfiles() {
      let index = [];
      try {
        const res = await fetch('/vis_profiles/index.json', { cache: 'no-store' });
        if (res.ok) index = await res.json();
      } catch {}
      const local = loadLocal();
      const merged = [...index, ...local];
      return merged.map((p) => ({
        user_id: p.user_id || p.username || p.profile_file || p.file_name,
        vector: p.vector || (p.facial_signature && p.facial_signature.feature_vector) || [],
        profile: p.profile || p
      }));
    },
    saveProfile(profile, vector) {
      const local = loadLocal();
      local.push({
        user_id: profile.user_identity && profile.user_identity.username,
        vector,
        profile
      });
      saveLocal(local);
    }
  };
})();
