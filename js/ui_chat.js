(function () {
  "use strict";
  const icons = {
    copy: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    speaker: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15 9a5 5 0 0 1 0 6"/></svg>',
    up: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>',
    down: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m19 12-7 7-7-7"/><path d="M12 5v14"/></svg>',
  };
  function escapeHtml(text) {
    return String(text || "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  }
  function renderMarkdown(text) {
    return escapeHtml(text)
      .replace(/```([\s\S]*?)```/g, "<pre><code>$1</code></pre>")
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\n/g, "<br>");
  }
  function addUserMessage(text) {
    const root = document.getElementById("messages");
    const welcome = root.querySelector(".welcome-screen");
    if (welcome) welcome.remove();
    root.insertAdjacentHTML("beforeend", `<div class="message user-message"><div class="message-bubble"><p>${escapeHtml(text)}</p></div></div>`);
    root.scrollTop = root.scrollHeight;
  }
  function addAevraMessage(text) {
    const root = document.getElementById("messages");
    root.insertAdjacentHTML("beforeend", `<div class="message aevra-message"><div class="aevra-avatar"><img src="assets/logo_aevra.svg" alt=""></div><div class="message-content">${renderMarkdown(text)}<div class="message-actions"><button title="Copy">${icons.copy}</button><button title="Read aloud">${icons.speaker}</button><button title="Good response">${icons.up}</button><button title="Bad response">${icons.down}</button></div></div></div>`);
    root.scrollTop = root.scrollHeight;
  }
  function addThinking() {
    const root = document.getElementById("messages");
    const id = "thinking-" + Date.now();
    root.insertAdjacentHTML("beforeend", `<div id="${id}" class="message aevra-message"><div class="aevra-avatar"><img src="assets/logo_aevra.svg" alt=""></div><div class="message-content thinking"><span></span><span></span><span></span></div></div>`);
    root.scrollTop = root.scrollHeight;
    return () => { const el = document.getElementById(id); if (el) el.remove(); };
  }
  window.AevraChatUI = { addUserMessage, addAevraMessage, addThinking, icons };
})();
