(function (global) {
  "use strict";

  const listeners = new Set();
  const state = {
    currentUser: null,
    session: null,
    aiMode: "standard",
    loading: {},
    errors: {},
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function emit() {
    const snapshot = getState();
    listeners.forEach((listener) => {
      try { listener(snapshot); } catch (error) {}
    });
  }

  function getState() {
    return clone(state);
  }

  function set(partial) {
    Object.assign(state, partial || {});
    emit();
    return getState();
  }

  function setCurrentUser(user) { return set({ currentUser: user || null }); }
  function setSession(session) { return set({ session: session || null }); }
  function setAiMode(aiMode) { return set({ aiMode: aiMode || "standard" }); }

  function setLoading(key, value) {
    state.loading[key] = !!value;
    emit();
  }

  function setError(key, error) {
    if (error) state.errors[key] = String(error && error.message ? error.message : error);
    else delete state.errors[key];
    emit();
  }

  function subscribe(listener) {
    if (typeof listener === "function") listeners.add(listener);
    return () => listeners.delete(listener);
  }

  const api = { getState, set, setCurrentUser, setSession, setAiMode, setLoading, setError, subscribe };
  global.AevraState = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
