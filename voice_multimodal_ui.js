// voice_multimodal_ui.js — Gemini Native Audio TTS + Voice STT
// All voice output uses Gemini TTS via backend /voice/speak endpoint.
// No Puter, no ElevenLabs, no OpenAI.
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

  const TTS_VOICE_STORAGE_KEY = 'g9_tts_voice';

  // Gemini TTS voices (prebuilt voice catalog)
  const GEMINI_VOICES = [
    { id: 'Kore', label: 'Kore (Female, Warm)' },
    { id: 'Puck', label: 'Puck (Male, Bright)' },
    { id: 'Charon', label: 'Charon (Male, Deep)' },
    { id: 'Fenrir', label: 'Fenrir (Male, Calm)' },
    { id: 'Aoede', label: 'Aoede (Female, Soft)' },
    { id: 'Leda', label: 'Leda (Female, Clear)' },
    { id: 'Orus', label: 'Orus (Male, Warm)' },
    { id: 'Zephyr', label: 'Zephyr (Neutral, Light)' },
  ];

  const DEFAULT_VOICE_ID = 'Kore';

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

  async function initTttsVoiceSelector(){
    if(!ttsVoiceSelect) return;
    const saved = (function(){
      try { return String(localStorage.getItem(TTS_VOICE_STORAGE_KEY) || ''); } catch (e) { return ''; }
    })();
    ttsVoiceSelect.innerHTML = '';
    GEMINI_VOICES.forEach((v) => {
      const o = document.createElement('option');
      o.value = v.id;
      o.textContent = v.label;
      ttsVoiceSelect.appendChild(o);
    });
    const hasSaved = Array.from(ttsVoiceSelect.options).some((o) => o.value === saved);
    ttsVoiceSelect.value = hasSaved ? saved : DEFAULT_VOICE_ID;
    try { localStorage.setItem(TTS_VOICE_STORAGE_KEY, ttsVoiceSelect.value); } catch (e) {}

    ttsVoiceSelect.addEventListener('change', ()=>{
      const v = String(ttsVoiceSelect.value || '');
      try { localStorage.setItem(TTS_VOICE_STORAGE_KEY, v); } catch (e) {}
      if(v) toast('Voice set: ' + v);
      else toast('Voice set: ' + DEFAULT_VOICE_ID);
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
      return v || DEFAULT_VOICE_ID;
    } catch (e) {
      return DEFAULT_VOICE_ID;
    }
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
  // Voice: TTS playback (Gemini Native Audio)
  // --------------------
  let lastAudio = null;

  function getLastAiText() {
    if (!messagesEl) return '';
    const nodes = messagesEl.querySelectorAll('.msg.ai');
    if (!nodes.length) return '';
    return (nodes[nodes.length - 1].textContent || '').trim();
  }

  /**
   * Request TTS from Gemini via backend /voice/speak endpoint.
   * Returns a blob URL for the audio.
   */
  async function requestGeminiTts(text) {
    const voice = getSelectedVoiceId();
    const res = await apiFetch('/voice/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text, voice: voice })
    });
    if (!res.ok) throw new Error('TTS_HTTP_' + res.status);
    const blob = await res.blob();
    if (!blob || blob.size < 100) throw new Error('TTS_EMPTY_AUDIO');
    return URL.createObjectURL(blob);
  }

  async function speakText(text) {
    const raw = String(text || '').trim();
    const cleaned = raw
      .replace(/\n?\s*AWARD_POINTS\s*:\s*\d+\s*$/i, '')
      // Remove most emojis/symbols so TTS doesn't read them awkwardly
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (!cleaned) throw new Error('NO_TEXT');

    // Primary: Gemini Native Audio TTS via backend
    try {
      const url = await requestGeminiTts(cleaned);

      if (lastAudio) {
        try { lastAudio.pause(); } catch (e) {}
        try { if (lastAudio.__url) URL.revokeObjectURL(lastAudio.__url); } catch (e) {}
      }

      const audio = new Audio(url);
      audio.__url = url;
      lastAudio = audio;
      await audio.play();
      return;
    } catch (e) {
      console.warn('[TTS] Gemini TTS failed, falling back to browser:', e.message);
    }

    // Fallback: browser SpeechSynthesis (always available)
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

    function pickBestVoice(voices){
      const vs = Array.isArray(voices) ? voices : [];
      const langPref = (String(navigator.language || 'en-US'));
      const isEnglish = /^en/i.test(langPref);
      const preferredLangs = isEnglish ? ['en-US','en-GB','en'] : [langPref, 'en-US', 'en'];

      const scored = vs.map(v=>{
        const name = String(v.name || '');
        const lang = String(v.lang || '');
        let score = 0;
        if(preferredLangs.some(l => lang.toLowerCase().startsWith(l.toLowerCase()))) score += 50;
        if(/online\s*\(natural\)/i.test(name)) score += 100;
        if(/natural/i.test(name)) score += 60;
        if(/neural/i.test(name)) score += 50;
        if(!/robot|compact|basic/i.test(name)) score += 5;
        return { v, score };
      }).sort((a,b)=>b.score-a.score);

      return scored.length ? scored[0].v : null;
    }

    function splitIntoChunks(t){
      const s = String(t || '').trim();
      if(!s) return [];
      const parts = s.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).map(x => x.trim()).filter(Boolean);
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
    const chosen = pickBestVoice(voices);
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
      initTttsVoiceSelector();
    });
  } catch (e) {}

  // Image OCR is handled by upload.js (to avoid duplicate bindings)
})();
