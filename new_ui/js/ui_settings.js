(function () {
  "use strict";
  let panel;
  function open() {
    if (!panel) {
      panel = document.createElement("section");
      panel.className = "panel";
      panel.innerHTML = '<h2>Settings</h2><label class="field">Display name<input id="displayName" value="Student"></label><label class="field">Theme<button class="btn-outline" type="button" id="themeToggle">Toggle theme</button></label><label class="field">Tone<input type="range" min="1" max="10" value="6"></label><label class="field">Humor<input type="range" min="1" max="10" value="5"></label><button class="btn-outline" type="button">Reset voice profile</button><p><a href="login.html">Sign out</a></p>';
      document.body.appendChild(panel);
      panel.querySelector("#themeToggle").addEventListener("click", () => window.AevraTheme.toggle());
    }
    panel.classList.add("open");
  }
  window.AevraSettingsUI = { open };
})();
