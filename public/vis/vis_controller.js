(function (global) {
  "use strict";

  const controller = new EventTarget();

  function init() {
    queueMicrotask(() => controller.dispatchEvent(new CustomEvent("ready", { detail: { success: true } })));
    return Promise.resolve({ success: true, data: { mode: "compatibility" }, error: null });
  }

  function on(type, callback) {
    controller.addEventListener(type, (event) => callback(event.detail));
  }

  global.AevraVisController = { init, on };
})(window);
