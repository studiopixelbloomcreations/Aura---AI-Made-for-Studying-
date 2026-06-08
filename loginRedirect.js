// loginRedirect.js
(function(){
  const TOKEN_KEY = 'g9_token';
  const TOKEN_EXP_KEY = 'g9_token_exp';
  const SESSION_REDIRECT_KEY = 'g9_login_redirected';

  function isTokenValid(){
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      const expRaw = localStorage.getItem(TOKEN_EXP_KEY);
      const exp = expRaw ? parseInt(expRaw, 10) : 0;
      if(!token || !exp) return false;
      // 60s clock skew buffer
      return Date.now() < (exp - 60_000);
    } catch (e) {
      return false;
    }
  }

  function redirectToLogin(){
    try { sessionStorage.setItem(SESSION_REDIRECT_KEY, '1'); } catch (e) {}
    const returnTo = encodeURIComponent(window.location.pathname.split('/').pop() || 'app.html');
    window.location.href = 'login.html?return=' + returnTo;
  }

  window.LoginRedirect = {
    isTokenValid,
    redirectToLogin
  };

  window.addEventListener('DOMContentLoaded', ()=>{
    try {
      const params = new URLSearchParams(window.location.search || '');
      if (params.get('visMock') === '1') return;
    } catch (e) {}
    // Only guard the main app pages.
    const page = (window.location.pathname.split('/').pop() || '').toLowerCase();
    if(page === 'login.html' || page === 'signup.html' || page === 'index.html') return;

    let alreadyRedirected = false;
    try { alreadyRedirected = sessionStorage.getItem(SESSION_REDIRECT_KEY) === '1'; } catch (e) {}

    if(!isTokenValid()){
      // Only redirect once per session to avoid loops.
      if(!alreadyRedirected){
        redirectToLogin();
      }
      return;
    }

    // Token looks valid, allow app load.
    try { sessionStorage.removeItem(SESSION_REDIRECT_KEY); } catch (e) {}
  });
})();
