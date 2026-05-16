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
    toggle.textContent = "NCS";

    const panel = document.createElement("aside");
    panel.className = "pi-harmony-panel";
    panel.hidden = true;
    panel.innerHTML = `
      <div class="pi-harmony-head">
          <div class="pi-harmony-title">Aevra NCS Live</div>
        <div class="pi-harmony-actions">
          <button type="button" data-harmony-action="collapse">Collapse</button>
          <button type="button" data-harmony-action="detach">Detach</button>
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
          <div class="pi-harmony-label">Neural Command System</div>
          <div class="pi-harmony-row"><span>Workflow</span><strong data-field="workflow">idle</strong></div>
          <div class="pi-harmony-row"><span>Confidence</span><strong data-field="confidence">0%</strong></div>
          <div class="pi-harmony-row"><span>Manipulation</span><strong data-field="manipulation">-</strong></div>
        </section>
        <section>
          <div class="pi-harmony-label">Harmony</div>
          <div class="pi-harmony-row"><span>Model Selected</span><strong data-field="model">-</strong></div>
          <div class="pi-harmony-row"><span>Models Used</span><strong data-field="models">-</strong></div>
          <div class="pi-harmony-row"><span>Fallback</span><strong data-field="fallback">No</strong></div>
          <div class="pi-harmony-row"><span>Fusion</span><strong data-field="fusion">idle</strong></div>
          <div class="pi-harmony-chain" data-field="chain">No routing chain yet.</div>
        </section>
        <section>
          <div class="pi-harmony-label">Verification</div>
          <div class="pi-harmony-row"><span>Agent</span><strong data-field="agent">-</strong></div>
          <div class="pi-harmony-row"><span>Unique ID</span><strong data-field="unique">-</strong></div>
          <div class="pi-harmony-row"><span>Verified</span><strong data-field="verified">No</strong></div>
        </section>
        <section>
          <div class="pi-harmony-label">Memory</div>
          <div class="pi-harmony-row"><span>Retrieved</span><strong data-field="memory">-</strong></div>
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
      .pi-harmony-panel{position:fixed;right:18px;bottom:64px;z-index:10021;width:min(380px,calc(100vw - 24px));min-width:280px;min-height:220px;max-height:calc(100vh - 84px);overflow:auto;resize:both;background:linear-gradient(135deg,rgba(255,255,255,.92),rgba(232,249,255,.82));color:#0f172a;border:1px solid rgba(125,92,255,.22);border-radius:16px;box-shadow:0 22px 60px rgba(15,23,42,.22);backdrop-filter:blur(18px);user-select:none}
      .pi-harmony-panel.is-collapsed .pi-harmony-body{display:none}
      .pi-harmony-panel.is-detached{left:50%;top:14px;right:auto;bottom:auto;transform:translateX(-50%);width:min(720px,calc(100vw - 24px))}
      .pi-harmony-head{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid rgba(15,23,42,.08);cursor:move}
      .pi-harmony-title{font:700 14px/1.1 system-ui,sans-serif}
      .pi-harmony-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
      .pi-harmony-actions button{border:0;background:rgba(15,23,42,.08);color:#0f172a;border-radius:999px;padding:6px 10px;cursor:pointer}
      .pi-harmony-body{padding:14px;display:grid;gap:14px}
      .pi-harmony-label{font:700 11px/1.1 system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#475569;margin-bottom:8px}
      .pi-harmony-row{display:flex;justify-content:space-between;gap:12px;font:500 13px/1.4 system-ui,sans-serif;margin:4px 0}
      .pi-harmony-row strong,.pi-harmony-status{font-weight:700}
      .pi-harmony-row strong{max-width:170px;text-align:right;word-break:break-word}
      .pi-harmony-status{padding:10px 12px;border-radius:12px;background:#eff6ff;color:#1d4ed8;font:700 13px/1.2 system-ui,sans-serif}
      .pi-harmony-chain{padding:9px 10px;border-radius:10px;background:rgba(15,23,42,.05);font:600 12px/1.35 system-ui,sans-serif;color:#334155;word-break:break-word}
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
      workflow: panel.querySelector('[data-field="workflow"]'),
      confidence: panel.querySelector('[data-field="confidence"]'),
      manipulation: panel.querySelector('[data-field="manipulation"]'),
      fusion: panel.querySelector('[data-field="fusion"]'),
      chain: panel.querySelector('[data-field="chain"]'),
      memory: panel.querySelector('[data-field="memory"]'),
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

    function selectPrimaryModel(harmony, detail) {
      const plans = harmony && Array.isArray(harmony.query_plans) ? harmony.query_plans : [];
      for (let i = 0; i < plans.length; i += 1) {
        const attempts = plans[i] && Array.isArray(plans[i].attempts) ? plans[i].attempts : [];
        const okAttempt = attempts.find(function (attempt) { return !!(attempt && attempt.ok); });
        if (okAttempt && okAttempt.model) return String(okAttempt.model);
        if (plans[i] && plans[i].model_used) return String(plans[i].model_used);
      }
      const harmonyModel = text(harmony && harmony.model_used, "");
      if (harmonyModel && harmonyModel !== "agent_harmony") return harmonyModel.replace(/^agent_harmony:/, "");
      const provider = text(detail && detail.ai_provider, "");
      if (provider) return provider.replace(/^agent_harmony:/, "");
      return "-";
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
      fields.model.textContent = selectPrimaryModel(harmony, detail);
      fields.models.textContent = flattenModels(harmony);
      fields.fallback.textContent = harmony.fallback_used ? "Yes" : "No";
      const ncs = detail && (detail.ncs || (harmony && harmony.ncs)) || {};
      const ncsState = ncs.system_state || {};
      const blueprint = ncs.cognitive_blueprint || {};
      fields.workflow.textContent = text(ncsState.systemType, "idle");
      fields.confidence.textContent = Math.round(Number(ncsState.confidence || 0) * 100) + "%";
      fields.manipulation.textContent = text(blueprint.reasoning_depth || blueprint.collaboration_mode, "-");
      fields.fusion.textContent = flattenModels(harmony).includes(",") ? "response fusion" : "verified single";
      fields.chain.textContent = (harmony.query_plans || []).map(function (plan) {
        return [plan.type, plan.model_used, plan.fallback_used ? "fallback" : ""].filter(Boolean).join(" -> ");
      }).join(" | ") || "No routing chain yet.";
      fields.memory.textContent = Object.keys((detail && (detail.memory_updates || detail.learned_facts)) || {}).slice(0, 4).join(", ") || "-";
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
    panel.querySelector('[data-harmony-action="collapse"]').addEventListener("click", function () {
      panel.classList.toggle("is-collapsed");
    });
    panel.querySelector('[data-harmony-action="detach"]').addEventListener("click", function () {
      panel.classList.toggle("is-detached");
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
    window.addEventListener("aevra:harmony-state", function (event) {
      const live = event && event.detail || {};
      setState({
        status: "Live",
        ncs: live.ncs,
        harmony: {
          model_used: live.models && live.models[0],
          query_plans: (live.routing || []).map(function (item) {
            return Object.assign({}, item, { attempts: [{ ok: true, model: item.model_used }] });
          }),
        },
      });
    });

    setState({ status: "Idle", observatory: {}, harmony: {} });
  });
})();
