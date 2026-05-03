(function (global) {
  "use strict";

  class AevraWakewordEngine {
    constructor(options) {
      this.options = options || {};
      this.callbacks = [];
      this.recognition = null;
      this.listening = false;
      this.indicator = null;
    }

    onWakeWord(callback) {
      if (typeof callback === "function") this.callbacks.push(callback);
    }

    start() {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      this._ensureIndicator();
      this.indicator.classList.add("listening");
      if (!SpeechRecognition) {
        this.indicator.classList.add("tap-mode");
        this.indicator.onclick = () => this._fire("tap");
        return false;
      }
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = "en-US";
      this.recognition.onresult = (event) => {
        const text = Array.from(event.results).map((r) => r[0] && r[0].transcript).join(" ").toLowerCase();
        if (/\bhey\s+aevra\b/.test(text)) {
          this.stop();
          this._fire(text);
        }
      };
      this.recognition.onend = () => {
        if (this.listening) {
          try { this.recognition.start(); } catch (error) {}
        }
      };
      this.listening = true;
      try { this.recognition.start(); } catch (error) {}
      return true;
    }

    stop() {
      this.listening = false;
      if (this.indicator) this.indicator.classList.remove("listening");
      if (this.recognition) {
        try { this.recognition.stop(); } catch (error) {}
      }
    }

    _fire(source) {
      this.callbacks.forEach((callback) => callback({ phrase: "Hey Aevra", source }));
    }

    _ensureIndicator() {
      this.indicator = document.querySelector("[data-aevra-wake-indicator]");
      if (this.indicator) return;
      this.indicator = document.createElement("button");
      this.indicator.type = "button";
      this.indicator.className = "aevra-wake-indicator";
      this.indicator.setAttribute("data-aevra-wake-indicator", "true");
      this.indicator.setAttribute("aria-label", "Aevra voice wake word listener");
      this.indicator.textContent = "Voice";
      document.body.appendChild(this.indicator);
    }
  }

  global.AevraWakewordEngine = AevraWakewordEngine;
})(window);
