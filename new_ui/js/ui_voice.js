(function () {
  "use strict";
  function waveform() {
    return '<span class="waveform">' + Array.from({ length: 7 }, (_, i) => `<span class="waveform-bar" style="--delay:${0.45 + i * 0.05}s"></span>`).join("") + "</span>";
  }
  function initVoice() {
    const btn = document.getElementById("voiceBtn");
    const input = document.getElementById("chatInput");
    if (!btn) return;
    btn.addEventListener("click", async () => {
      const old = btn.innerHTML;
      btn.innerHTML = waveform();
      btn.classList.add("recording");
      try {
        const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!Recognition) throw new Error("Voice input is not supported in this browser.");
        const rec = new Recognition();
        rec.lang = "en-US";
        rec.interimResults = false;
        rec.onresult = (event) => {
          input.value = event.results[0][0].transcript;
          input.dispatchEvent(new Event("input"));
          document.getElementById("sendBtn").click();
        };
        rec.onend = () => { btn.innerHTML = old; btn.classList.remove("recording"); };
        rec.start();
      } catch (error) {
        btn.innerHTML = old;
        btn.classList.remove("recording");
        alert(error.message);
      }
    });
  }
  document.addEventListener("DOMContentLoaded", initVoice);
})();
