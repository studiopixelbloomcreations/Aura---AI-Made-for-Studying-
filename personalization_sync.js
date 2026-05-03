// personalization_sync.js
// Bridges existing point-award events to the new /user/save_progress endpoint.
(function(){
  function toast(msg){
    try { if(window.AppToast) return window.AppToast(msg, {duration: 4000}); } catch (e) {}
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

  function getTopic(){
    // Use the current subject dropdown as the best available proxy for "topic".
    try {
      const dd = document.getElementById('subjectDropdown');
      if(dd && dd.value) return dd.value;
    } catch (e) {}
    return 'General';
  }

  async function saveAttempt(opts){
    const uid = (window.GoogleSync && window.GoogleSync.getUid) ? window.GoogleSync.getUid() : null;
    if(!uid || !window.firebase || !firebase.firestore) return;
    const db = firebase.firestore();
    const topic = opts.topic || getTopic();
    const score = Number.isFinite(opts.score) ? opts.score : 0;
    const correct = !!opts.correct;
    const docRef = db.collection('users').doc(uid).collection('aevra').doc('topic_stats');
    const field = topic.replace(/[^a-zA-Z0-9_\- ]/g, '').slice(0, 40) || 'General';
    const payload = {};
    payload['topics.' + field + '.topic'] = topic;
    payload['topics.' + field + '.questions_answered'] = firebase.firestore.FieldValue.increment(1);
    payload['topics.' + field + '.correct'] = firebase.firestore.FieldValue.increment(correct ? 1 : 0);
    payload['topics.' + field + '.score_total'] = firebase.firestore.FieldValue.increment(score);
    payload['updatedAt'] = Date.now();
    await docRef.set(payload, { merge: true });
    const profileRef = db.collection('users').doc(uid).collection('aevra').doc('profile');
    await profileRef.set({ preferred_language: getLanguage(), email: getEmail(), updatedAt: Date.now() }, { merge: true });
    return true;
  }

  // Listen for awarded points events.
  window.addEventListener('g9:marks_updated', async (ev)=>{
    const d = (ev && ev.detail) ? ev.detail : {};
    const reason = d.reason || '';
    const points = parseInt(d.points || 0, 10);

    // We only treat awards as "correct" attempts.
    // This gives us a simple performance signal that is already available in the app.
    if(points <= 0) return;

    const subject = getTopic();
    const question = reason === 'quiz_correct' ? 'Quiz correct' : 'AI awarded points';

    try {
      await saveAttempt({
        topic: subject,
        correct: true,
        score: points,
        question
      });
    } catch (e) {
      // Silent fallback; profile page will show a hint if server personalization isn't active.
    }
  });

  // Also save a baseline profile on load (best-effort).
  window.addEventListener('DOMContentLoaded', ()=>{
    try {
      const uid = (window.GoogleSync && window.GoogleSync.getUid) ? window.GoogleSync.getUid() : null;
      if(uid && window.firebase && firebase.firestore){
        const db = firebase.firestore();
        db.collection('users').doc(uid).collection('aevra').doc('profile')
          .set({ email: getEmail(), preferred_language: getLanguage(), updatedAt: Date.now() }, { merge: true })
          .catch(()=>{});
      }
    } catch (e) {}
  });

  window.PersonalizationSync = {
    saveAttempt
  };
})();
