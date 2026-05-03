(function () {
  "use strict";
  let sessionId = crypto.randomUUID();
  function icon(name) { return window.AevraChatUI.icons[name] || ""; }
  async function sendText(text) {
    const value = String(text || document.getElementById("chatInput").value || "").trim();
    if (!value) return;
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
      const data = await res.json();
      done();
      window.AevraChatUI.addAevraMessage(data.response || data.answer || data.error || "Aevra is unavailable right now.");
    } catch (error) {
      done();
      window.AevraChatUI.addAevraMessage("Aevra could not reach the study service. Please try again.");
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
    send.addEventListener("click", () => sendText());
    window.sendSuggestion = (button) => sendText(button.textContent);
    if (!sessionStorage.getItem("aevra_csrf")) sessionStorage.setItem("aevra_csrf", crypto.randomUUID());
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("service_worker.js").catch(() => {});
  }
  document.addEventListener("DOMContentLoaded", init);
})();
