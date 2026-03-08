// auth.js
(function(){
  function toast(msg){
    try {
      if(window.AppToast) return window.AppToast(msg, {duration: 5000});
    } catch (e) {}
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
    }, 5000);
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

  const TOKEN_KEY = 'g9_token';
  const TOKEN_EXP_KEY = 'g9_token_exp';

  const state = {
    ready: false,
    user: null,
    token: null,
    tokenExp: 0,
    readyPromise: null,
    readyResolve: null
  };

  function getUserInfo(user){
    if(!user) return null;
    return {
      uid: user.uid,
      name: user.displayName || '',
      email: user.email || '',
      photoURL: user.photoURL || ''
    };
  }

  function emit(name, detail){
    try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch (e) {}
  }

  function loadStoredToken(){
    try {
      const t = localStorage.getItem(TOKEN_KEY);
      const expRaw = localStorage.getItem(TOKEN_EXP_KEY);
      const exp = expRaw ? parseInt(expRaw, 10) : 0;
      state.token = t || null;
      state.tokenExp = exp || 0;
    } catch (e) {
      state.token = null;
      state.tokenExp = 0;
    }
  }

  function storeToken(token, expMs){
    try {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(TOKEN_EXP_KEY, String(expMs));
    } catch (e) {}
    state.token = token;
    state.tokenExp = expMs;
  }

  function clearStoredToken(){
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
    try { localStorage.removeItem(TOKEN_EXP_KEY); } catch (e) {}
    state.token = null;
    state.tokenExp = 0;
  }

  function isTokenValid(){
    loadStoredToken();
    if(!state.token || !state.tokenExp) return false;
    return Date.now() < (state.tokenExp - 60_000);
  }

  function redirectToLogin(){
    const returnTo = encodeURIComponent(window.location.pathname.split('/').pop() || 'app.html');
    window.location.href = 'login.html?return=' + returnTo;
  }

  function clearLocalUserData(){
    const keys = [
      'g9_progress','g9_timer','g9_points','g9_chats','g9_active','g9_subject','g9_language','g9_study_goal','g9_theme','g9_sidebar_visible','g9_email'
    ];
    keys.forEach(k=>{ try { localStorage.removeItem(k); } catch (e) {} });
  }

  async function signOutAndReset(){
    const fb = ensureFirebase();
    if(!fb) return;
    const auth = fb.auth();
    try {
      await auth.signOut();
    } catch (e) {
      toast('⚠️ Unable to connect to Google account. Please try again.');
    }
    clearStoredToken();
    clearLocalUserData();
    redirectToLogin();
  }

  async function refreshTokenFromFirebase(user){
    if(!user) return null;
    try {
      const res = await user.getIdTokenResult(true);
      const expMs = Date.parse(res.expirationTime);
      storeToken(res.token, expMs);
      return res.token;
    } catch (e) {
      toast('⚠️ Unable to connect to Google account. Please try again.');
      return null;
    }
  }

  async function init(){
    if(state.readyPromise) return state.readyPromise;
    state.readyPromise = new Promise((resolve)=>{ state.readyResolve = resolve; });

    let fb = null;
    try {
      if(window.FirebaseRuntimeConfig && window.FirebaseRuntimeConfig.ensureInitialized){
        const runtime = await window.FirebaseRuntimeConfig.ensureInitialized();
        fb = runtime && runtime.firebase ? runtime.firebase : null;
      }
    } catch (e) {}
    if(!fb) fb = ensureFirebase();
    if(!fb){
      state.ready = true;
      state.user = null;
      if(state.readyResolve) state.readyResolve(null);
      return state.readyPromise;
    }

    const auth = fb.auth();

    // Load any previously stored token so LoginRedirect can short-circuit.
    loadStoredToken();

    auth.onAuthStateChanged(async (user)=>{
      state.user = user || null;
      state.ready = true;

      const info = getUserInfo(state.user);
      if(info && info.email){
        try { localStorage.setItem('g9_email', info.email); } catch (e) {}
      }

      // Ensure we have a fresh token stored whenever we have a Firebase user.
      if(user){
        await refreshTokenFromFirebase(user);
      } else {
        // If there's no firebase user, consider token invalid.
        clearStoredToken();
      }

      // If we have a token but no user info, treat it as account detail load failure.
      if(isTokenValid() && (!info || !info.email)){
        toast('⚠️ Unable to load account details. Please refresh or log in again.');
      }

      emit('g9:auth_state', { user: info });
      if(state.readyResolve) state.readyResolve(info);
    }, ()=>{
      toast('⚠️ Unable to connect to Google account. Please try again.');
      state.ready = true;
      state.user = null;
      clearStoredToken();
      if(state.readyResolve) state.readyResolve(null);
    });

    return state.readyPromise;
  }

  function getUser(){
    return getUserInfo(state.user);
  }

  function getToken(){
    loadStoredToken();
    return isTokenValid() ? state.token : null;
  }

  async function getAccountDetails(){
    // Primary source: Firebase current user
    const u = getUser();
    if(u && (u.email || u.name || u.photoURL)) return u;

    // If we have a token but couldn't resolve user, treat as failure per spec.
    if(isTokenValid()){
      toast('⚠️ Unable to load account details. Please refresh or log in again.');
    }
    return null;
  }

  function requireAuth(){
    return init();
  }

  window.Auth = {
    init,
    requireAuth,
    getUser,
    getToken,
    getAccountDetails,
    signOutAndReset,
    clearLocalUserData,
    redirectToLogin
  };
})();
