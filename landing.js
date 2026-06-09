(function () {
  var TOKEN_KEY = 'g9_token';
  var TOKEN_EXP_KEY = 'g9_token_exp';
  var THEME_KEY = 'tutor_landing_theme';
  var systemQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function isTokenValid() {
    try {
      var token = localStorage.getItem(TOKEN_KEY);
      var expRaw = localStorage.getItem(TOKEN_EXP_KEY);
      var exp = expRaw ? parseInt(expRaw, 10) : 0;
      if (!token || !exp) return false;
      return Date.now() < (exp - 60000);
    } catch (e) {
      return false;
    }
  }

  function launchAuraAI() {
    // Local dev: Vite dev server on port 5173; Production: app.html is the real React app
    var isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (isLocal) {
      window.location.href = 'http://localhost:5173';
    } else {
      window.location.href = 'app.html';
    }
  }

  function getSystemTheme() {
    if (!systemQuery) return 'dark';
    return systemQuery.matches ? 'dark' : 'light';
  }

  function setThemeTransition() {
    var root = document.documentElement;
    root.classList.add('theme-animating');
    window.setTimeout(function () {
      root.classList.remove('theme-animating');
    }, 420);
  }

  function applyTheme(mode, withAnimation) {
    var root = document.documentElement;
    var theme = mode === 'system' ? getSystemTheme() : (mode === 'light' ? 'light' : 'dark');
    if (withAnimation) setThemeTransition();
    root.setAttribute('data-theme', theme);
    root.setAttribute('data-theme-mode', mode);
    try { localStorage.setItem(THEME_KEY, mode); } catch (e) {}
    var themeBtn = document.getElementById('themeToggle');
    if (themeBtn) {
      if (mode === 'system') {
        themeBtn.textContent = 'Theme: System';
      } else if (mode === 'light') {
        themeBtn.textContent = 'Theme: Light';
      } else {
        themeBtn.textContent = 'Theme: Dark';
      }
    }
  }

  function initTheme() {
    var stored = null;
    try { stored = localStorage.getItem(THEME_KEY); } catch (e) {}
    var mode = stored || 'system';
    applyTheme(mode, false);
    if (systemQuery && systemQuery.addEventListener) {
      systemQuery.addEventListener('change', function () {
        var currentMode = document.documentElement.getAttribute('data-theme-mode') || 'system';
        if (currentMode === 'system') applyTheme('system', true);
      });
    }
  }

  function initReveal() {
    var reveals = document.querySelectorAll('.lp-reveal');
    if (!('IntersectionObserver' in window) || !reveals.length) {
      reveals.forEach(function (node) { node.classList.add('lp-reveal-on'); });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('lp-reveal-on');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });

    reveals.forEach(function (node, idx) {
      node.style.transitionDelay = (idx * 65) + 'ms';
      observer.observe(node);
    });
  }

  function initInteractiveOrbs() {
    var orbs = document.querySelectorAll('.lp-orb');
    if (!orbs.length) return;

    var mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    window.addEventListener('pointermove', function (ev) {
      mouse.x = ev.clientX;
      mouse.y = ev.clientY;
      orbs.forEach(function (orb, idx) {
        var offset = (idx + 1) * 0.015;
        var tx = (mouse.x - window.innerWidth / 2) * offset;
        var ty = (mouse.y - window.innerHeight / 2) * offset;
        orb.style.transform = 'translate(' + tx.toFixed(2) + 'px,' + ty.toFixed(2) + 'px)';
      });
    });
  }

  function initParticleField() {
    var canvas = document.getElementById('lpParticleField');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    var dpr = Math.max(1, window.devicePixelRatio || 1);
    var width = 0;
    var height = 0;
    var particles = [];
    var count = 110;
    var mouse = { x: -9999, y: -9999, active: false };

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      particles = [];
      for (var i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.7,
          vy: (Math.random() - 0.5) * 0.7,
          r: 1.1 + Math.random() * 2.3
        });
      }
    }

    function tick() {
      ctx.clearRect(0, 0, width, height);
      var isLight = document.documentElement.getAttribute('data-theme') === 'light';
      ctx.fillStyle = isLight ? 'rgba(12, 39, 70, 0.58)' : 'rgba(150, 235, 255, 0.62)';
      ctx.strokeStyle = isLight ? 'rgba(12, 39, 70, 0.16)' : 'rgba(150, 235, 255, 0.14)';

      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        if (mouse.active) {
          var dx = p.x - mouse.x;
          var dy = p.y - mouse.y;
          var distSq = dx * dx + dy * dy;
          var radius = 135;
          if (distSq < radius * radius && distSq > 0.01) {
            var dist = Math.sqrt(distSq);
            var force = (radius - dist) / radius;
            p.vx += (dx / dist) * force * 0.22;
            p.vy += (dy / dist) * force * 0.22;
          }
        }

        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.985;
        p.vy *= 0.985;

        if (p.x < -20) p.x = width + 20;
        if (p.x > width + 20) p.x = -20;
        if (p.y < -20) p.y = height + 20;
        if (p.y > height + 20) p.y = -20;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      for (var a = 0; a < particles.length; a++) {
        for (var b = a + 1; b < particles.length; b++) {
          var pa = particles[a];
          var pb = particles[b];
          var ddx = pa.x - pb.x;
          var ddy = pa.y - pb.y;
          var d2 = ddx * ddx + ddy * ddy;
          if (d2 < 95 * 95) {
            var alpha = 1 - (Math.sqrt(d2) / 95);
            ctx.globalAlpha = alpha * 0.55;
            ctx.beginPath();
            ctx.moveTo(pa.x, pa.y);
            ctx.lineTo(pb.x, pb.y);
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
        }
      }

      window.requestAnimationFrame(tick);
    }

    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', function (ev) {
      mouse.active = true;
      mouse.x = ev.clientX;
      mouse.y = ev.clientY;
    });
    window.addEventListener('pointerleave', function () {
      mouse.active = false;
      mouse.x = -9999;
      mouse.y = -9999;
    });

    resize();
    tick();
  }

  document.addEventListener('DOMContentLoaded', function () {
    initTheme();
    initReveal();
    initInteractiveOrbs();
    initParticleField();

    var launchButtons = [
      document.getElementById('launchAuraAIBtn'),
      document.getElementById('launchAuraAIBtn2')
    ];
    document.querySelectorAll('.launch-now').forEach(function (btn) { launchButtons.push(btn); });
    launchButtons.forEach(function (btn) {
      if (btn) btn.addEventListener('click', launchAuraAI);
    });

    var themeBtn = document.getElementById('themeToggle');
    if (themeBtn) {
      themeBtn.addEventListener('click', function () {
        var currentMode = document.documentElement.getAttribute('data-theme-mode') || 'system';
        var nextMode = currentMode === 'system' ? 'light' : (currentMode === 'light' ? 'dark' : 'system');
        applyTheme(nextMode, true);
      });
    }
  });
})();
