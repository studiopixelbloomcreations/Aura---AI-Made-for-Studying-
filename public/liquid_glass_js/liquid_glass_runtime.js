(function () {
  function wrapElement(el, options) {
    if (!el || el.dataset.lgWrapped === 'true') return null;
    const opts = options || {};
    const rect = el.getBoundingClientRect();
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

  function initLiquidGlass() {
    if (!window.html2canvas || !window.Container) return;
    document.body.classList.add('liquid-glass-js');

    const targets = [
      { sel: '.pi-panel', radius: 28, tint: 0.24 },
      { sel: '.pi-sidebar', radius: 22, tint: 0.18 },
      { sel: '.pi-header', radius: 20, tint: 0.2 },
      { sel: '.pi-main', radius: 24, tint: 0.18 },
      { sel: '.pi-composer', radius: 18, tint: 0.2 },
      { sel: '.pi-top-status', radius: 14, tint: 0.16, type: 'pill' },
      { sel: '.pi-mode-toggle', radius: 16, tint: 0.18, type: 'pill' },
      { sel: '.pi-quick-actions', radius: 18, tint: 0.2 },
      { sel: '.pi-vis-setup', radius: 18, tint: 0.22 },
      { sel: '.pi-vis-test', radius: 18, tint: 0.22 },
      { sel: '.pi-vis-personalize', radius: 18, tint: 0.22 },
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

  window.addEventListener('load', function () {
    setTimeout(initLiquidGlass, 240);
  });
})();
