/* AURA AI — Login Controller
   Firebase auth flow preserved. UI layer completely new. */
(function () {
  'use strict';

  // ─── Constants ───
  const TOKEN_KEY = 'g9_token';
  const TOKEN_EXP_KEY = 'g9_token_exp';
  const LOGIN_RETURN_KEY = 'g9_login_return_target';
  const LOGIN_FLOW_KEY = 'g9_login_flow_started';

  // ─── DOM refs ───
  const form = document.getElementById('loginForm');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const togglePassword = document.getElementById('togglePassword');
  const eyeIcon = document.getElementById('eyeIcon');
  const submitBtn = document.getElementById('submitBtn');
  const submitText = document.getElementById('submitText');
  const submitSpinner = document.getElementById('submitSpinner');
  const googleBtn = document.getElementById('googleBtn');
  const toastEl = document.getElementById('toast');

  // ─── State ───
  let auth = null;
  let isLoading = false;

  // ─── Helpers ───
  function sanitizeReturnTarget(target) {
    const raw = String(target || '').trim();
    if (!raw) return 'app.html';
    if (/^https?:\/\//i.test(raw) || raw.startsWith('//')) return 'app.html';
    const clean = raw.replace(/^\/+/, '');
    return clean || 'app.html';
  }

  function getReturnTarget() {
    try {
      const params = new URLSearchParams(window.location.search);
      const fromQuery = params.get('return');
      if (fromQuery) return sanitizeReturnTarget(fromQuery);
    } catch (e) {}
    try {
      const stored = localStorage.getItem(LOGIN_RETURN_KEY);
      if (stored) return sanitizeReturnTarget(stored);
    } catch (e) {}
    return 'app.html';
  }

  function persistReturnTarget() {
    try { localStorage.setItem(LOGIN_RETURN_KEY, getReturnTarget()); } catch (e) {}
  }

  function markLoginFlowStarted() {
    try { localStorage.setItem(LOGIN_FLOW_KEY, '1'); } catch (e) {}
  }

  function consumeLoginFlowStarted() {
    try {
      const v = localStorage.getItem(LOGIN_FLOW_KEY) === '1';
      localStorage.removeItem(LOGIN_FLOW_KEY);
      return v;
    } catch (e) { return false; }
  }

  function clearReturnTarget() {
    try { localStorage.removeItem(LOGIN_RETURN_KEY); } catch (e) {}
  }

  function redirectToAppTarget(delayMs) {
    const target = getReturnTarget();
    clearReturnTarget();
    setTimeout(() => { window.location.href = target; }, Number(delayMs || 0));
  }

  async function storeTokenFromUser(user) {
    if (!user) return false;
    try {
      const res = await user.getIdTokenResult(true);
      const expMs = Date.parse(res.expirationTime);
      localStorage.setItem(TOKEN_KEY, res.token);
      localStorage.setItem(TOKEN_EXP_KEY, String(expMs));
      return true;
    } catch (e) { return false; }
  }

  function friendlyAuthError(err) {
    const code = err && err.code ? String(err.code) : '';
    if (code === 'auth/unauthorized-domain') return 'This domain is not authorized. Contact support.';
    if (code === 'auth/popup-blocked') return 'Popup was blocked. Allow popups and try again.';
    if (code === 'auth/popup-closed-by-user') return 'Popup closed. Please try again.';
    if (code === 'auth/cancelled-popup-request') return 'Login interrupted. Please try again.';
    if (code === 'auth/network-request-failed') return 'Network error. Check your connection.';
    if (code === 'auth/user-not-found') return 'No account found with this email.';
    if (code === 'auth/wrong-password') return 'Incorrect password. Please try again.';
    if (code === 'auth/invalid-credential') return 'Invalid email or password.';
    if (code === 'auth/too-many-requests') return 'Too many attempts. Please wait and try again.';
    if (code === 'auth/invalid-email') return 'Please enter a valid email address.';
    return err && err.message ? String(err.message) : 'Something went wrong. Please try again.';
  }

  // ─── Toast ───
  let toastTimer = null;
  function showToast(message, type) {
    if (toastTimer) clearTimeout(toastTimer);
    toastEl.textContent = message;
    toastEl.className = 'auth-toast visible' + (type ? ' ' + type : '');
    toastTimer = setTimeout(() => {
      toastEl.classList.remove('visible');
    }, 3500);
  }

  // ─── Loading State ───
  function setLoading(loading) {
    isLoading = loading;
    submitBtn.disabled = loading;
    submitText.style.display = loading ? 'none' : 'inline';
    submitSpinner.style.display = loading ? 'inline-block' : 'none';
    googleBtn.disabled = loading;
  }

  // ─── Input Validation ───
  function clearInputError(input) {
    input.classList.remove('error');
    const wrap = input.closest('.auth-input-wrap');
    if (wrap) {
      const errEl = wrap.querySelector('.auth-input-error');
      if (errEl) errEl.remove();
    }
  }

  function setInputError(input, message) {
    input.classList.add('error');
    const wrap = input.closest('.auth-input-wrap');
    if (wrap && !wrap.querySelector('.auth-input-error')) {
      const errEl = document.createElement('div');
      errEl.className = 'auth-input-error';
      errEl.textContent = message;
      wrap.appendChild(errEl);
    }
  }

  // ─── Password Toggle ───
  function setupPasswordToggle() {
    if (!togglePassword || !passwordInput) return;
    let visible = false;
    togglePassword.addEventListener('click', () => {
      visible = !visible;
      passwordInput.type = visible ? 'text' : 'password';
      togglePassword.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
      if (eyeIcon) {
        eyeIcon.innerHTML = visible
          ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'
          : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
      }
    });
  }

  // ─── Complete Sign In ───
  async function completeSignIn(user, message) {
    const ok = await storeTokenFromUser(user);
    if (!ok) {
      showToast('Unable to complete sign-in. Please try again.', 'error');
      return false;
    }
    showToast(message || 'Signed in — redirecting...', 'success');
    redirectToAppTarget(700);
    return true;
  }

  // ─── Init ───
  async function init() {
    // Wait for Firebase
    try {
      if (window.FirebaseRuntimeConfig && window.FirebaseRuntimeConfig.ensureInitialized) {
        await window.FirebaseRuntimeConfig.ensureInitialized();
      }
    } catch (e) {
      console.error('Firebase runtime config error:', e);
      showToast('Login is unavailable: Firebase config missing.', 'error');
      return;
    }

    auth = window.auth || (window.firebase && firebase.auth ? firebase.auth() : null);
    if (!auth) {
      showToast('Login is unavailable: Firebase not initialized.', 'error');
      return;
    }

    // Setup UI
    setupPasswordToggle();
    persistReturnTarget();

    // Handle redirect result
    try {
      await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
      const res = await auth.getRedirectResult();
      const flowStarted = consumeLoginFlowStarted();
      if (res && res.user && flowStarted) {
        await completeSignIn(res.user, 'Signed in — redirecting...');
      }
    } catch (err) {
      console.error('Redirect sign-in error:', err);
    }

    // Auth state listener
    auth.onAuthStateChanged((user) => {
      if (user) {
        console.log('User signed in:', user.email || user.displayName);
      }
    });

    // ─── Form Submit (Email/Password) ───
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (isLoading) return;

      const email = emailInput.value.trim();
      const password = passwordInput.value;

      // Clear previous errors
      clearInputError(emailInput);
      clearInputError(passwordInput);

      // Validate
      let hasError = false;
      if (!email) {
        setInputError(emailInput, 'Email is required');
        hasError = true;
      } else if (!/\S+@\S+\.\S+/.test(email)) {
        setInputError(emailInput, 'Enter a valid email address');
        hasError = true;
      }
      if (!password) {
        setInputError(passwordInput, 'Password is required');
        hasError = true;
      } else if (password.length < 6) {
        setInputError(passwordInput, 'Password must be at least 6 characters');
        hasError = true;
      }
      if (hasError) return;

      setLoading(true);
      try {
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
          firebase.auth().settings.appVerificationDisabledForTesting = true;
        }
        await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
        markLoginFlowStarted();
        const cred = await auth.signInWithEmailAndPassword(email, password);
        const ok = await completeSignIn(cred && cred.user, 'Signed in — redirecting...');
        if (!ok) showToast('Unable to sign in. Please try again.', 'error');
      } catch (err) {
        console.error('Login error:', err);
        showToast(friendlyAuthError(err), 'error');
      } finally {
        setLoading(false);
      }
    });

    // ─── Google Sign In ───
    googleBtn.addEventListener('click', async () => {
      if (isLoading) return;
      setLoading(true);
      try {
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
          firebase.auth().settings.appVerificationDisabledForTesting = true;
        }
        await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
        persistReturnTarget();
        markLoginFlowStarted();

        const provider = new firebase.auth.GoogleAuthProvider();
        provider.addScope('email');
        let cred = null;
        try {
          cred = await auth.signInWithPopup(provider);
        } catch (popupErr) {
          const code = popupErr && popupErr.code ? String(popupErr.code) : '';
          if (code === 'auth/popup-blocked' || code === 'auth/cancelled-popup-request' || code === 'auth/popup-closed-by-user') {
            await auth.signInWithRedirect(provider);
            return;
          }
          throw popupErr;
        }
        const ok = await completeSignIn(cred && cred.user, 'Signed in with Google — redirecting...');
        if (!ok) showToast('Unable to complete sign-in. Please try again.', 'error');
      } catch (err) {
        console.error('Google sign-in error:', err);
        showToast(friendlyAuthError(err), 'error');
      } finally {
        setLoading(false);
      }
    });

    // ─── Clear errors on input ───
    [emailInput, passwordInput].forEach((input) => {
      if (!input) return;
      input.addEventListener('input', () => clearInputError(input));
      input.addEventListener('focus', () => clearInputError(input));
    });
  }

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
