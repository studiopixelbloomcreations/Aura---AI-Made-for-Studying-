document.addEventListener("DOMContentLoaded", async () => {
  const form = document.getElementById("loginForm");
  const toast = document.getElementById("toast");

  const TOKEN_KEY = "g9_token";
  const TOKEN_EXP_KEY = "g9_token_exp";
  const LOGIN_RETURN_KEY = "g9_login_return_target";
  const LOGIN_FLOW_KEY = "g9_login_flow_started";

  function sanitizeReturnTarget(target) {
    const raw = String(target || "").trim();
    if (!raw) return "app.html";
    if (/^https?:\/\//i.test(raw) || raw.startsWith("//")) return "app.html";
    const clean = raw.replace(/^\/+/, "");
    return clean || "app.html";
  }

  function getReturnTarget() {
    try {
      const params = new URLSearchParams(window.location.search);
      const fromQuery = params.get("return");
      if (fromQuery) return sanitizeReturnTarget(fromQuery);
    } catch (e) {}

    try {
      const stored = localStorage.getItem(LOGIN_RETURN_KEY);
      if (stored) return sanitizeReturnTarget(stored);
    } catch (e) {}

    return "app.html";
  }

  function persistReturnTarget() {
    try {
      localStorage.setItem(LOGIN_RETURN_KEY, getReturnTarget());
    } catch (e) {}
  }

  function markLoginFlowStarted() {
    try {
      localStorage.setItem(LOGIN_FLOW_KEY, "1");
    } catch (e) {}
  }

  function consumeLoginFlowStarted() {
    try {
      const v = localStorage.getItem(LOGIN_FLOW_KEY) === "1";
      localStorage.removeItem(LOGIN_FLOW_KEY);
      return v;
    } catch (e) {
      return false;
    }
  }

  function clearReturnTarget() {
    try {
      localStorage.removeItem(LOGIN_RETURN_KEY);
    } catch (e) {}
  }

  function redirectToAppTarget(delayMs) {
    const target = getReturnTarget();
    clearReturnTarget();
    setTimeout(() => {
      window.location.href = target;
    }, Number(delayMs || 0));
  }

  async function storeTokenFromUser(user) {
    if (!user) return false;
    try {
      const res = await user.getIdTokenResult(true);
      const expMs = Date.parse(res.expirationTime);
      localStorage.setItem(TOKEN_KEY, res.token);
      localStorage.setItem(TOKEN_EXP_KEY, String(expMs));
      return true;
    } catch (e) {
      return false;
    }
  }

  function showToast(message) {
    toast.textContent = message;
    toast.hidden = false;
    toast.style.opacity = "1";
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => (toast.hidden = true), 400);
    }, 2400);
  }

  function friendlyAuthError(err) {
    const code = err && err.code ? String(err.code) : "";
    if (code === "auth/unauthorized-domain") return "This site is not allowed in Firebase. Add your Netlify domain to Firebase Auth Settings Authorized domains.";
    if (code === "auth/popup-blocked") return "Popup was blocked. Allow popups for this site and try again.";
    if (code === "auth/popup-closed-by-user") return "Popup closed. Please try again.";
    if (code === "auth/cancelled-popup-request") return "Login was interrupted. Please try again.";
    if (code === "auth/network-request-failed") return "Network error. Please check your connection and try again.";
    if (code) return code;
    return err && err.message ? String(err.message) : "Sign-in failed";
  }

  try {
    if (window.FirebaseRuntimeConfig && window.FirebaseRuntimeConfig.ensureInitialized) {
      await window.FirebaseRuntimeConfig.ensureInitialized();
    }
  } catch (e) {
    console.error("Firebase runtime config error:", e);
    showToast("Login is unavailable: Firebase config missing.");
    return;
  }

  const auth = window.auth || (window.firebase && firebase.auth ? firebase.auth() : null);
  if (!auth) {
    showToast("Login is unavailable: Firebase not initialized.");
    return;
  }

  async function ensurePersistence() {
    try {
      await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    } catch (e) {}
  }

  async function completeSignIn(user, message) {
    const ok = await storeTokenFromUser(user);
    if (!ok) {
      showToast("Unable to complete sign-in. Please try again.");
      return false;
    }
    showToast(message || "Signed in - redirecting...");
    redirectToAppTarget(700);
    return true;
  }

  persistReturnTarget();
  const continueAevraAILink = document.getElementById("continueAevraAILink");
  if (continueAevraAILink) {
    continueAevraAILink.setAttribute("href", getReturnTarget());
  }

  try {
    await ensurePersistence();
    const res = await auth.getRedirectResult();
    const flowStarted = consumeLoginFlowStarted();
    if (res && res.user && flowStarted) {
      await completeSignIn(res.user, "Signed in - redirecting...");
    }
  } catch (err) {
    console.error("Redirect sign-in error:", err);
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = form.email.value.trim();
    const pass = form.password.value;

    if (!email) return showToast("Please enter your email.");
    if (!pass || pass.length < 6) return showToast("Password must be at least 6 characters.");

    try {
      if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
        firebase.auth().settings.appVerificationDisabledForTesting = true;
      }

      await ensurePersistence();
      markLoginFlowStarted();
      const cred = await auth.signInWithEmailAndPassword(email, pass);
      const ok = await completeSignIn(cred && cred.user, "Signed in - redirecting...");
      if (!ok) showToast("Unable to sign in. Please try again.");
    } catch (err) {
      console.error("Login error:", err);
      let errorMessage = "Sign-in failed";
      if (err.code === "auth/user-not-found") {
        errorMessage = "User not found. Please check your email.";
      } else if (err.code === "auth/wrong-password") {
        errorMessage = "Incorrect password. Please try again.";
      } else if (err.code === "auth/too-many-requests") {
        errorMessage = "Too many failed attempts. Please try again later.";
      } else if (err.message) {
        errorMessage = err.message;
      }
      showToast(errorMessage);
    }
  });

  document.querySelectorAll('.btn-social[data-provider="google"]').forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
          firebase.auth().settings.appVerificationDisabledForTesting = true;
        }

        await ensurePersistence();
        persistReturnTarget();
        markLoginFlowStarted();

        const provider = new firebase.auth.GoogleAuthProvider();
        provider.addScope("email");
        let cred = null;

        try {
          cred = await auth.signInWithPopup(provider);
        } catch (popupErr) {
          const code = popupErr && popupErr.code ? String(popupErr.code) : "";
          if (code === "auth/popup-blocked" || code === "auth/cancelled-popup-request" || code === "auth/popup-closed-by-user") {
            await auth.signInWithRedirect(provider);
            return;
          }
          throw popupErr;
        }

        const ok = await completeSignIn(cred && cred.user, "Signed in with Google - redirecting...");
        if (!ok) showToast("Unable to complete sign-in. Please try again.");
      } catch (err) {
        console.error("Google sign-in error:", err);
        showToast(friendlyAuthError(err));
      }
    });
  });

  auth.onAuthStateChanged((user) => {
    if (user) {
      console.log("User signed in:", user.email || user.displayName);
    } else {
      console.log("No user signed in");
    }
  });
});
