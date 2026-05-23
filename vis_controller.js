(function () {
  "use strict";
  if (window.AuraVisController) return;
  const script = document.createElement("script");
  script.src = "public/vis/vis_controller.js";
  script.async = true;
  document.head.appendChild(script);
})();
