// profile.js
(function(){
  function qs(id){ return document.getElementById(id); }

  const elName = qs('profileName');
  const elMeta = qs('profileMeta');
  const elLang = qs('profileLanguage');
  const elHeadline = qs('profileFeedbackHeadline');
  const elMessage = qs('profileFeedbackMessage');
  const elSummary = qs('profileProgressSummary');
  const elAccuracy = qs('profileAccuracy');
  const elFill = qs('profileProgressFill');
  const elTopics = qs('profileTopicsList');
  const btnRefresh = qs('profileRefreshBtn');
  const btnReset = qs('profileResetBtn');
  const canvas = qs('profileChart');

  function toast(msg, opts){
    try { if(window.AppToast) return window.AppToast(msg, opts || {duration: 4500}); } catch (e) {}
    const toasts = document.getElementById('toasts');
    if(!toasts) return;
    const d = document.createElement('div');
    d.className = 'toast';
    d.textContent = msg;
    toasts.appendChild(d);
    setTimeout(()=>{
      d.style.opacity = '0';
      d.style.transform = 'translateY(10px)';
      setTimeout(()=>d.remove(), 300);
    }, (opts && opts.duration) || 4500);
  }

  function getEmail(){
    try {
      const u = (window.Auth && window.Auth.getUser) ? window.Auth.getUser() : null;
      if(u && u.email) return u.email;
    } catch (e) {}
    try {
      const stored = localStorage.getItem('g9_email');
      if(stored) return stored;
    } catch (e) {}
    return 'guest@student.com';
  }

  function getLanguage(){
    try { return localStorage.getItem('g9_language') || 'English'; } catch (e) {}
    return 'English';
  }

  function setLanguage(lang){
    try { localStorage.setItem('g9_language', lang); } catch (e) {}

    // Keep Settings dropdown in sync if present
    try {
      const settingsLanguage = document.getElementById('settingsLanguage');
      if(settingsLanguage) settingsLanguage.value = lang;
    } catch (e) {}

    // Best-effort tell backend profile preference
    if(window.Api && window.Api.apiFetch){
      window.Api.apiFetch('/user/set_profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: getEmail(), preferred_language: lang })
      }).catch(()=>{});
    }
  }

  function setText(el, text){ if(el) el.textContent = text; }

  function drawMiniChart(topicRows){
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    if(!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0,0,w,h);

    // Background
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0,0,w,h);

    const rows = (topicRows || []).slice(0, 6);
    if(rows.length === 0){
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto';
      ctx.fillText('No topic data yet', 12, 22);
      return;
    }

    const maxQ = Math.max(1, ...rows.map(r=>r.questions_answered || 0));
    const pad = 14;
    const barW = (w - pad*2) / rows.length;

    rows.forEach((r, i)=>{
      const q = r.questions_answered || 0;
      const acc = (q > 0) ? (r.correct / q) : 0;
      const barH = (h - pad*2) * (q / maxQ);
      const x = pad + i*barW + 6;
      const y = h - pad - barH;

      // Bar
      ctx.fillStyle = 'rgba(6,182,212,0.65)';
      ctx.fillRect(x, y, Math.max(6, barW - 12), barH);

      // Accuracy cap
      ctx.fillStyle = 'rgba(139,92,246,0.85)';
      ctx.fillRect(x, y, Math.max(6, barW - 12), Math.max(3, 6 * acc));

      // Label
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = '11px system-ui, -apple-system, Segoe UI, Roboto';
      const label = String(r.topic || '').slice(0, 8);
      ctx.fillText(label, x, h - 4);
    });
  }

  function renderSnapshot(snapshot){
    if(!snapshot) return;

    const profile = snapshot.profile || {};
    const progress = snapshot.progress || {};
    const feedback = snapshot.feedback || {};

    const name = profile.name || (getEmail() === 'guest@student.com' ? 'Guest' : 'Student');
    const grade = profile.grade || 'Grade 9';

    setText(elName, name);
    setText(elMeta, grade);

    const totalQ = progress.total_questions || 0;
    const totalCorrect = progress.total_correct || 0;
    const totalScore = progress.total_score || 0;

    const accuracy = totalQ > 0 ? Math.round((totalCorrect / totalQ) * 100) : 0;

    setText(elHeadline, feedback.headline || 'Your learning summary');
    setText(elMessage, feedback.message || '');
    setText(elSummary, 'Total score: ' + totalScore + ' • Questions: ' + totalQ);
    setText(elAccuracy, 'Accuracy: ' + accuracy + '%');

    if(elFill){
      elFill.style.width = accuracy + '%';
      const bar = elFill.parentElement;
      try { if(bar) bar.setAttribute('aria-valuenow', String(accuracy)); } catch (e) {}
    }

    if(elTopics){
      const topicsObj = progress.topics || {};
      const rows = Object.values(topicsObj).map(t=>({
        topic: t.topic,
        questions_answered: t.questions_answered || 0,
        correct: t.correct || 0,
        score_total: t.score_total || 0,
        difficulty: t.difficulty || 2
      }));
      rows.sort((a,b)=> (b.score_total||0) - (a.score_total||0));

      elTopics.innerHTML = '';
      if(rows.length === 0){
        const empty = document.createElement('div');
        empty.className = 'profile-topic-row';
        empty.textContent = 'No topics tracked yet.';
        elTopics.appendChild(empty);
      } else {
        rows.forEach(r=>{
          const row = document.createElement('div');
          row.className = 'profile-topic-row';

          const left = document.createElement('div');
          left.className = 'profile-topic-left';
          const title = document.createElement('div');
          title.className = 'profile-topic-title';
          title.textContent = r.topic;
          const sub = document.createElement('div');
          sub.className = 'profile-topic-sub';
          const acc = r.questions_answered > 0 ? Math.round((r.correct / r.questions_answered) * 100) : 0;
          sub.textContent = 'Accuracy ' + acc + '% • Difficulty ' + r.difficulty;
          left.appendChild(title);
          left.appendChild(sub);

          const right = document.createElement('div');
          right.className = 'profile-topic-right';
          right.textContent = String(r.score_total || 0);

          row.appendChild(left);
          row.appendChild(right);
          elTopics.appendChild(row);
        });
      }

      drawMiniChart(rows);
    }

    // Sync language
    const preferred = profile.preferred_language || getLanguage();
    if(elLang) elLang.value = preferred;
  }

  async function fetchSnapshot(){
    const uid = (window.GoogleSync && window.GoogleSync.getUid) ? window.GoogleSync.getUid() : null;
    const email = getEmail();
    if(uid && window.GoogleSync && window.GoogleSync.loadGamification){
      const g = await window.GoogleSync.loadGamification(uid);
      const local = (window.Progress && window.Progress.getState) ? window.Progress.getState() : {};
      const points = (g && (g.points || g.points === 0)) ? g.points : (local.totalPoints || 0);
      let topicStats = null;
      try {
        if(window.firebase && firebase.firestore){
          const db = firebase.firestore();
          const snap = await db.collection('users').doc(uid).collection('aevra').doc('topic_stats').get();
          topicStats = snap && snap.exists ? (snap.data() || null) : null;
        }
      } catch (e) {}
      const topics = topicStats && topicStats.topics ? topicStats.topics : {};
      const rows = Object.values(topics || {}).map(t => ({
        topic: t.topic,
        questions_answered: t.questions_answered || 0,
        correct: t.correct || 0,
        score_total: t.score_total || 0,
        difficulty: t.difficulty || 2
      }));
      const totalQ = rows.reduce((a,r)=>a+(r.questions_answered||0), 0);
      const totalCorrect = rows.reduce((a,r)=>a+(r.correct||0), 0);
      const totalScore = rows.reduce((a,r)=>a+(r.score_total||0), 0) || points;
      const snapshot = {
        profile: { name: (window.Auth && window.Auth.getUser && window.Auth.getUser() && window.Auth.getUser().name) || 'Student', grade: 'Grade 9', preferred_language: getLanguage() },
        progress: { total_questions: totalQ, total_correct: totalCorrect, total_score: totalScore, topics },
        feedback: { headline: 'Your progress', message: 'Your progress is saved to your Google account when signed in.' }
      };
      return snapshot;
    }
    throw new Error('NO_REMOTE_SNAPSHOT');
  }

  function fallbackFromLocal(){
    // Fallback UI when backend endpoints are not registered.
    const lang = getLanguage();
    if(elLang) elLang.value = lang;

    // Use existing local progress state (streak/minutes/points) if available.
    let local = null;
    try { local = (window.Progress && window.Progress.getState) ? window.Progress.getState() : null; } catch (e) {}

    setText(elName, 'Student');
    setText(elMeta, 'Grade 9');

    const points = local ? (local.totalPoints || 0) : 0;
    setText(elHeadline, lang === 'Sinhala' ? 'ඔයාගේ ප්‍රගතිය' : 'Your progress');
    setText(elMessage, lang === 'Sinhala'
      ? 'ඔයා Google account එකෙන් sign in වුනාම ප්‍රගතිය save වෙයි.'
      : 'Sign in with Google to save your progress to your account.');
    setText(elSummary, (lang === 'Sinhala' ? 'මුළු ලකුණු: ' : 'Total points: ') + points);
    setText(elAccuracy, 'Accuracy: 0%');
    if(elFill) elFill.style.width = '0%';

    if(elTopics){
      elTopics.innerHTML = '';
      const row = document.createElement('div');
      row.className = 'profile-topic-row';
      row.textContent = 'Personalization is available when signed in.';
      elTopics.appendChild(row);
    }

    drawMiniChart([]);
  }

  async function refresh(){
    try {
      setText(elHeadline, 'Loading…');
      setText(elMessage, 'Fetching your progress and feedback.');
      const snapshot = await fetchSnapshot();
      renderSnapshot(snapshot);
    } catch (e) {
      fallbackFromLocal();
    }
  }

  async function resetProgress(){
    if(!window.Api || !window.Api.apiFetch) return toast('⚠️ Server not responding. Please try again later.');
    try {
      const res = await window.Api.apiFetch('/user/reset_progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: getEmail() })
      });
      if(!res.ok) throw new Error('HTTP_' + res.status);
      toast('Progress reset');
      await refresh();
    } catch (e) {
      toast('⚠️ Server not responding. Please try again later.');
    }
  }

  // Hook UI
  if(elLang){
    elLang.value = getLanguage();
    elLang.addEventListener('change', (e)=>{
      const lang = e.target.value;
      setLanguage(lang);
      toast('Language: ' + lang);
      refresh();
    });
  }
  if(btnRefresh) btnRefresh.addEventListener('click', refresh);
  if(btnReset) btnReset.addEventListener('click', ()=>{
    if(confirm('Reset your learning progress?')) resetProgress();
  });

  // Initial boot: wait for DOM, then load.
  window.addEventListener('DOMContentLoaded', ()=>{
    // Keep local setting synced
    if(elLang) elLang.value = getLanguage();

    // If auth module exists, init first so email is ready.
    (async ()=>{
      try { if(window.Auth && window.Auth.init) await window.Auth.init(); } catch (e) {}
      refresh();
    })();
  });
})();
