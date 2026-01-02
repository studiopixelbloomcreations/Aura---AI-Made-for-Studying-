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

  const TTS_VOICE_STORAGE_KEY = 'g9_tts_voice';

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
    if(!('speechSynthesis' in window) || !window.speechSynthesis.getVoices) return;

    async function populate(){
      let voices = [];
      try {
        voices = window.speechSynthesis.getVoices();
      } catch (e) {}
      if(!voices || !voices.length) {
        // wait a moment for Edge to load "Online (Natural)" voices
        await new Promise(r => setTimeout(r, 600));
        try { voices = window.speechSynthesis.getVoices(); } catch (e) {}
      }

      const prev = ttsVoiceSelect.value;
      const saved = (function(){
        try { return String(localStorage.getItem(TTS_VOICE_STORAGE_KEY) || ''); } catch (e) { return ''; }
      })();

      ttsVoiceSelect.innerHTML = '';
      const optAuto = document.createElement('option');
      optAuto.value = '';
      optAuto.textContent = 'Auto (best available)';
      ttsVoiceSelect.appendChild(optAuto);

      const sorted = (voices || []).slice().sort((a,b)=>{
        const an = String(a.name||'');
        const bn = String(b.name||'');
        return an.localeCompare(bn);
      });

      sorted.forEach(v=>{
        const o = document.createElement('option');
        o.value = String(v.name || '');
        o.textContent = `${String(v.name || '')} (${String(v.lang || '')})`;
        ttsVoiceSelect.appendChild(o);
      });

      if(saved){
        const match = Array.from(ttsVoiceSelect.options).find(o => o.value === saved);
        if(match) ttsVoiceSelect.value = saved;
        else ttsVoiceSelect.value = '';
      } else if(prev) {
        ttsVoiceSelect.value = prev;
      }
    }

    await populate();
    try {
      window.speechSynthesis.onvoiceschanged = populate;
    } catch (e) {}

    ttsVoiceSelect.addEventListener('change', ()=>{
      const v = String(ttsVoiceSelect.value || '');
      try { localStorage.setItem(TTS_VOICE_STORAGE_KEY, v); } catch (e) {}
      if(v) toast('Voice set: ' + v);
      else toast('Voice set: Auto');
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

  function getSelectedElevenLabsVoiceId(){
    // Allow overriding via window for experiments.
    try {
      if(window.__ELEVENLABS_VOICE_ID__) return String(window.__ELEVENLABS_VOICE_ID__);
    } catch (e) {}

    // Reuse existing TTS voice selector UI by storing a voice id in localStorage.
    // (The dropdown currently stores a *browser voice name*; for ElevenLabs we store a separate key.)
    try {
      const v = localStorage.getItem('g9_elevenlabs_voice_id');
      if(v) return String(v);
    } catch (e) {}

    // Default: a commonly used ElevenLabs English voice.
    // NOTE: This is just a default; user can override by setting localStorage key.
    return '21m00Tcm4TlvDq8ikWAM';
  }

  // --------------------
  // Voice: STT recording
  // --------------------
  let recorder = null;
  let chunks = [];
  let recording = false;

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

        const fd = new FormData();
        fd.append('audio', blob, 'speech.webm');

        const res = await apiFetch('/voice/recognize?language=en-US', { method: 'POST', body: fd });
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

    // Prefer ElevenLabs via Netlify function proxy (keeps API key off the client)
    try {
      const payload = {
        text: cleaned,
        voiceId: getSelectedElevenLabsVoiceId(),
        stability: 0.5,
        similarity_boost: 0.75
      };

      const res = await apiFetch('/tts/elevenlabs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('HTTP_' + res.status);
      const blob = await res.blob();
      if(!blob || !blob.size) throw new Error('EMPTY_AUDIO');
      const url = URL.createObjectURL(blob);

      if (lastAudio) {
        try { lastAudio.pause(); } catch (e) {}
        try { URL.revokeObjectURL(lastAudio.__url); } catch (e) {}
      }

      const audio = new Audio(url);
      audio.__url = url;
      lastAudio = audio;

      // iOS/Safari can throw if not initiated by user gesture; surface a toast in that case.
      try {
        await audio.play();
      } catch (e) {
        throw new Error('PLAYBACK_BLOCKED');
      }
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
