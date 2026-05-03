(function () {
  "use strict";
  function initSidebar() {
    const sidebar = document.querySelector(".sidebar");
    const hamburger = document.querySelector(".hamburger-btn");
    if (hamburger && sidebar) hamburger.addEventListener("click", () => sidebar.classList.toggle("open"));
    document.querySelector(".new-chat-btn")?.addEventListener("click", () => location.href = "app.html");
    document.querySelector(".exam-mode-btn")?.addEventListener("click", () => window.AevraExamUI.toggle());
    window.showProgress = () => window.AevraGamificationUI.open();
    window.showSettings = () => window.AevraSettingsUI.open();
  }
  document.addEventListener("DOMContentLoaded", initSidebar);
})();
