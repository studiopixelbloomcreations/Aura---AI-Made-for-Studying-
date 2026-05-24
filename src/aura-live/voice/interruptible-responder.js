// Interruptible Responder for Aura Live Voice Engine
"use strict";

class InterruptibleResponder {
  constructor(options) {
    this.onResponseStart = options.onResponseStart;
    this.onResponseEnd = options.onResponseEnd;
    this.onInterrupted = options.onInterrupted;
    this.isSpeaking = false;
    this.canBeInterrupted = true;
    this.interruptSource = null;
  }
  
  startSpeaking() {
    if (this.isSpeaking) return;
    
    this.isSpeaking = true;
    this.onResponseStart();
  }
  
  stopSpeaking() {
    if (!this.isSpeaking) return;
    
    this.isSpeaking = false;
    this.onResponseEnd();
  }
  
  interrupt() {
    if (this.isSpeaking && this.canBeInterrupted) {
      this.isSpeaking = false;
      if (this.onInterrupted) {
        this.onInterrupted();
      }
    }
  }
  
  setCanBeInterrupted(value) {
    this.canBeInterrupted = value;
  }
  
  // Set interrupt source (e.g., speech recognition, wake word detector)
  setInterruptSource(source) {
    this.interruptSource = source;
  }
  
  // Check if interruption is allowed
  isInterruptionAllowed() {
    return this.canBeInterrupted && !!this.interruptSource;
  }
}

// Export for use in browser and Node.js
if (typeof module !== "undefined" && module.exports) {
  module.exports = InterruptibleResponder;
} else {
  window.InterruptibleResponder = InterruptibleResponder;
}