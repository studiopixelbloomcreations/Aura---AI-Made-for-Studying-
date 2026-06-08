/**
 * public/vis/vis_controller.js — AURA AI Vision Controller
 * On-demand camera capture with perceptual hash cache.
 * NO continuous streaming. NO biometric features.
 * Triggers: VAD speechStart, explicit command, manual capture button.
 */
(function(global) {
  "use strict";

  const CACHE_TTL = 30000; // 30 seconds

  class VisController {
    constructor() {
      this.stream = null;
      this.video = null;
      this.canvas = null;
      this.ctx = null;
      this.isActive = false;
      this.maxWidth = 640;
      this.jpegQuality = 0.7;

      // Perceptual hash cache
      this._lastHash = null;
      this._lastCaptureTime = 0;
      this._lastResult = null;

      // Events
      this._listeners = {};
    }

    /**
     * Initialize camera (getUserMedia) but don't start capturing.
     */
    async init() {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        // Create hidden video element
        this.video = document.createElement("video");
        this.video.srcObject = this.stream;
        this.video.autoplay = true;
        this.video.playsInline = true;
        this.video.muted = true;
        this.video.style.position = "fixed";
        this.video.style.left = "-9999px";
        this.video.style.top = "-9999px";
        this.video.style.width = "1px";
        this.video.style.height = "1px";
        document.body.appendChild(this.video);

        // Wait for video to be ready
        await new Promise((resolve) => {
          if (this.video.readyState >= 2) {
            resolve();
          } else {
            this.video.onloadeddata = resolve;
          }
        });

        // Create canvas for frame capture
        this.canvas = document.createElement("canvas");
        this.canvas.width = this.maxWidth;
        this.canvas.height = Math.round(
          (this.maxWidth / this.video.videoWidth) * this.video.videoHeight
        );
        this.ctx = this.canvas.getContext("2d");

        this.isActive = true;
        this._emit("ready", { success: true });
        return { success: true };
      } catch (err) {
        console.warn("[VisController] Init failed:", err);
        this._emit("ready", { success: false, error: err.message });
        return { success: false, error: err.message };
      }
    }

    /**
     * Capture a frame on-demand. Returns base64 JPEG or null if cached.
     * @param {boolean} force - Skip cache check
     */
    async capture(force = false) {
      if (!this.isActive || !this.video || !this.ctx) {
        return { captured: false, reason: "not_initialized" };
      }

      // Capture frame to canvas
      this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
      const dataUrl = this.canvas.toDataURL("image/jpeg", this.jpegQuality);
      const base64 = dataUrl.split(",")[1];

      // Compute perceptual hash
      const hash = this._computeHash();
      const now = Date.now();

      // Check cache
      if (!force && this._lastHash === hash && (now - this._lastCaptureTime) < CACHE_TTL) {
        this._emit("cache_hit", { hash });
        return { captured: false, reason: "cached", hash, result: this._lastResult };
      }

      // New frame — update cache
      this._lastHash = hash;
      this._lastCaptureTime = now;

      this._emit("captured", { hash, size: base64.length });
      return { captured: true, base64, hash };
    }

    /**
     * Store the last analysis result for cache reference.
     */
    setLastResult(result) {
      this._lastResult = result;
    }

    /**
     * Clear the vision cache.
     */
    clearCache() {
      this._lastHash = null;
      this._lastCaptureTime = 0;
      this._lastResult = null;
    }

    /**
     * Stop camera and clean up.
     */
    destroy() {
      this.isActive = false;

      if (this.stream) {
        this.stream.getTracks().forEach((t) => t.stop());
        this.stream = null;
      }

      if (this.video && this.video.parentNode) {
        this.video.parentNode.removeChild(this.video);
      }
      this.video = null;
      this.canvas = null;
      this.ctx = null;

      this._emit("destroyed", {});
    }

    /**
     * Event system.
     */
    on(event, callback) {
      if (!this._listeners[event]) this._listeners[event] = [];
      this._listeners[event].push(callback);
    }

    _emit(event, data) {
      const handlers = this._listeners[event] || [];
      handlers.forEach((fn) => {
        try { fn(data); } catch (e) { console.error("[VisController] Event error:", e); }
      });
    }

    /**
     * Compute perceptual hash from canvas (8x8 brightness grid).
     */
    _computeHash() {
      if (!this.ctx || !this.canvas) return "";
      try {
        // Get small version for hash
        const small = document.createElement("canvas");
        small.width = 8;
        small.height = 8;
        const sCtx = small.getContext("2d");
        sCtx.drawImage(this.canvas, 0, 0, 8, 8);

        const imageData = sCtx.getImageData(0, 0, 8, 8);
        const pixels = imageData.data;

        // Extract brightness values and compute average
        let sum = 0;
        const brightness = [];
        for (let i = 0; i < pixels.length; i += 4) {
          const b = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
          brightness.push(b);
          sum += b;
        }
        const avg = sum / brightness.length;

        // Create binary hash from brightness comparison
        const bits = brightness.map((b) => (b > avg ? "1" : "0")).join("");
        return bits;
      } catch (e) {
        return "";
      }
    }
  }

  // Singleton
  global.AevraVisController = new VisController();
})(window);
