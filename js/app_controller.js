(function () {
  "use strict";
  let sessionId = crypto.randomUUID();
  let sending = false;

  window.onerror = function (message, source, lineno, colno, error) {
    window.AevraLogger && window.AevraLogger.error("frontend_error", { message: String(message), source, lineno, colno, stack: error && error.stack });
    window.AevraState && window.AevraState.setError("runtime", message);
  };

  window.onunhandledrejection = function (event) {
    const reason = event && event.reason;
    window.AevraLogger && window.AevraLogger.error("frontend_unhandled_rejection", { error: String(reason && reason.stack || reason) });
    window.AevraState && window.AevraState.setError("promise", reason);
  };

  function icon(name) { return window.AevraChatUI.icons[name] || ""; }
  async function sendText(text) {
    if (sending) return;
    const value = String(text || document.getElementById("chatInput").value || "").trim();
    if (!value) return;
    sending = true;
    window.AevraState && window.AevraState.setLoading("chat", true);
    const input = document.getElementById("chatInput");
    input.value = "";
    input.dispatchEvent(new Event("input"));
    window.AevraChatUI.addUserMessage(value);
    const done = window.AevraChatUI.addThinking();
    try {
      const res = await fetch("/personal-intelligence/ask", {
        method: "POST",
        headers: { "content-type": "application/json", "x-aevra-csrf": sessionStorage.getItem("aevra_csrf") || "browser" },
        body: JSON.stringify({ userId: "guest@student.com", message: value, sessionId }),
      });
      const payload = await res.json();
      const data = payload.data || payload;
      done();
      if (!res.ok || payload.success === false) throw new Error(payload.error || "Aevra is unavailable right now.");
      if (data.sessionId) sessionId = data.sessionId;
      window.AevraChatUI.addAevraMessage(data.response || data.answer || "Aevra is unavailable right now.");
    } catch (error) {
      done();
      window.AevraState && window.AevraState.setError("chat", error);
      window.AevraChatUI.addAevraMessage("Aevra could not reach the study service. Please try again.");
    } finally {
      sending = false;
      window.AevraState && window.AevraState.setLoading("chat", false);
    }
  }
  function init() {
    const input = document.getElementById("chatInput");
    const send = document.getElementById("sendBtn");
    if (!input || !send) return;
    send.innerHTML = icon("up");
    input.addEventListener("input", () => {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 180) + "px";
      send.disabled = !input.value.trim();
      send.classList.toggle("active", !!input.value.trim());
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send.click(); }
    });
    send.addEventListener("click", debounce(() => sendText(), 300));
    window.sendSuggestion = (button) => sendText(button.textContent);
    if (!sessionStorage.getItem("aevra_csrf")) sessionStorage.setItem("aevra_csrf", crypto.randomUUID());
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("service_worker.js").catch(() => {});
  }
  function debounce(fn, delay) {
    let timer = null;
    return function () {
      clearTimeout(timer);
      const args = arguments;
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }
  document.addEventListener("DOMContentLoaded", init);
})();
