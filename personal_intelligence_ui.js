(function () {
  const launchBtn = document.getElementById("personalIntelligenceTab");
  if (!launchBtn) return;

  const HISTORY_KEY = "pcos_pi_history_v2";
  const FACTS_KEY = "pcos_pi_facts_v2";
  const MODEL_KEY = "pi_model";
  const DEFAULT_MODEL = "gemini-3-pro-preview";
  const EMAIL = "guest@student.com";
  const IDLE_TIMEOUT_MS = 14000;

  let open = false;
  let mode = "text";
  let piState = "Idle";
  let history = [];
  let knownFacts = {};
  let idleTimer = null;
  let recognition = null;
  let listening = false;
  let speakingAudio = null;
  let analyserCtx = null;
  let analyserNode = null;
  let analyserData = null;
  let rafWave = 0;
  let renderer = null;
  let scene = null;
  let camera = null;
  let orbCore = null;
  let orbitPoints = null;
  let ringGroup = null;
  let orbRaf = 0;

  const root = document.createElement("section");
  root.className = "pcos-root";
  root.innerHTML = `
    <div class="pcos-backdrop"></div>
    <div class="pcos-shell">
      <header class="pcos-topbar">
        <div class="pcos-title">
          <div class="pcos-kicker">Personal Intelligence</div>
          <div class="pcos-name">Tutor OS</div>
        </div>
        <div class="pcos-status">
          <span class="pcos-status-dot"></span>
          <span class="pcos-status-label">Online</span>
        </div>
        <div class="pcos-mode-toggle" role="tablist" aria-label="Mode switch">
          <button class="pcos-mode-btn active" data-mode="text">Text</button>
          <button class="pcos-mode-btn" data-mode="voice">Voice</button>
        </div>
        <button class="pcos-close" aria-label="Close">x</button>
      </header>

      <main class="pcos-main">
        <section class="pcos-text-view active" data-view="text">
          <div class="pcos-chat" aria-live="polite"></div>
          <div class="pcos-input-wrap">
            <button class="pcos-mic-btn" title="Voice input">Mic</button>
            <input class="pcos-input" placeholder="Ask Personal Intelligence..." />
            <button class="pcos-send-btn" title="Send">Send</button>
          </div>
        </section>

        <section class="pcos-voice-view" data-view="voice">
          <div class="pcos-space">
            <canvas class="pcos-orb-canvas"></canvas>
            <div class="pcos-ring pcos-ring-a"></div>
            <div class="pcos-ring pcos-ring-b"></div>
            <div class="pcos-ring pcos-ring-c"></div>
          </div>
          <div class="pcos-voice-state">Idle</div>
          <div class="pcos-voice-controls">
            <button class="pcos-voice-btn" data-action="mic">Mic</button>
            <button class="pcos-voice-btn" data-action="end">End</button>
            <button class="pcos-voice-btn" data-action="text">Text</button>
          </div>
        </section>
      </main>
    </div>
  `;
  document.body.appendChild(root);

  const closeBtn = root.querySelector(".pcos-close");
  const statusLabel = root.querySelector(".pcos-status-label");
  const voiceStatusLabel = root.querySelector(".pcos-voice-state");
  const modeBtns = root.querySelectorAll(".pcos-mode-btn");
  const views = root.querySelectorAll("[data-view]");
  const chatEl = root.querySelector(".pcos-chat");
  const inputEl = root.querySelector(".pcos-input");
  const sendBtn = root.querySelector(".pcos-send-btn");
  const micBtn = root.querySelector(".pcos-mic-btn");
  const voiceBtns = root.querySelectorAll(".pcos-voice-btn");
  const orbCanvas = root.querySelector(".pcos-orb-canvas");
  const rings = root.querySelectorAll(".pcos-ring");

  function setState(next) {
    piState = String(next || "Idle");
    statusLabel.textContent = piState;
    voiceStatusLabel.textContent = piState;
    root.setAttribute("data-state", piState.toLowerCase());
  }

  function setMode(nextMode) {
    mode = nextMode === "voice" ? "voice" : "text";
    modeBtns.forEach((btn) => btn.classList.toggle("active", btn.getAttribute("data-mode") === mode));
    views.forEach((v) => v.classList.toggle("active", v.getAttribute("data-view") === mode));
  }

  function openPI(nextOpen) {
    open = !!nextOpen;
    root.classList.toggle("show", open);
    launchBtn.classList.toggle("active", open);
    if (!open) {
      stopListening();
      stopSpeaking();
      setState("Idle");
      clearIdleTimer();
    } else {
      startOrb();
    }
  }

  function clearIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = null;
  }

  function armIdleTimer() {
    clearIdleTimer();
    idleTimer = setTimeout(function () {
      if (!listening) setState("Idle");
    }, IDLE_TIMEOUT_MS);
  }

  function saveMemory() {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-3000))); } catch (e) {}
    try { localStorage.setItem(FACTS_KEY, JSON.stringify(knownFacts || {})); } catch (e) {}
  }

  function loadMemory() {
    try {
      const h = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      history = Array.isArray(h) ? h : [];
    } catch (e) {
      history = [];
    }
    try {
      const f = JSON.parse(localStorage.getItem(FACTS_KEY) || "{}");
      knownFacts = f && typeof f === "object" ? f : {};
    } catch (e) {
      knownFacts = {};
    }
    history.slice(-30).forEach((m) => addBubble(m.role, m.content, false));
  }

  function addBubble(role, text, persist) {
    const row = document.createElement("div");
    row.className = "pcos-msg " + (role === "user" ? "user" : "ai");
    row.textContent = String(text || "");
    chatEl.appendChild(row);
    chatEl.scrollTop = chatEl.scrollHeight;
    if (persist !== false) {
      history.push({ role: role === "user" ? "user" : "assistant", content: String(text || ""), ts: Date.now() });
      saveMemory();
    }
  }

  function showTyping(show) {
    const existing = chatEl.querySelector(".pcos-msg.typing");
    if (show) {
      if (existing) return;
      const row = document.createElement("div");
      row.className = "pcos-msg ai typing";
      row.innerHTML = '<span></span><span></span><span></span>';
      chatEl.appendChild(row);
      chatEl.scrollTop = chatEl.scrollHeight;
      return;
    }
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
  }

  function extractFacts(text) {
    const t = String(text || "");
    const updates = {};
    let m = t.match(/\bmy name is\s+([A-Za-z][A-Za-z .'-]{1,60})/i);
    if (m && m[1]) updates.name = m[1].trim();
    m = t.match(/\bmy school is\s+([A-Za-z0-9 .,'&()-]{2,120})/i);
    if (m && m[1]) updates.school = m[1].trim();
    m = t.match(/\bmy favorite subject is\s+([A-Za-z0-9 .'-]{1,80})/i);
    if (m && m[1]) updates.favorite_subject = m[1].trim();
    return updates;
  }

  function getModel() {
    return String(localStorage.getItem(MODEL_KEY) || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  }

  function puterReady() {
    return !!(window.puter && window.puter.ai && typeof window.puter.ai.chat === "function");
  }

  function extractPuterText(resp) {
    if (!resp) return "";
    if (typeof resp === "string") return resp;
    if (resp && typeof resp.text === "string") return resp.text;
    if (resp && resp.message && typeof resp.message.content === "string") return resp.message.content;
    if (resp && Array.isArray(resp.choices) && resp.choices[0] && resp.choices[0].message) {
      return String(resp.choices[0].message.content || "");
    }
    return "";
  }

  async function askBackend(message, puterAnswer) {
    const payload = {
      message: message,
      email: EMAIL,
      language: localStorage.getItem("g9_language") || "English",
      subject: localStorage.getItem("g9_subject") || "General",
      history: history.slice(-120).map((m) => ({ role: m.role, content: m.content })),
      known_facts: knownFacts,
      puter_reply: {
        answer: puterAnswer,
        model: getModel(),
      },
      puter_model: getModel(),
      runtime_mode: "cloud_only",
    };
    const res = await (window.Api && window.Api.apiFetch
      ? window.Api.apiFetch("/personal-intelligence/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      : fetch("/personal-intelligence/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }));
    return await res.json();
  }

  async function speakWithPuter(text) {
    const clean = String(text || "").trim();
    if (!clean) return false;
    try {
      if (window.puter && window.puter.ai && typeof window.puter.ai.txt2speech === "function") {
        const out = await window.puter.ai.txt2speech(clean, { voice: localStorage.getItem("g9_tts_voice") || undefined });
        let src = "";
        if (typeof out === "string") src = out;
        else if (out && typeof out.url === "string") src = out.url;
        else if (out && typeof out.src === "string") src = out.src;
        if (src) {
          stopSpeaking();
          speakingAudio = new Audio(src);
          speakingAudio.onplay = function () { setState("Responding"); };
          speakingAudio.onended = function () { setState("Listening"); armIdleTimer(); };
          await speakingAudio.play();
          hookAudioAnalyser(speakingAudio);
          return true;
        }
      }
    } catch (e) {}
    return false;
  }

  function stopSpeaking() {
    try {
      if (speakingAudio) {
        speakingAudio.pause();
        speakingAudio.src = "";
      }
    } catch (e) {}
    speakingAudio = null;
  }

  async function speak(text) {
    const ok = await speakWithPuter(text);
    if (ok) return;
    try {
      const u = new SpeechSynthesisUtterance(String(text || ""));
      u.onstart = function () { setState("Responding"); };
      u.onend = function () { setState("Listening"); };
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch (e) {
      setState("Idle");
    }
  }

  function stopListening() {
    listening = false;
    try {
      if (recognition) recognition.stop();
    } catch (e) {}
  }

  function ensureRecognition() {
    if (recognition) return recognition;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    recognition = new SR();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onstart = function () {
      listening = true;
      setState("Listening");
      armIdleTimer();
    };
    recognition.onend = function () {
      listening = false;
      armIdleTimer();
    };
    recognition.onerror = function () {
      listening = false;
      setState("Idle");
    };
    recognition.onresult = function (ev) {
      const t = ev && ev.results && ev.results[0] && ev.results[0][0] ? String(ev.results[0][0].transcript || "") : "";
      if (t) handleUserMessage(t);
    };
    return recognition;
  }

  function startListening() {
    const rec = ensureRecognition();
    if (!rec) {
      setState("Idle");
      return;
    }
    try { rec.start(); } catch (e) {}
  }

  async function askPuter(messages) {
    if (!puterReady()) return "";
    const out = await window.puter.ai.chat(messages, { model: getModel() });
    return extractPuterText(out);
  }

  async function handleUserMessage(text) {
    if (!open) return;
    const userText = String(text || "").trim();
    if (!userText) return;
    addBubble("user", userText, true);
    Object.assign(knownFacts, extractFacts(userText));
    saveMemory();
    showTyping(true);
    setState("Thinking");
    armIdleTimer();
    try {
      const msgs = [
        { role: "system", content: "You are Personal Intelligence: precise, calm, futuristic, and helpful." },
      ].concat(history.slice(-40).map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })))
       .concat([{ role: "user", content: userText }]);
      let answer = await askPuter(msgs);
      if (!answer) answer = "I am online and ready. Please continue.";
      const backend = await askBackend(userText, answer);
      if (backend && backend.memory_updates && typeof backend.memory_updates === "object") {
        Object.assign(knownFacts, backend.memory_updates);
        saveMemory();
      }
      const finalAnswer = String((backend && backend.answer) || answer);
      showTyping(false);
      addBubble("assistant", finalAnswer, true);
      await speak(finalAnswer);
    } catch (e) {
      showTyping(false);
      addBubble("assistant", "Request failed. Please try again.", true);
      setState("Idle");
    }
  }

  function hookAudioAnalyser(audioEl) {
    try {
      if (!audioEl) return;
      if (!analyserCtx) analyserCtx = new (window.AudioContext || window.webkitAudioContext)();
      const src = analyserCtx.createMediaElementSource(audioEl);
      analyserNode = analyserCtx.createAnalyser();
      analyserNode.fftSize = 256;
      analyserData = new Uint8Array(analyserNode.frequencyBinCount);
      src.connect(analyserNode);
      analyserNode.connect(analyserCtx.destination);
      if (!rafWave) animateRings();
    } catch (e) {}
  }

  function animateRings() {
    if (!analyserNode || !analyserData) {
      rafWave = requestAnimationFrame(animateRings);
      return;
    }
    analyserNode.getByteFrequencyData(analyserData);
    let sum = 0;
    for (let i = 0; i < analyserData.length; i++) sum += analyserData[i];
    const amp = Math.max(0, Math.min(1, (sum / analyserData.length) / 255));
    rings.forEach(function (r, idx) {
      const scale = 1 + amp * (0.25 + idx * 0.08);
      r.style.transform = "translate(-50%, -50%) scale(" + scale.toFixed(3) + ")";
      r.style.opacity = String(0.2 + amp * 0.7);
    });
    rafWave = requestAnimationFrame(animateRings);
  }

  function stopOrb() {
    if (orbRaf) cancelAnimationFrame(orbRaf);
    orbRaf = 0;
    if (renderer) {
      try { renderer.dispose(); } catch (e) {}
      renderer = null;
    }
    scene = null;
    camera = null;
    orbCore = null;
    orbitPoints = null;
    ringGroup = null;
  }

  function startOrb() {
    if (orbRaf) return;
    if (window.THREE) {
      initThreeOrb();
      return;
    }
    const s = document.createElement("script");
    s.src = "https://unpkg.com/three@0.160.0/build/three.min.js";
    s.onload = function () { initThreeOrb(); };
    s.onerror = function () { animateCanvasFallback(); };
    document.head.appendChild(s);
  }

  function initThreeOrb() {
    if (!window.THREE || !orbCanvas) {
      animateCanvasFallback();
      return;
    }
    const THREE = window.THREE;
    const rect = orbCanvas.getBoundingClientRect();
    const w = Math.max(320, Math.floor(rect.width || 640));
    const h = Math.max(320, Math.floor(rect.height || 520));
    renderer = new THREE.WebGLRenderer({ canvas: orbCanvas, alpha: true, antialias: true });
    renderer.setSize(w, h, false);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    camera.position.z = 5;

    const lightA = new THREE.PointLight(0x6be1ff, 3.5, 40);
    lightA.position.set(2, 2, 3);
    scene.add(lightA);
    const lightB = new THREE.PointLight(0x7b66ff, 2.6, 30);
    lightB.position.set(-3, -1, 2);
    scene.add(lightB);

    const coreGeo = new THREE.SphereGeometry(1.05, 64, 64);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x78ccff,
      emissive: 0x1e6fff,
      emissiveIntensity: 1.6,
      transparent: true,
      opacity: 0.95,
      metalness: 0.2,
      roughness: 0.25,
    });
    orbCore = new THREE.Mesh(coreGeo, coreMat);
    scene.add(orbCore);

    const pCount = 2600;
    const positions = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount; i++) {
      const r = 1.35 + Math.random() * 1.05;
      const a = Math.random() * Math.PI * 2;
      const b = Math.random() * Math.PI;
      positions[i * 3 + 0] = Math.cos(a) * Math.sin(b) * r;
      positions[i * 3 + 1] = Math.sin(a) * Math.sin(b) * r;
      positions[i * 3 + 2] = Math.cos(b) * r;
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const pMat = new THREE.PointsMaterial({
      size: 0.02,
      color: 0x79d7ff,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    orbitPoints = new THREE.Points(pGeo, pMat);
    scene.add(orbitPoints);

    ringGroup = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const rg = new THREE.TorusGeometry(1.95 + i * 0.24, 0.01, 8, 180);
      const rm = new THREE.MeshBasicMaterial({
        color: i % 2 ? 0x5be6ff : 0x8865ff,
        transparent: true,
        opacity: 0.4,
      });
      const r = new THREE.Mesh(rg, rm);
      r.rotation.x = Math.PI / (2.8 + i * 0.35);
      r.rotation.y = i * 0.6;
      ringGroup.add(r);
    }
    scene.add(ringGroup);

    const clock = new THREE.Clock();
    (function tick() {
      const t = clock.getElapsedTime();
      const state = String(piState || "Idle").toLowerCase();
      const energy = state === "listening" ? 1.6 : (state === "responding" ? 2.1 : (state === "thinking" ? 1.25 : 0.9));
      if (orbCore) {
        orbCore.rotation.y += 0.004 * energy;
        orbCore.rotation.x += 0.0015 * energy;
        const pulse = 1 + Math.sin(t * (1.4 * energy)) * 0.03 * energy;
        orbCore.scale.set(pulse, pulse, pulse);
      }
      if (orbitPoints) {
        orbitPoints.rotation.y -= 0.0023 * energy;
        orbitPoints.rotation.x += 0.0011 * energy;
      }
      if (ringGroup) {
        ringGroup.rotation.z += 0.002 * energy;
      }
      if (renderer && scene && camera) renderer.render(scene, camera);
      orbRaf = requestAnimationFrame(tick);
    })();
  }

  function animateCanvasFallback() {
    const ctx = orbCanvas.getContext("2d");
    if (!ctx) return;
    const w = orbCanvas.width = orbCanvas.clientWidth || 640;
    const h = orbCanvas.height = orbCanvas.clientHeight || 520;
    (function draw(t) {
      const time = t * 0.001;
      const state = String(piState || "Idle").toLowerCase();
      const energy = state === "listening" ? 1.6 : (state === "responding" ? 2.0 : (state === "thinking" ? 1.2 : 0.8));
      ctx.clearRect(0, 0, w, h);
      const cx = w * 0.5;
      const cy = h * 0.48;
      const r = Math.min(w, h) * 0.15 * (1 + Math.sin(time * energy * 2) * 0.05);
      const g = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 2.7);
      g.addColorStop(0, "rgba(255,255,255,0.96)");
      g.addColorStop(0.35, "rgba(99,220,255,0.78)");
      g.addColorStop(0.68, "rgba(99,119,255,0.45)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 2.7, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = i % 2 ? "rgba(126,165,255,0.35)" : "rgba(113,239,255,0.38)";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(cx, cy, r * (1.8 + i * 0.35) + Math.sin(time * 2 + i) * 2, 0, Math.PI * 2);
        ctx.stroke();
      }
      orbRaf = requestAnimationFrame(draw);
    })(0);
  }

  launchBtn.addEventListener("click", function () {
    openPI(!open);
  });
  closeBtn.addEventListener("click", function () {
    openPI(false);
  });

  modeBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      const m = btn.getAttribute("data-mode");
      setMode(m);
      if (m === "voice" && open) startListening();
    });
  });

  sendBtn.addEventListener("click", function () {
    const t = String(inputEl.value || "").trim();
    if (!t) return;
    inputEl.value = "";
    handleUserMessage(t);
  });

  inputEl.addEventListener("keydown", function (ev) {
    if (ev.key !== "Enter") return;
    ev.preventDefault();
    const t = String(inputEl.value || "").trim();
    if (!t) return;
    inputEl.value = "";
    handleUserMessage(t);
  });

  micBtn.addEventListener("click", function () {
    setMode("voice");
    if (!open) openPI(true);
    startListening();
  });

  voiceBtns.forEach(function (b) {
    b.addEventListener("click", function () {
      const action = String(b.getAttribute("data-action") || "");
      if (action === "text") {
        setMode("text");
        return;
      }
      if (action === "end") {
        openPI(false);
        return;
      }
      if (action === "mic") {
        if (!open) openPI(true);
        startListening();
      }
    });
  });

  loadMemory();
  setState("Online");
  setMode("text");
  openPI(false);
})();

