/**
 * public/live/audio_processor.js
 * Browser-side audio processing for AURA LIVE.
 * Uses AudioWorklet for raw PCM capture at 16kHz.
 * Converts to base64 for WebSocket transmission.
 */
(function(global) {
  "use strict";

  class AudioProcessor {
    constructor() {
      this.audioContext = null;
      this.workletNode = null;
      this.stream = null;
      this.isRecording = false;
      this.sampleRate = 16000;
      this.onAudioChunk = null; // callback(base64String)
      this.onError = null;      // callback(error)
    }

    async start() {
      if (this.isRecording) return;

      try {
        // Request microphone access
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: this.sampleRate,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          }
        });

        // Create AudioContext
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: this.sampleRate,
        });

        // Use ScriptProcessorNode as fallback (AudioWorklet requires separate file)
        const source = this.audioContext.createMediaStreamSource(this.stream);
        
        // ScriptProcessorNode for raw PCM (simpler than AudioWorklet, works everywhere)
        const bufferSize = 4096;
        const processor = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

        processor.onaudioprocess = (event) => {
          if (!this.isRecording || !this.onAudioChunk) return;

          const inputData = event.inputBuffer.getChannelData(0);
          // Convert Float32 to Int16 PCM
          const pcm = this._float32ToInt16(inputData);
          // Convert to base64
          const base64 = this._arrayBufferToBase64(pcm.buffer);
          this.onAudioChunk(base64);
        };

        source.connect(processor);
        processor.connect(this.audioContext.destination);

        this.processor = processor;
        this.source = source;
        this.isRecording = true;

        console.log("[AudioProcessor] Started recording at", this.sampleRate, "Hz");
      } catch (err) {
        console.error("[AudioProcessor] Start failed:", err);
        if (this.onError) this.onError(err);
        throw err;
      }
    }

    stop() {
      this.isRecording = false;

      if (this.processor) {
        this.processor.disconnect();
        this.processor = null;
      }
      if (this.source) {
        this.source.disconnect();
        this.source = null;
      }
      if (this.audioContext) {
        this.audioContext.close().catch(() => {});
        this.audioContext = null;
      }
      if (this.stream) {
        this.stream.getTracks().forEach(t => t.stop());
        this.stream = null;
      }

      console.log("[AudioProcessor] Stopped");
    }

    _float32ToInt16(float32Array) {
      const int16 = new Int16Array(float32Array.length);
      for (let i = 0; i < float32Array.length; i++) {
        let s = Math.max(-1, Math.min(1, float32Array[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      return int16;
    }

    _arrayBufferToBase64(buffer) {
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return btoa(binary);
    }
  }

  /**
   * Audio player for receiving PCM audio from server and playing it.
   */
  class AudioPlayer {
    constructor() {
      this.audioContext = null;
      this.isPlaying = false;
      this.queue = [];
      this.sampleRate = 24000; // Gemini output rate
      this._nextPlayTime = 0;
    }

    start() {
      if (this.isPlaying) return;
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: this.sampleRate,
      });
      this.isPlaying = true;
      this._nextPlayTime = this.audioContext.currentTime;
      console.log("[AudioPlayer] Started at", this.sampleRate, "Hz");
    }

    /**
     * Play a base64-encoded PCM audio chunk.
     */
    play(base64Audio) {
      if (!this.isPlaying || !this.audioContext) return;

      try {
        const binary = atob(base64Audio);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }

        // Convert Int16 PCM to Float32
        const int16 = new Int16Array(bytes.buffer);
        const float32 = new Float32Array(int16.length);
        for (let i = 0; i < int16.length; i++) {
          float32[i] = int16[i] / 32768.0;
        }

        // Create and schedule audio buffer
        const audioBuffer = this.audioContext.createBuffer(1, float32.length, this.sampleRate);
        audioBuffer.getChannelData(0).set(float32);

        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.audioContext.destination);

        // Schedule to play after current audio finishes
        const startTime = Math.max(this._nextPlayTime, this.audioContext.currentTime);
        source.start(startTime);
        this._nextPlayTime = startTime + audioBuffer.duration;
      } catch (err) {
        console.warn("[AudioPlayer] Play error:", err);
      }
    }

    /**
     * Clear queued audio (e.g., on interruption).
     */
    clear() {
      this._nextPlayTime = 0;
      if (this.audioContext) {
        // Create a new context to reset scheduling
        const old = this.audioContext;
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: this.sampleRate,
        });
        old.close().catch(() => {});
      }
    }

    stop() {
      this.isPlaying = false;
      if (this.audioContext) {
        this.audioContext.close().catch(() => {});
        this.audioContext = null;
      }
      console.log("[AudioPlayer] Stopped");
    }
  }

  global.AuraAudioProcessor = AudioProcessor;
  global.AuraAudioPlayer = AudioPlayer;
})(window);
