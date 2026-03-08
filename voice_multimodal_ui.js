// voice_multimodal_ui.js
(function () {
  try { window.__g9_voice_backend_enabled = true; } catch (e) {}

  function qs(id) {
    return document.getElementById(id);
  }

  const micBtn = qs('micBtn');
  const speakerBtn = qs('speakerBtn');
  const inputBox = qs('inputBox');
  const sendBtn = qs('sendBtn');
  const messagesEl = qs('messages');
  const ttsVoiceSelect = qs('ttsVoiceSelect');
  const ttsTestVoice = qs('ttsTestVoice');

  const TTS_VOICE_STORAGE_KEY = (window.PuterVoiceCatalog && window.PuterVoiceCatalog.storageKey) ? String(window.PuterVoiceCatalog.storageKey) : 'g9_tts_voice';
  const PUTER_DEFAULT_VOICE_ID = (window.PuterVoiceCatalog && window.PuterVoiceCatalog.defaultId) ? String(window.PuterVoiceCatalog.defaultId) : 'openai:alloy';

  function appendBubble(role, text) {
    if (!messagesEl) return;
    const el = document.createElement('div');
    el.className = 'msg ' + (role === 'user' ? 'user' : 'ai') + ' show';
    el.textContent = text;
    messagesEl.appendChild(el);
    try {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    } catch (e) {}
  }

  async function initTtsVoiceSelector(){
    if(!ttsVoiceSelect) return;
    const catalog = window.PuterVoiceCatalog;
    const allVoices = catalog && Array.isArray(catalog.voices) && catalog.voices.length
      ? catalog.voices
      : [{ id: 'openai:alloy', label: 'OpenAI - alloy', options: { provider: 'openai', model: 'gpt-4o-mini-tts', voice: 'alloy' } }];
    const saved = (function(){
      try { return String(localStorage.getItem(TTS_VOICE_STORAGE_KEY) || ''); } catch (e) { return ''; }
    })();
    ttsVoiceSelect.innerHTML = '';
    allVoices.forEach((v) => {
      const o = document.createElement('option');
      const vid = String(v && v.id ? v.id : '');
      if(!vid) return;
      o.value = vid;
      o.textContent = String((v && v.label) ? v.label : 'Voice');
      ttsVoiceSelect.appendChild(o);
    });
    const hasSaved = Array.from(ttsVoiceSelect.options).some((o) => o.value === saved);
    ttsVoiceSelect.value = hasSaved ? saved : PUTER_DEFAULT_VOICE_ID;
    try { localStorage.setItem(TTS_VOICE_STORAGE_KEY, ttsVoiceSelect.value); } catch (e) {}

    ttsVoiceSelect.addEventListener('change', ()=>{
      const v = String(ttsVoiceSelect.value || '');
      try { localStorage.setItem(TTS_VOICE_STORAGE_KEY, v); } catch (e) {}
      if(v) toast('Voice set: ' + v);
      else toast('Voice set: Puter default');
    });
  }

  function toast(msg) {
    try {
      const toasts = document.getElementById('toasts');
      if (!toasts) return;
      const d = document.createElement('div');
      d.className = 'toast';
      d.textContent = msg;
      toasts.appendChild(d);
      setTimeout(() => {
        d.style.opacity = '0';
        d.style.transform = 'translateY(10px)';
        setTimeout(() => d.remove(), 300);
      }, 4200);
    } catch (e) {}
  }

  async function apiFetch(path, options) {
    if (!window.Api || !window.Api.apiFetch) throw new Error('API_UNAVAILABLE');
    return window.Api.apiFetch(path, options);
  }

  function getSelectedVoiceId(){
    try {
      const v = String(localStorage.getItem(TTS_VOICE_STORAGE_KEY) || '').trim();
      return v || PUTER_DEFAULT_VOICE_ID;
    } catch (e) {
      return PUTER_DEFAULT_VOICE_ID;
    }
  }

  function getSelectedPuterVoiceOptions(){
    const catalog = window.PuterVoiceCatalog;
    const selected = getSelectedVoiceId();
    if (catalog && typeof catalog.getById === 'function') {
      const hit = catalog.getById(selected);
      if (hit && hit.options) return hit.options;
      const fallback = catalog.getDefault && catalog.getDefault();
      if (fallback && fallback.options) return fallback.options;
    }
    return { provider: 'openai', model: 'gpt-4o-mini-tts', voice: 'alloy' };
  }

  async function ensurePuterReady(interactive){
    if(!window.puter || !window.puter.ai) throw new Error('PUTER_NOT_LOADED');
    if(!window.puter.auth || !window.puter.auth.isSignedIn || !window.puter.auth.signIn) return;
    let signed = false;
    try { signed = !!(await window.puter.auth.isSignedIn()); } catch (e) {}
    if(!signed && interactive){
      await window.puter.auth.signIn({ attempt_temp_user_creation: true });
    }
  }

  function normalizePuterTtsSource(result){
    if (!result) return null;
    if (typeof result === 'string') return { src: result, revoke: false };
    if (result instanceof Blob) return { src: URL.createObjectURL(result), revoke: true };
    if (result.url) return { src: String(result.url), revoke: false };
    if (result.audio_url) return { src: String(result.audio_url), revoke: false };
    if (result.audio instanceof Blob) return { src: URL.createObjectURL(result.audio), revoke: true };
    if (typeof result.data === 'string' && result.data.startsWith('data:audio')) return { src: result.data, revoke: false };
    return null;
  }

  async function requestPuterTts(text){
    await ensurePuterReady(false);
    const ai = window.puter && window.puter.ai;
    if (!ai) throw new Error('PUTER_NOT_LOADED');
    const voiceOptions = getSelectedPuterVoiceOptions();
    if (typeof ai.txt2speech === 'function') return ai.txt2speech(String(text || ''), voiceOptions);
    if (typeof ai.text2speech === 'function') return ai.text2speech(String(text || ''), voiceOptions);
    if (typeof ai.tts === 'function') return ai.tts(String(text || ''), voiceOptions);
    throw new Error('PUTER_TTS_UNAVAILABLE');
  }

  // --------------------
  // Voice: STT recording
  // --------------------
  let recorder = null;
  let chunks = [];
  let recording = false;

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      try {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('READ_FAILED'));
        reader.onload = () => {
          const out = String(reader.result || '');
          const comma = out.indexOf(',');
          resolve(comma >= 0 ? out.slice(comma + 1) : out);
        };
        reader.readAsDataURL(blob);
      } catch (e) {
        reject(e);
      }
    });
  }

  async function startRecording() {
    if (recording) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast('Microphone recording not supported');
      return;
    }

    const host = String(location.hostname || '').toLowerCase();
    const isLocal = host === 'localhost' || host === '127.0.0.1';
    if (!window.isSecureContext && !isLocal) {
      toast('Mic requires HTTPS or localhost');
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunks = [];
    recorder = new MediaRecorder(stream);

    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size) chunks.push(ev.data);
    };

    recorder.onstop = async () => {
      try {
        recording = false;
        micBtn && micBtn.classList.remove('recording');
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        const base64 = await blobToBase64(blob);
        const res = await apiFetch('/voice/recognize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            audio_base64: base64,
            mime_type: blob.type || recorder.mimeType || 'audio/webm',
            filename: 'speech.webm',
            language: 'en-US'
          })
        });
        if (!res.ok) throw new Error('HTTP_' + res.status);
        const data = await res.json();

        const text = (data && data.text) ? String(data.text) : '';
        if (!text.trim()) {
          toast('No speech detected');
          return;
        }

        if (inputBox) {
          inputBox.value = text;
          inputBox.focus();
          // Ensure chat UI reacts exactly like typed input.
          try { inputBox.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
        }
      } catch (e) {
        toast('Voice server not responding (STT).');
      } finally {
        try {
          const tracks = stream.getTracks();
          tracks.forEach(t => t.stop());
        } catch (e) {}
      }
    };

    recording = true;
    micBtn && micBtn.classList.add('recording');
    recorder.start();

    // Auto-stop after 8 seconds to keep UX simple
    setTimeout(() => {
      try {
        if (recorder && recording) recorder.stop();
      } catch (e) {}
    }, 8000);
  }

  function stopRecording() {
    try {
      if (recorder && recording) recorder.stop();
    } catch (e) {}
  }

  if (micBtn) {
    micBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      if (recording) stopRecording();
      else {
        try {
          await startRecording();
        } catch (err) {
          toast('Mic permission denied');
        }
      }
    });
  }

  // --------------------
  // Voice: TTS playback
  // --------------------
  let lastAudio = null;

  function getLastAiText() {
    if (!messagesEl) return '';
    const nodes = messagesEl.querySelectorAll('.msg.ai');
    if (!nodes.length) return '';
    return (nodes[nodes.length - 1].textContent || '').trim();
  }

  async function speakText(text) {
    const raw = String(text || '').trim();
    const cleaned = raw
      .replace(/\n?\s*AWARD_POINTS\s*:\s*\d+\s*$/i, '')
      // Remove most emojis/symbols so TTS doesn't read them awkwardly
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    // Prefer Puter TTS directly.
    try {
      const result = await requestPuterTts(cleaned);
      const normalized = normalizePuterTtsSource(result);
      if(!normalized || !normalized.src) throw new Error('PUTER_EMPTY_AUDIO');
      const url = normalized.src;

      if (lastAudio) {
        try { lastAudio.pause(); } catch (e) {}
        try { if (lastAudio.__revoke && lastAudio.__url) URL.revokeObjectURL(lastAudio.__url); } catch (e) {}
      }

      const audio = new Audio(url);
      audio.__url = url;
      audio.__revoke = !!normalized.revoke;
      lastAudio = audio;
      await audio.play();
      return;
    } catch (e) {
      // fall through to browser TTS
    }

    // Fallback: browser SpeechSynthesis (works on Netlify)
    if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
      throw new Error('NO_TTS');
    }

    async function waitForVoices(){
      try {
        const now = window.speechSynthesis.getVoices ? window.speechSynthesis.getVoices() : [];
        if(now && now.length) return now;
      } catch (e) {}
      await new Promise((resolve) => {
        let done = false;
        const finish = ()=>{ if(done) return; done = true; resolve(); };
        try {
          window.speechSynthesis.onvoiceschanged = finish;
        } catch (e) {}
        setTimeout(finish, 800);
      });
      try {
        return window.speechSynthesis.getVoices ? window.speechSynthesis.getVoices() : [];
      } catch (e) {
        return [];
      }
    }

    function getSavedVoiceName(){
      try {
        return String(localStorage.getItem(TTS_VOICE_STORAGE_KEY) || '');
      } catch (e) {
        return '';
      }
    }

    function setSavedVoiceName(name){
      try {
        localStorage.setItem(TTS_VOICE_STORAGE_KEY, String(name || ''));
      } catch (e) {}
    }

    function findVoiceByName(voices, name){
      const n = String(name || '').trim();
      if(!n) return null;
      const vs = Array.isArray(voices) ? voices : [];
      const exact = vs.find(v => String(v.name || '') === n);
      if(exact) return exact;
      const loose = vs.find(v => String(v.name || '').toLowerCase() === n.toLowerCase());
      return loose || null;
    }

    function pickBestVoice(voices){
      const vs = Array.isArray(voices) ? voices : [];
      const langPref = (String(navigator.language || 'en-US'));
      const isEnglish = /^en/i.test(langPref);
      const preferredLangs = isEnglish ? ['en-US','en-GB','en'] : [langPref, 'en-US', 'en'];

      const goodName = (name)=>/online|natural|neural|premium|enhanced|google|microsoft|aria|jenny|guy|sara|sabrina|sonia|samantha|zira|susan/i.test(String(name||''));
      const badName = (name)=>/robot|compact|basic/i.test(String(name||''));

      const scored = vs.map(v=>{
        const name = String(v.name || '');
        const lang = String(v.lang || '');
        let score = 0;
        if(preferredLangs.some(l => lang.toLowerCase().startsWith(l.toLowerCase()))) score += 50;
        // Strongly prefer high quality voices when available (Edge "Online (Natural)", Google voices, etc)
        if(/online\s*\(natural\)/i.test(name)) score += 100;
        if(/natural/i.test(name)) score += 60;
        if(/neural/i.test(name)) score += 50;
        if(/microsoft\s+aria/i.test(name)) score += 80;
        if(/microsoft\s+jenny/i.test(name)) score += 80;
        if(/google/i.test(name)) score += 40;
        if(goodName(name)) score += 20;
        if(!badName(name)) score += 5;
        if(v.localService) score += 2;
        return { v, score };
      }).sort((a,b)=>b.score-a.score);

      return scored.length ? scored[0].v : null;
    }

    function splitIntoChunks(t){
      const s = String(t || '').trim();
      if(!s) return [];
      // sentence-ish chunks to sound more natural
      const parts = s
        .replace(/\s+/g, ' ')
        .split(/(?<=[.!?])\s+/)
        .map(x => x.trim())
        .filter(Boolean);
      const chunks = [];
      let buf = '';
      for(const p of parts){
        if((buf + ' ' + p).trim().length > 220){
          if(buf) chunks.push(buf.trim());
          buf = p;
        } else {
          buf = (buf ? (buf + ' ' + p) : p);
        }
      }
      if(buf) chunks.push(buf.trim());
      return chunks.length ? chunks : [s];
    }

    try { window.speechSynthesis.cancel(); } catch (e) {}

    const voices = await waitForVoices();
    const savedName = getSavedVoiceName();
    const chosen = findVoiceByName(voices, savedName) || pickBestVoice(voices);
    const chunks = splitIntoChunks(cleaned);

    for(const chunk of chunks){
      const utter = new SpeechSynthesisUtterance(chunk);
      utter.rate = 0.96;
      utter.pitch = 1.06;
      utter.volume = 1;
      if(chosen) utter.voice = chosen;

      await new Promise((resolve, reject) => {
        utter.onend = () => resolve();
        utter.onerror = (ev) => reject(ev && ev.error ? ev.error : new Error('TTS_FAILED'));
        window.speechSynthesis.speak(utter);
      });

      // tiny pause between sentences
      await new Promise(r => setTimeout(r, 120));
    }
  }

  if (speakerBtn) {
    speakerBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      const text = getLastAiText();
      if (!text) {
        toast('No AI message to read yet');
        return;
      }
      try {
        await speakText(text);
      } catch (err) {
        const msg = (err && err.message) ? String(err.message) : '';
        if(msg === 'PLAYBACK_BLOCKED') toast('Tap the speaker again to allow audio playback.');
        else toast('Text-to-speech not available on this device/browser.');
      }
    });
  }

  if (ttsTestVoice) {
    ttsTestVoice.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        await speakText('Hello! This is a test of the selected AI voice.');
      } catch (err) {
        const msg = (err && err.message) ? String(err.message) : '';
        if(msg === 'PLAYBACK_BLOCKED') toast('Tap the button again to allow audio playback.');
        else toast('Text-to-speech not available on this device/browser.');
      }
    });
  }

  try {
    window.addEventListener('DOMContentLoaded', () => {
      initTtsVoiceSelector();
    });
  } catch (e) {}

  // Image OCR is handled by upload.js (to avoid duplicate bindings)
})();
