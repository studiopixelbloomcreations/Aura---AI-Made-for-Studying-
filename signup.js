/* AURA AI — Signup Controller
   Firebase auth flow preserved. UI layer completely new. */
(function () {
  'use strict';

  // ─── Constants ───
  const TOKEN_KEY = 'g9_token';
  const TOKEN_EXP_KEY = 'g9_token_exp';

  // ─── DOM refs ───
  const form = document.getElementById('signupForm');
  const nameInput = document.getElementById('name');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const confirmInput = document.getElementById('confirm');
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
  function getReturnTarget() {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('return') || 'app.html';
    } catch (e) {
      return 'app.html';
    }
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
    if (code === 'auth/email-already-in-use') return 'An account with this email already exists.';
    if (code === 'auth/invalid-email') return 'Please enter a valid email address.';
    if (code === 'auth/weak-password') return 'Password is too weak. Use at least 6 characters.';
    if (code === 'auth/network-request-failed') return 'Network error. Check your connection.';
    if (code === 'auth/popup-blocked') return 'Popup was blocked. Allow popups and try again.';
    if (code === 'auth/popup-closed-by-user') return 'Popup closed. Please try again.';
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
      if (confirmInput) confirmInput.type = visible ? 'text' : 'password';
      togglePassword.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
      if (eyeIcon) {
        eyeIcon.innerHTML = visible
          ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'
          : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
      }
    });
  }

  // ─── Init ───
  async function init() {
    // Wait for Firebase to be fully initialized before doing anything
    let runtime = null;
    try {
      if (window.FirebaseConfig && window.FirebaseConfig.ensureInitialized) {
        runtime = await window.FirebaseConfig.ensureInitialized();
      } else if (window.FirebaseRuntimeConfig && window.FirebaseRuntimeConfig.ensureInitialized) {
        runtime = await window.FirebaseRuntimeConfig.ensureInitialized();
      }
    } catch (e) {
      console.error('Firebase config error:', e);
      showToast('Signup is unavailable: Firebase config failed to load.', 'error');
      return;
    }

    // Get auth instance — guaranteed initialized at this point
    auth = (runtime && runtime.auth) || window.auth || null;
    if (!auth && runtime && !runtime.skipped) {
      try { auth = firebase.auth(); } catch (e) { /* not initialized */ }
    }
    if (!auth) {
      showToast('Signup is unavailable: Firebase not initialized. Check /api/public-config.', 'error');
      return;
    }

    // Setup UI
    setupPasswordToggle();

    // Handle redirect result
    try {
      const res = await auth.getRedirectResult();
      if (res && res.user) {
        const ok = await storeTokenFromUser(res.user);
        if (ok) {
          showToast('Account ready — redirecting...', 'success');
          setTimeout(() => { window.location.href = getReturnTarget(); }, 900);
        }
      }
    } catch (e) {
      console.error('Signup redirect error:', e);
    }

    // ─── Form Submit ───
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (isLoading) return;

      const name = nameInput.value.trim();
      const email = emailInput.value.trim();
      const password = passwordInput.value;
      const confirm = confirmInput.value;

      // Clear previous errors
      [nameInput, emailInput, passwordInput, confirmInput].forEach(clearInputError);

      // Validate
      let hasError = false;
      if (!name) {
        setInputError(nameInput, 'Name is required');
        hasError = true;
      }
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
      if (!confirm) {
        setInputError(confirmInput, 'Please confirm your password');
        hasError = true;
      } else if (password !== confirm) {
        setInputError(confirmInput, 'Passwords do not match');
        hasError = true;
      }
      if (hasError) return;

      setLoading(true);
      try {
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        if (cred.user) {
          await cred.user.updateProfile({ displayName: name });
          try {
            await cred.user.sendEmailVerification();
            showToast('Verification email sent.', 'success');
          } catch (e) {
            console.warn('Verification email failed', e);
          }
        }
        await storeTokenFromUser(cred && cred.user);
        showToast('Account created — redirecting...', 'success');
        setTimeout(() => { window.location.href = getReturnTarget(); }, 1000);
      } catch (err) {
        showToast(friendlyAuthError(err), 'error');
      } finally {
        setLoading(false);
      }
    });

    // ─── Google Sign Up ───
    googleBtn.addEventListener('click', async () => {
      if (isLoading) return;
      setLoading(true);
      try {
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
        const ok = await storeTokenFromUser(cred && cred.user);
        if (!ok) {
          showToast('Unable to complete signup. Please try again.', 'error');
          return;
        }
        showToast('Account ready — redirecting...', 'success');
        setTimeout(() => { window.location.href = getReturnTarget(); }, 900);
      } catch (err) {
        showToast(friendlyAuthError(err), 'error');
      } finally {
        setLoading(false);
      }
    });

    // ─── Clear errors on input ───
    [nameInput, emailInput, passwordInput, confirmInput].forEach((input) => {
      if (!input) return;
      input.addEventListener('input', () => clearInputError(input));
      input.addEventListener('focus', () => clearInputError(input));
    });

    // ─── Enter key submits ───
    [nameInput, emailInput, passwordInput, confirmInput].forEach((el) => {
      if (!el) return;
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') form.dispatchEvent(new Event('submit', { cancelable: true }));
      });
    });
  }

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
