(function () {
  let scanTimer = null;

  function isVisible(el) {
    const rect = el.getBoundingClientRect();
    if (!rect || rect.width < 24 || rect.height < 24) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    return true;
  }

  function wrapElement(el, options) {
    if (!el || el.dataset.lgWrapped === 'true') return null;
    if (!isVisible(el)) return null;
    const opts = options || {};
    const rect = el.getBoundingClientRect();
    if (!rect || rect.width < 24 || rect.height < 24) return null;

    const container = new Container({
      borderRadius: Number(opts.borderRadius || 24),
      type: opts.type || 'rounded',
      tintOpacity: typeof opts.tintOpacity === 'number' ? opts.tintOpacity : 0.22,
    });

    const style = window.getComputedStyle(el);
    container.element.classList.add('lg-wrap');
    container.element.style.position = 'relative';
    container.element.style.display = style.display === 'inline' ? 'inline-block' : 'block';
    if (rect.width > 0) container.element.style.width = rect.width + 'px';
    if (rect.height > 0) container.element.style.height = rect.height + 'px';
    container.element.style.margin = style.margin;
    container.element.style.flex = style.flex;
    container.element.style.alignSelf = style.alignSelf;
    container.element.style.justifySelf = style.justifySelf;

    el.style.margin = '0';
    el.style.width = '100%';
    el.style.height = '100%';
    el.style.background = 'transparent';
    el.dataset.lgWrapped = 'true';
    el.classList.add('lg-glass-content');

    const parent = el.parentNode;
    if (!parent) return null;
    parent.replaceChild(container.element, el);
    container.element.appendChild(el);

    const ro = new ResizeObserver(function () {
      try { container.updateSizeFromDOM(); } catch (e) {}
    });
    ro.observe(el);

    return container;
  }

  function hideLegacyGlassLayers() {
    document.querySelectorAll('.liquidGlass-effect, .liquidGlass-tint, .liquidGlass-shine').forEach(function (el) {
      el.style.display = 'none';
    });
  }

  function scanAndWrap() {
    if (!window.html2canvas || !window.Container) return;
    document.body.classList.add('liquid-glass-js');
    hideLegacyGlassLayers();

    const targets = [
      { sel: '.sidebar', radius: 22, tint: 0.18 },
      { sel: '.app-header', radius: 18, tint: 0.2 },
      { sel: '.chat', radius: 26, tint: 0.2 },
      { sel: '.welcome-panel', radius: 22, tint: 0.2 },
      { sel: '.summary-card', radius: 16, tint: 0.18 },
      { sel: '.action-button', radius: 14, tint: 0.18, type: 'pill' },
      { sel: '.composer', radius: 16, tint: 0.2 },
      { sel: '.profile-card', radius: 18, tint: 0.2 },
      { sel: '.gamification-card', radius: 18, tint: 0.2 },
      { sel: '.settings-section', radius: 18, tint: 0.2 },
      { sel: '.admin-settings-card', radius: 18, tint: 0.2 },
      { sel: '.badges-content', radius: 18, tint: 0.2 },
      { sel: '.modal-panel', radius: 16, tint: 0.25 },
    ];

    targets.forEach(function (cfg) {
      const nodes = document.querySelectorAll(cfg.sel);
      nodes.forEach(function (el) {
        wrapElement(el, {
          borderRadius: cfg.radius,
          tintOpacity: cfg.tint,
          type: cfg.type || 'rounded',
        });
      });
    });
  }

  function scheduleScan() {
    if (scanTimer) return;
    scanTimer = setTimeout(function () {
      scanTimer = null;
      scanAndWrap();
    }, 200);
  }

  function initLiquidGlass() {
    scanAndWrap();
    setTimeout(scanAndWrap, 600);
    setInterval(scanAndWrap, 4000);

    const observer = new MutationObserver(function () {
      scheduleScan();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
  }

  window.addEventListener('load', function () {
    setTimeout(initLiquidGlass, 260);
  });
})();
