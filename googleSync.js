// googleSync.js
(function(){
  function toast(msg){
    if(window.AppToast) return window.AppToast(msg);
  }

  function isOffline(){
    return window.__OFFLINE_MODE__ === true || navigator.onLine === false;
  }

  function getUserEmail(){
    try {
      if(state.user && state.user.email) return state.user.email;
    } catch (e) {}
    try {
      const stored = localStorage.getItem('g9_email');
      if(stored) return stored;
    } catch (e) {}
    return 'guest@student.com';
  }

  function ensureFirebase(){
    if(window.FirebaseRuntimeConfig && window.FirebaseRuntimeConfig.getFirebase){
      const fbFromRuntime = window.FirebaseRuntimeConfig.getFirebase();
      if(fbFromRuntime && fbFromRuntime.apps && fbFromRuntime.apps.length){
        return fbFromRuntime;
      }
    }
    if(!window.firebase) return null;
    try {
      if(!firebase.apps || !firebase.apps.length){
        if(!window.__FIREBASE_CONFIG__) return null;
        firebase.initializeApp(window.__FIREBASE_CONFIG__);
      }
    } catch (e) {}
    return firebase;
  }

  function getRefs(){
    if (isOffline()) return null;
    const fb = ensureFirebase();
    if(!fb) return null;
    const auth = fb.auth();
    const db = fb.firestore ? fb.firestore() : null;
    return { auth, db };
  }

  function getUid(){
    try {
      if(state.user && state.user.uid) return state.user.uid;
    } catch (e) {}
    return null;
  }

  function sleep(ms){
    return new Promise(r => setTimeout(r, ms));
  }

  async function withRetries(fn, opts){
    const max = (opts && opts.retries) || 3;
    let lastErr = null;
    for(let i=0;i<max;i++){
      try {
        return await fn(i);
      } catch (e){
        lastErr = e;
        if(i < max-1){
          toast('⚠️ Progress could not be saved. Retrying…');
          await sleep(400 * Math.pow(2, i));
        }
      }
    }
    throw lastErr;
  }

  const state = {
    user: null,
    pendingTimer: null,
    pendingPayload: null,
    firestoreDisabled: false,
    firestoreDisabledNotified: false
  };

  function isFirestoreDisabledError(e){
    const msg = (e && (e.message || e.toString && e.toString())) || '';
    const code = e && e.code;
    if(code === 'permission-denied') return true;
    if(msg.includes('permission-denied')) return true;
    if(msg.includes('firestore.googleapis.com')) return true;
    if(msg.includes('Cloud Firestore API has not been used')) return true;
    if(msg.includes('it is disabled')) return true;
    return false;
  }

  function disableFirestoreOnce(){
    state.firestoreDisabled = true;
    if(state.firestoreDisabledNotified) return;
    state.firestoreDisabledNotified = true;
    // Keep toast minimal and non-blocking.
    toast('⚠️ Unable to connect to Google account. Please sign in again.');
  }

  function setUser(user){
    state.user = user || null;
  }

  async function loadRemoteForUser(uid){
    const refs = getRefs();
    if(!refs || !refs.db) return;
    if(state.firestoreDisabled) return;

    const docRef = refs.db.collection('users').doc(uid).collection('tutor').doc('progress');
    try {
      const snap = await docRef.get();
      if(snap.exists){
        const data = snap.data();
        if(window.Progress && window.Progress.applyRemote){
          window.Progress.applyRemote(data);
        }
      }
    } catch (e){
      if(isFirestoreDisabledError(e)){
        disableFirestoreOnce();
        return;
      }
      toast('⚠️ Unable to connect to Google account. Please sign in again.');
    }
  }

  function _trimChats(chats){
    const arr = Array.isArray(chats) ? chats : [];
    const trimmed = arr.slice(0, 20).map(c => {
      const copy = Object.assign({}, c);
      const msgs = Array.isArray(copy.messages) ? copy.messages : [];
      copy.messages = msgs.slice(-80);
      return copy;
    });
    return trimmed;
  }

  async function loadChatsForUser(uid){
    const refs = getRefs();
    if(!refs || !refs.db) return;
    if(state.firestoreDisabled) return;
    const docRef = refs.db.collection('users').doc(uid).collection('tutor').doc('chats');
    try {
      const snap = await docRef.get();
      if(!snap.exists) return;
      const data = snap.data() || {};
      const chats = Array.isArray(data.chats) ? data.chats : [];
      const active = data.active || null;
      try {
        localStorage.setItem('g9_chats', JSON.stringify(chats));
        if(active) localStorage.setItem('g9_active', String(active));
      } catch (e) {}
      try { window.dispatchEvent(new CustomEvent('g9:remote_chats', { detail: { chats, active } })); } catch (e) {}
    } catch (e){
      if(isFirestoreDisabledError(e)) disableFirestoreOnce();
    }
  }

  async function saveChats(uid, chats, active){
    const refs = getRefs();
    if(!refs || !refs.db) throw new Error('FIRESTORE_UNAVAILABLE');
    if(state.firestoreDisabled) return;
    const docRef = refs.db.collection('users').doc(uid).collection('tutor').doc('chats');
    const payload = {
      chats: _trimChats(chats),
      active: active || null,
      updatedAt: Date.now()
    };
    await docRef.set(payload, { merge: true });
  }

  function _computeBadges(progress){
    const p = progress || {};
    const points = parseInt(p.totalPoints || 0, 10) || 0;
    const streak = parseInt(p.streakDays || 1, 10) || 1;
    const badges = [];
    if(points >= 100) badges.push({ key: 'points_100', name: '100 Points', description: 'Earn 100 total points.' });
    if(points >= 500) badges.push({ key: 'points_500', name: '500 Points', description: 'Earn 500 total points.' });
    if(points >= 1500) badges.push({ key: 'points_1500', name: '1500 Points', description: 'Earn 1500 total points.' });
    if(streak >= 3) badges.push({ key: 'streak_3', name: '3-Day Streak', description: 'Study for 3 days in a row.' });
    if(streak >= 7) badges.push({ key: 'streak_7', name: '7-Day Streak', description: 'Study for 7 days in a row.' });
    if(streak >= 30) badges.push({ key: 'streak_30', name: '30-Day Streak', description: 'Study for 30 days in a row.' });
    return { points, streak_days: streak, badges };
  }

  async function saveGamification(uid, email, progress){
    const refs = getRefs();
    if(!refs || !refs.db) throw new Error('FIRESTORE_UNAVAILABLE');
    if(state.firestoreDisabled) return;
    const computed = _computeBadges(progress);
    const docRef = refs.db.collection('users').doc(uid).collection('tutor').doc('gamification');
    await docRef.set(Object.assign({}, computed, { email: email || null, updatedAt: Date.now() }), { merge: true });
    const lbRef = refs.db.collection('leaderboard').doc(uid);
    await lbRef.set({
      uid,
      email: email || null,
      points: computed.points,
      streak_days: computed.streak_days,
      updatedAt: Date.now()
    }, { merge: true });
  }

  async function loadGamification(uid){
    const refs = getRefs();
    if(!refs || !refs.db) return null;
    if(state.firestoreDisabled) return null;
    const docRef = refs.db.collection('users').doc(uid).collection('tutor').doc('gamification');
    const snap = await docRef.get();
    return snap.exists ? (snap.data() || null) : null;
  }

  async function loadLeaderboard(limit){
    const refs = getRefs();
    if(!refs || !refs.db) return [];
    if(state.firestoreDisabled) return [];
    const lim = parseInt(limit || 10, 10) || 10;
    const q = refs.db.collection('leaderboard').orderBy('points', 'desc').limit(lim);
    const snap = await q.get();
    const rows = [];
    let rank = 1;
    snap.forEach(doc => {
      const d = doc.data() || {};
      rows.push({ rank: rank++, email: d.email || '', points: d.points || 0, streak_days: d.streak_days || 1 });
    });
    return rows;
  }

  async function saveRemote(uid, payload){
    const refs = getRefs();
    if(!refs || !refs.db) throw new Error('FIRESTORE_UNAVAILABLE');
    if(state.firestoreDisabled) return;
    const docRef = refs.db.collection('users').doc(uid).collection('tutor').doc('progress');
    await docRef.set(payload, { merge: true });
  }

  async function saveBackend(payload){
    if(!window.Api || !window.Api.apiFetch) throw new Error('API_UNAVAILABLE');
    const res = await window.Api.apiFetch('/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if(!res.ok) throw new Error('HTTP_' + res.status);
    return true;
  }

  async function loadBackend(email){
    if(!window.Api || !window.Api.apiFetch) return;
    try {
      const url = '/progress?email=' + encodeURIComponent(email);
      const res = await window.Api.apiFetch(url, { method: 'GET' });
      if(!res.ok) return;
      const data = await res.json();
      if(data && data.progress && window.Progress && window.Progress.applyRemote){
        window.Progress.applyRemote(data.progress);
      }
    } catch (e) {
      // ignore load failures to keep UI responsive
    }
  }

  function queueSave(payload){
    state.pendingPayload = payload;
    if(state.pendingTimer) clearTimeout(state.pendingTimer);

    state.pendingTimer = setTimeout(async ()=>{
      state.pendingTimer = null;
      const toSave = state.pendingPayload;
      state.pendingPayload = null;

      const email = getUserEmail();

      // Always try backend persistence (even when not signed in)
      try {
        await withRetries(() => saveBackend({ email, progress: toSave }), { retries: 3 });
      } catch (e){
        toast('⚠️ Progress could not be saved. Retrying…');
      }

      // If signed in, also sync to Google (Firestore)
      if(!state.user || !state.user.uid){
        return;
      }
      const uid = state.user.uid;

      try {
        await withRetries(() => saveRemote(uid, toSave), { retries: 3 });
        await withRetries(() => saveGamification(uid, email, toSave), { retries: 3 });
      } catch (e){
        if(isFirestoreDisabledError(e)){
          disableFirestoreOnce();
          return;
        }
        toast('⚠️ Progress could not be saved. Retrying…');
        toast('⚠️ Unable to connect to Google account. Please sign in again.');
      }
    }, 500);
  }

  function queueChatsSave(chats, active){
    if(!state.user || !state.user.uid) return;
    const uid = state.user.uid;
    if(state.pendingTimer) clearTimeout(state.pendingTimer);
    state.pendingTimer = setTimeout(async ()=>{
      state.pendingTimer = null;
      try {
        await withRetries(() => saveChats(uid, chats, active), { retries: 3 });
      } catch (e){
        if(isFirestoreDisabledError(e)) disableFirestoreOnce();
      }
    }, 800);
  }

  async function initAuthListener(){
    if (isOffline()) {
      state.firestoreDisabled = true;
      return;
    }
    try {
      if(window.FirebaseRuntimeConfig && window.FirebaseRuntimeConfig.ensureInitialized){
        await window.FirebaseRuntimeConfig.ensureInitialized();
      }
    } catch (e) {}

    const refs = getRefs();
    // Backend load should happen even without Firebase available
    try { loadBackend(getUserEmail()); } catch (e) {}

    if(!refs || !refs.auth) return;

    // If Auth module exists, ensure it's initialized so the redirect flow completes
    try {
      if(window.Auth && window.Auth.init){
        window.Auth.init();
      }
    } catch (e) {}

    refs.auth.onAuthStateChanged(async (user)=>{
      setUser(user || null);
      if(user && user.uid){
        // Prefer Google data when signed in
        await loadRemoteForUser(user.uid);
        await loadChatsForUser(user.uid);
        // Also load backend (authoritative for non-google logins)
        await loadBackend(getUserEmail());
      }
    }, ()=>{
      toast('⚠️ Unable to connect to Google account. Please sign in again.');
    });
  }

  function signOut(){
    const refs = getRefs();
    if(!refs || !refs.auth) return Promise.resolve();
    return refs.auth.signOut();
  }

  window.GoogleSync = {
    init: initAuthListener,
    queueSave,
    queueChatsSave,
    getUid,
    loadGamification,
    loadLeaderboard,
    signOut,
    setUser
  };
})();
