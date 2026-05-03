(function (global) {
  "use strict";

  class AevraAudioEngine {
    constructor() {
      this.context = null;
      this.stream = null;
      this.source = null;
      this.processor = null;
      this.chunks = [];
      this.recording = false;
      this.inputRate = 48000;
    }

    async requestMicrophone() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Microphone recording is not supported in this browser.");
      }
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        return this.stream;
      } catch (error) {
        throw new Error("Microphone permission was denied. Please allow microphone access and try again.");
      }
    }

    async startRecording() {
      if (!this.stream) await this.requestMicrophone();
      this.context = this.context || new (window.AudioContext || window.webkitAudioContext)();
      this.inputRate = this.context.sampleRate;
      this.chunks = [];
      this.source = this.context.createMediaStreamSource(this.stream);
      this.processor = this.context.createScriptProcessor(4096, 1, 1);
      this.processor.onaudioprocess = (event) => {
        if (!this.recording) return;
        this.chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      };
      this.source.connect(this.processor);
      this.processor.connect(this.context.destination);
      this.recording = true;
    }

    stopRecording() {
      this.recording = false;
      if (this.processor) this.processor.disconnect();
      if (this.source) this.source.disconnect();
      const merged = this._merge(this.chunks);
      return this._resample(merged, this.inputRate, 16000);
    }

    getAudioBuffer() {
      return this._resample(this._merge(this.chunks), this.inputRate, 16000);
    }

    close() {
      this.stopRecording();
      if (this.stream) this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    _merge(chunks) {
      const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const out = new Float32Array(length);
      let offset = 0;
      chunks.forEach((chunk) => { out.set(chunk, offset); offset += chunk.length; });
      return out;
    }

    _resample(input, fromRate, toRate) {
      if (!input.length || fromRate === toRate) return input;
      const ratio = fromRate / toRate;
      const length = Math.floor(input.length / ratio);
      const out = new Float32Array(length);
      for (let i = 0; i < length; i++) {
        const idx = i * ratio;
        const left = Math.floor(idx);
        const right = Math.min(input.length - 1, left + 1);
        out[i] = input[left] + (input[right] - input[left]) * (idx - left);
      }
      return out;
    }
  }

  global.AevraAudioEngine = AevraAudioEngine;
})(window);
