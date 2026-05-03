(function (global) {
  "use strict";

  class AevraAudioEngine {
    constructor() {
      this.stream = null;
      this.recorder = null;
      this.chunks = [];
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
      this.chunks = [];
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      this.recorder = new MediaRecorder(this.stream, { mimeType });
      this.recorder.ondataavailable = (event) => {
        if (event.data && event.data.size) this.chunks.push(event.data);
      };
      this.recorder.start();
    }

    stopRecording() {
      return new Promise((resolve) => {
        if (!this.recorder || this.recorder.state === "inactive") {
          resolve(this.getAudioBlob());
          return;
        }
        this.recorder.onstop = () => resolve(this.getAudioBlob());
        this.recorder.stop();
      });
    }

    getAudioBlob() {
      const type = this.recorder && this.recorder.mimeType || "audio/webm";
      return new Blob(this.chunks, { type });
    }

    close() {
      if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
      if (this.stream) this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
  }

  global.AevraAudioEngine = AevraAudioEngine;
})(window);
