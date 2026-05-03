(function () {
  "use strict";
  const KEY = "aevra_theme";
  function apply(theme) {
    document.body.classList.toggle("light", theme === "light");
    localStorage.setItem(KEY, theme);
  }
  window.AevraTheme = {
    init() { apply(localStorage.getItem(KEY) || "dark"); },
    toggle() { apply(document.body.classList.contains("light") ? "dark" : "light"); },
  };
  document.addEventListener("DOMContentLoaded", () => window.AevraTheme.init());
})();
