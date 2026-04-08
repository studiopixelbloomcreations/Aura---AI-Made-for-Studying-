(function () {
  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  }

  function text(value, fallback) {
    const output = String(value || "").trim();
    return output || String(fallback || "");
  }

  ready(function () {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "pi-harmony-toggle";
    toggle.textContent = "Harmony";

    const panel = document.createElement("aside");
    panel.className = "pi-harmony-panel";
    panel.hidden = true;
    panel.innerHTML = `
      <div class="pi-harmony-head">
        <div class="pi-harmony-title">Harmony Debug</div>
        <div class="pi-harmony-actions">
          <button type="button" data-harmony-action="close">Close</button>
        </div>
      </div>
      <div class="pi-harmony-body">
        <section>
          <div class="pi-harmony-label">Observatory</div>
          <div class="pi-harmony-row"><span>Type</span><strong data-field="type">idle</strong></div>
          <div class="pi-harmony-row"><span>Complexity</span><strong data-field="complexity">-</strong></div>
          <div class="pi-harmony-row"><span>Queries</span><strong data-field="queries">0</strong></div>
        </section>
        <section>
          <div class="pi-harmony-label">Harmony</div>
          <div class="pi-harmony-row"><span>Model Selected</span><strong data-field="model">-</strong></div>
          <div class="pi-harmony-row"><span>Models Used</span><strong data-field="models">-</strong></div>
          <div class="pi-harmony-row"><span>Fallback</span><strong data-field="fallback">No</strong></div>
        </section>
        <section>
          <div class="pi-harmony-label">Verification</div>
          <div class="pi-harmony-row"><span>Agent</span><strong data-field="agent">-</strong></div>
          <div class="pi-harmony-row"><span>Unique ID</span><strong data-field="unique">-</strong></div>
          <div class="pi-harmony-row"><span>Verified</span><strong data-field="verified">No</strong></div>
        </section>
        <section>
          <div class="pi-harmony-label">Status</div>
          <div class="pi-harmony-status" data-field="status">Idle</div>
        </section>
      </div>
    `;

    const style = document.createElement("style");
    style.textContent = `
      .pi-harmony-toggle{position:fixed;right:18px;bottom:18px;z-index:10020;padding:10px 14px;border:0;border-radius:999px;background:#0f172a;color:#f8fafc;box-shadow:0 18px 40px rgba(15,23,42,.28);cursor:pointer;font:600 13px/1.1 system-ui,sans-serif}
      .pi-harmony-panel{position:fixed;right:18px;bottom:64px;z-index:10021;width:min(340px,calc(100vw - 24px));background:rgba(255,255,255,.98);color:#0f172a;border:1px solid rgba(15,23,42,.1);border-radius:18px;box-shadow:0 22px 60px rgba(15,23,42,.22);backdrop-filter:blur(12px);user-select:none}
      .pi-harmony-head{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid rgba(15,23,42,.08);cursor:move}
      .pi-harmony-title{font:700 14px/1.1 system-ui,sans-serif}
      .pi-harmony-actions button{border:0;background:#e2e8f0;color:#0f172a;border-radius:999px;padding:6px 10px;cursor:pointer}
      .pi-harmony-body{padding:14px;display:grid;gap:14px}
      .pi-harmony-label{font:700 11px/1.1 system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#475569;margin-bottom:8px}
      .pi-harmony-row{display:flex;justify-content:space-between;gap:12px;font:500 13px/1.4 system-ui,sans-serif;margin:4px 0}
      .pi-harmony-row strong,.pi-harmony-status{font-weight:700}
      .pi-harmony-row strong{max-width:170px;text-align:right;word-break:break-word}
      .pi-harmony-status{padding:10px 12px;border-radius:12px;background:#eff6ff;color:#1d4ed8;font:700 13px/1.2 system-ui,sans-serif}
    `;

    document.head.appendChild(style);
    document.body.appendChild(toggle);
    document.body.appendChild(panel);

    const fields = {
      type: panel.querySelector('[data-field="type"]'),
      complexity: panel.querySelector('[data-field="complexity"]'),
      queries: panel.querySelector('[data-field="queries"]'),
      model: panel.querySelector('[data-field="model"]'),
      models: panel.querySelector('[data-field="models"]'),
      fallback: panel.querySelector('[data-field="fallback"]'),
      agent: panel.querySelector('[data-field="agent"]'),
      unique: panel.querySelector('[data-field="unique"]'),
      verified: panel.querySelector('[data-field="verified"]'),
      status: panel.querySelector('[data-field="status"]'),
    };

    function flattenModels(harmony) {
      const plans = harmony && Array.isArray(harmony.query_plans) ? harmony.query_plans : [];
      const seen = new Set();
      const out = [];
      plans.forEach(function (plan) {
        const attempts = plan && Array.isArray(plan.attempts) ? plan.attempts : [];
        attempts.forEach(function (attempt) {
          const model = text(attempt && attempt.model, "");
          if (!model || seen.has(model)) return;
          seen.add(model);
          out.push(model);
        });
      });
      if (!out.length) {
        const single = text(harmony && harmony.model_used, "");
        if (single) out.push(single);
      }
      return out.join(", ") || "-";
    }

    function deriveComplexity(observatory, harmony) {
      const direct = text(observatory && observatory.complexity, "");
      if (direct) return direct;
      const plans = harmony && Array.isArray(harmony.query_plans) ? harmony.query_plans : [];
      if (plans.some(function (plan) { return text(plan && plan.complexity, "") === "high"; })) return "high";
      if (plans.some(function (plan) { return text(plan && plan.complexity, "") === "medium"; })) return "medium";
      if (plans.some(function (plan) { return text(plan && plan.complexity, "") === "low"; })) return "low";
      return "-";
    }

    function setState(detail) {
      const observatory = detail && detail.observatory || {};
      const harmony = detail && (detail.agent_harmony || detail.harmony) || {};
      const agent = detail && detail.agent || {};
      fields.type.textContent = text(observatory.type, "idle");
      fields.complexity.textContent = deriveComplexity(observatory, harmony);
      fields.queries.textContent = String((observatory.queries && observatory.queries.length) || 0);
      fields.model.textContent = text(
        harmony.model_used && String(harmony.model_used).replace(/^agent_harmony:/, ""),
        detail && detail.ai_provider ? String(detail.ai_provider).replace(/^agent_harmony:/, "") : "-"
      );
      fields.models.textContent = flattenModels(harmony);
      fields.fallback.textContent = harmony.fallback_used ? "Yes" : "No";
      fields.agent.textContent = text(agent.user_id, "-");
      fields.unique.textContent = text(agent.unique_id, "-");
      fields.verified.textContent = agent.profile_verified ? "Yes" : "No";
      fields.status.textContent = text(detail && detail.status, "Idle");
    }

    toggle.addEventListener("click", function () {
      panel.hidden = !panel.hidden;
    });

    panel.querySelector('[data-harmony-action="close"]').addEventListener("click", function () {
      panel.hidden = true;
    });

    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;
    const head = panel.querySelector(".pi-harmony-head");
    head.addEventListener("pointerdown", function (event) {
      dragging = true;
      const rect = panel.getBoundingClientRect();
      offsetX = event.clientX - rect.left;
      offsetY = event.clientY - rect.top;
      head.setPointerCapture(event.pointerId);
    });
    head.addEventListener("pointermove", function (event) {
      if (!dragging) return;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      panel.style.left = `${Math.max(8, event.clientX - offsetX)}px`;
      panel.style.top = `${Math.max(8, event.clientY - offsetY)}px`;
    });
    head.addEventListener("pointerup", function (event) {
      dragging = false;
      try { head.releasePointerCapture(event.pointerId); } catch (error) {}
    });

    window.addEventListener("pi:harmony-debug", function (event) {
      setState(event && event.detail || {});
    });

    setState({ status: "Idle", observatory: {}, harmony: {} });
  });
})();
