(function () {
  "use strict";

  let recorder = null;
  let chunks = [];

  function waveform() {
    return '<span class="waveform">' + Array.from({ length: 7 }, (_, i) => `<span class="waveform-bar" style="--delay:${0.45 + i * 0.05}s"></span>`).join("") + "</span>";
  }

  async function start(btn) {
    if (!navigator.mediaDevices || !window.MediaRecorder) throw new Error("Voice recording is not supported in this browser.");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    chunks = [];
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
    recorder = new MediaRecorder(stream, { mimeType });
    recorder.ondataavailable = (event) => { if (event.data && event.data.size) chunks.push(event.data); };
    recorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      btn.classList.remove("recording");
      btn.innerHTML = btn.dataset.icon;
      await recognize(new Blob(chunks, { type: mimeType }));
    };
    recorder.start();
    btn.classList.add("recording");
    btn.innerHTML = waveform();
  }

  async function recognize(blob) {
    const audio_base64 = await blobToBase64(blob);
    window.AevraState && window.AevraState.setLoading("voice", true);
    try {
      const res = await fetch("/voice/recognize", { method: "POST", body: JSON.stringify({ audio_base64, mime_type: blob.type || "audio/webm" }), headers: { "content-type": "application/json", "x-aevra-csrf": sessionStorage.getItem("aevra_csrf") || "browser" } });
      const payload = await res.json().catch(() => ({}));
      const data = payload.data || payload;
      if (!res.ok || payload.success === false) throw new Error(payload.error || "Voice recognition failed.");
      window.AevraLogger && window.AevraLogger.voice(data);
      if (data.matched && data.userId) {
        window.AevraState && window.AevraState.setCurrentUser({ userId: data.userId, voiceConfidence: data.confidence });
        window.AevraChatUI && window.AevraChatUI.addAevraMessage("Voice identity confirmed. I know it is you.");
      } else {
        window.AevraChatUI && window.AevraChatUI.addAevraMessage("I could not confirm your voice yet. Please try again or enroll your voice profile.");
      }
    } catch (error) {
      window.AevraState && window.AevraState.setError("voice", error);
      window.AevraChatUI && window.AevraChatUI.addAevraMessage(error.message || "Voice recognition is unavailable right now.");
    } finally {
      window.AevraState && window.AevraState.setLoading("voice", false);
    }
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || "").split(",", 2)[1] || "");
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function initVoice() {
    const btn = document.getElementById("voiceBtn");
    if (!btn) return;
    btn.dataset.icon = btn.innerHTML;
    btn.addEventListener("click", async () => {
      try {
        if (recorder && recorder.state === "recording") {
          recorder.stop();
          return;
        }
        await start(btn);
      } catch (error) {
        window.AevraChatUI && window.AevraChatUI.addAevraMessage(error.message || "Voice input is unavailable.");
      }
    });
  }

  document.addEventListener("DOMContentLoaded", initVoice);
})();
