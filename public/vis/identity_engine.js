export async function loadProfiles() {
  const profiles = [];
  try {
    const res = await fetch('/vis_profiles/index.json', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) profiles.push(...data);
      if (data && Array.isArray(data.profiles)) profiles.push(...data.profiles);
    }
  } catch {}
  const local = JSON.parse(localStorage.getItem('vis_profiles_local') || '[]');
  profiles.push(...local);
  return profiles.map((p) => ({
    user_id: p.user_identity?.username || p.username || p.user_id,
    embedding: p.facial_signature?.feature_vector || p.embedding || [],
    profile: p
  }));
}

export function saveProfile(profile) {
  const local = JSON.parse(localStorage.getItem('vis_profiles_local') || '[]');
  local.push(profile);
  localStorage.setItem('vis_profiles_local', JSON.stringify(local));
}
