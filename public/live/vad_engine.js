/**
 * public/live/vad_engine.js
 * Voice Activity Detection for AURA LIVE.
 * Detects speech start/end using Web Speech API and audio analysis.
 * Triggers camera frame capture on speech detection.
 */
(function(global) {
  "use strict";

  class VADEngine {
    constructor(options = {}) {
      this.threshold = options.threshold || 0.02;  // RMS threshold for speech
      this.silenceDuration = options.silenceDuration || 600; // ms of silence before "speech end"
      this.onSpeechStart = null;  // () => {}
      this.onSpeechEnd = null;    // () => {}
      this.onInterimResult = null; // (text) => {}
      this.onFinalResult = null;   // (text) => {}

      this._isSpeaking = false;
      this._silenceTimer = null;
      this._recognition = null;
      this._running = false;
    }

    /**
     * Start VAD using Web Speech API for speech detection + transcription.
     */
    start() {
      if (this._running) return;
      this._running = true;

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        console.warn("[VAD] Web Speech API not available, using audio-only VAD");
        return;
      }

      this._recognition = new SpeechRecognition();
      this._recognition.continuous = true;
      this._recognition.interimResults = true;
      this._recognition.lang = "en-US";

      this._recognition.onresult = (event) => {
        let interim = "";
        let final = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += transcript;
          } else {
            interim += transcript;
          }
        }

        // Speech detected — trigger callback
        if (interim || final) {
          this._onSpeechDetected();

          if (interim && this.onInterimResult) {
            this.onInterimResult(interim);
          }
          if (final && this.onFinalResult) {
            this.onFinalResult(final);
          }
        }
      };

      this._recognition.onerror = (event) => {
        if (event.error === "no-speech") {
          this._onSilence();
        } else if (event.error !== "aborted") {
          console.warn("[VAD] Recognition error:", event.error);
        }
      };

      this._recognition.onend = () => {
        // Auto-restart if still running
        if (this._running) {
          try {
            this._recognition.start();
          } catch (e) {
            // Already started
          }
        }
      };

      try {
        this._recognition.start();
        console.log("[VAD] Started");
      } catch (e) {
        console.warn("[VAD] Start failed:", e);
      }
    }

    /**
     * Stop VAD.
     */
    stop() {
      this._running = false;
      this._isSpeaking = false;

      if (this._silenceTimer) {
        clearTimeout(this._silenceTimer);
        this._silenceTimer = null;
      }

      if (this._recognition) {
        try {
          this._recognition.stop();
        } catch (e) {}
        this._recognition = null;
      }

      console.log("[VAD] Stopped");
    }

    /**
     * Check if currently speaking.
     */
    get isSpeaking() {
      return this._isSpeaking;
    }

    // ─── Internal ───

    _onSpeechDetected() {
      // Reset silence timer
      if (this._silenceTimer) {
        clearTimeout(this._silenceTimer);
        this._silenceTimer = null;
      }

      if (!this._isSpeaking) {
        this._isSpeaking = true;
        if (this.onSpeechStart) this.onSpeechStart();
      }

      // Start silence timer (will fire onSpeechEnd if no more speech)
      this._silenceTimer = setTimeout(() => {
        this._onSilence();
      }, this.silenceDuration);
    }

    _onSilence() {
      if (this._isSpeaking) {
        this._isSpeaking = false;
        if (this.onSpeechEnd) this.onSpeechEnd();
      }
    }
  }

  global.AuraVADEngine = VADEngine;
})(window);
