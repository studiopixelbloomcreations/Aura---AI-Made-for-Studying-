// Wake Word Detector for Aura Live Voice Engine
"use strict";

class WakeWordDetector {
  constructor(options) {
    this.onWakeWordDetected = options.onWakeWordDetected;
    this.sampleRate = options.sampleRate;
    this.bufferSize = options.bufferSize;
    this.buffer = [];
    this.isListening = false;
  }
  
  process(audioBuffer) {
    if (!this.isListening) return;
    
    // Add new samples to buffer
    this.buffer.push(...Array.from(audioBuffer));
    
    // Keep buffer at reasonable size
    const maxBufferSize = this.sampleRate * 2; // 2 seconds of audio
    if (this.buffer.length > maxBufferSize) {
      this.buffer.splice(0, this.buffer.length - maxBufferSize);
    }
    
    // Simple energy-based wake word detection (placeholder)
    // In reality, this would use a proper wake word model like Porcupine
    const energy = this.calculateEnergy(this.buffer);
    if (energy > 0.1) { // Arbitrary threshold
      // Simulate wake word detection
      setTimeout(() => {
        this.onWakeWordDetected();
      }, 100);
    }
  }
  
  calculateEnergy(samples) {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    return Math.sqrt(sum / samples.length);
  }
  
  start() {
    this.isListening = true;
    this.buffer = [];
  }
  
  stop() {
    this.isListening = false;
  }
}

// Export for use in browser and Node.js
if (typeof module !== "undefined" && module.exports) {
  module.exports = WakeWordDetector;
} else {
  window.WakeWordDetector = WakeWordDetector;
}