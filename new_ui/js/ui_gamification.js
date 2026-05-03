(function () {
  "use strict";
  let panel;
  function open() {
    if (!panel) {
      panel = document.createElement("section");
      panel.className = "panel";
      panel.innerHTML = '<h2>My Progress</h2><div class="feature-card"><strong id="pointsTotal">0</strong><p>points earned</p></div><div class="feature-card"><strong id="streakDays">0</strong><p>day streak</p></div><canvas id="weeklyChart" width="340" height="160" aria-label="Weekly study chart"></canvas>';
      document.body.appendChild(panel);
      draw();
    }
    panel.classList.add("open");
  }
  function draw() {
    const canvas = document.getElementById("weeklyChart");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const values = [20, 42, 28, 64, 58, 72, 50];
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    values.forEach((v, i) => {
      ctx.fillStyle = i % 2 ? "#06B6D4" : "#8B5CF6";
      ctx.fillRect(18 + i * 45, 140 - v, 28, v);
    });
  }
  window.AevraGamificationUI = { open };
})();
