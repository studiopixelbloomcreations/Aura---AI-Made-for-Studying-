/**
 * public/live/aura_live_controller.js
 * Frontend orchestrator for AURA LIVE.
 * Ties together: LiveClient, AudioProcessor, AudioPlayer, VAD, VisController.
 */
(function(global) {
  "use strict";

  class AuraLiveController {
    constructor() {
      this.client = null;
      this.audioProcessor = null;
      this.audioPlayer = null;
      this.vad = null;
      this.state = "idle"; // idle | connecting | connected | fallback | error
      this.sessionId = null;

      // UI callbacks
      this.onStateChange = null;     // (state, data) => {}
      this.onTranscription = null;   // ({role, text, type}) => {}
      this.onToolResult = null;      // ({tool, status, result}) => {}
      this.onError = null;           // (error) => {}
    }

    /**
     * Start AURA LIVE session — connect all systems.
     */
    async start() {
      if (this.state === "connected" || this.state === "connecting") return;

      this._setState("connecting");

      try {
        // 1. Initialize audio systems
        this.audioProcessor = new global.AuraAudioProcessor();
        this.audioPlayer = new global.AuraAudioPlayer();

        // 2. Set up audio callbacks
        this.audioProcessor.onAudioChunk = (base64) => {
          if (this.client && this.client.connected) {
            this.client.sendAudio(base64);
          }
        };

        // 3. Create WebSocket client
        this.client = new global.AuraLiveClient();

        // 4. Set up client callbacks
        this.client.onConnect = () => {
          this._setState("connected", { sessionId: this.client.ws });
        };

        this.client.onDisconnect = (code, reason) => {
          if (code !== 1000) {
            this._setState("error", { message: "Disconnected: " + reason });
          }
        };

        this.client.onAudio = (base64) => {
          this.audioPlayer.play(base64);
        };

        this.client.onTranscription = (data) => {
          if (this.onTranscription) this.onTranscription(data);
        };

        this.client.onToolResult = (data) => {
          if (this.onToolResult) this.onToolResult(data);

          // If vision tool, capture frame and store result
          if (data.tool === "analyze_vision" && global.AevraVisController) {
            global.AevraVisController.setLastResult(data.result);
          }
        };

        this.client.onStatus = (data) => {
          this.sessionId = data.session_id || this.sessionId;

          if (data.state === "connected") {
            this._setState("connected", data);
          } else if (data.state === "fallback") {
            this._setState("fallback", data);
            // Stop audio streaming in fallback mode
            this._stopAudioStreaming();
          }
        };

        this.client.onError = (err) => {
          this._setState("error", { message: err.message || "Connection error" });
          if (this.onError) this.onError(err);
        };

        // 5. Connect to server
        await this.client.connect();

        // 6. Start audio capture
        await this.audioProcessor.start();
        this.audioPlayer.start();

        // 7. Initialize VAD
        this.vad = new global.AuraVADEngine();
        this.vad.onSpeechStart = () => {
          // On speech, capture a camera frame and send it
          this._captureAndSendFrame();
        };
        this.vad.onSpeechEnd = () => {
          // Speech ended — no action needed
        };
        this.vad.onInterimResult = (text) => {
          if (this.onTranscription) {
            this.onTranscription({ role: "user", text, type: "interim" });
          }
        };
        this.vad.onFinalResult = (text) => {
          if (this.onTranscription) {
            this.onTranscription({ role: "user", text, type: "final" });
          }
          // Also send as text for fallback pipeline
          if (this.client && this.client.connected) {
            this.client.sendText(text);
          }
        };
        this.vad.start();

        // 8. Initialize vision (non-blocking)
        if (global.AevraVisController && !global.AevraVisController.isActive) {
          global.AevraVisController.init().catch(() => {
            console.warn("[LiveController] Vision init failed (non-critical)");
          });
        }

        console.log("[LiveController] All systems started");

      } catch (err) {
        console.error("[LiveController] Start failed:", err);
        this._setState("error", { message: err.message });
        if (this.onError) this.onError(err);
      }
    }

    /**
     * Send a text message (for text input or fallback mode).
     */
    sendText(text) {
      if (this.client && this.client.connected) {
        this.client.sendText(text);
      }
    }

    /**
     * Manually trigger a camera capture.
     */
    async captureFrame() {
      if (!global.AevraVisController || !global.AevraVisController.isActive) {
        return null;
      }
      const result = await global.AevraVisController.capture(true);
      if (result.captured && result.base64 && this.client && this.client.connected) {
        this.client.sendVisionFrame(result.base64);
      }
      return result;
    }

    /**
     * Stop AURA LIVE session.
     */
    async stop() {
      this._setState("idle");

      if (this.vad) {
        this.vad.stop();
        this.vad = null;
      }

      if (this.audioProcessor) {
        this.audioProcessor.stop();
        this.audioProcessor = null;
      }

      if (this.audioPlayer) {
        this.audioPlayer.stop();
        this.audioPlayer = null;
      }

      if (this.client) {
        this.client.disconnect();
        this.client = null;
      }

      this.sessionId = null;
      console.log("[LiveController] All systems stopped");
    }

    /**
     * Interrupt current audio playback (user started speaking).
     */
    interrupt() {
      if (this.audioPlayer) {
        this.audioPlayer.clear();
      }
    }

    // ─── Internal ───

    async _captureAndSendFrame() {
      if (!global.AevraVisController || !global.AevraVisController.isActive) return;

      try {
        const result = await global.AevraVisController.capture();
        if (result.captured && result.base64 && this.client && this.client.connected) {
          this.client.sendVisionFrame(result.base64);
        }
      } catch (err) {
        // Non-critical — vision is optional
      }
    }

    _stopAudioStreaming() {
      // In fallback mode, stop streaming raw audio
      if (this.audioProcessor) {
        this.audioProcessor.stop();
      }
    }

    _setState(state, data = {}) {
      this.state = state;
      if (this.onStateChange) {
        this.onStateChange(state, data);
      }
    }
  }

  // Singleton
  global.AuraLiveController = new AuraLiveController();
})(window);
