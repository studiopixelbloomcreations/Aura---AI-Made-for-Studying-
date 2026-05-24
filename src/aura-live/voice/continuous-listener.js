// Continuous Listener for Aura Live Voice Engine
"use strict";

class ContinuousListener {
  constructor(options) {
    this.onVoiceActivityStart = options.onVoiceActivityStart;
    this.onVoiceActivityEnd = options.onVoiceActivityEnd;
    this.onSpeechDetected = options.onSpeechDetected;
    this.sampleRate = options.sampleRate;
    this.bufferSize = options.bufferSize;
    this.isListening = false;
    this.silentFrames = 0;
    this.voiceFrames = 0;
    this.audioBuffer = [];
    this.SILENCE_THRESHOLD = 0.01;
    this.MIN_VOICE_FRAMES = 10; // Minimum frames to consider as voice
    this.SILENCE_FRAMES_TO_END = 20; // Frames of silence to end utterance
    this.speechDetected = false;
  }
  
  process(audioBuffer) {
    if (!this.isListening) return;
    
    // Add new samples to buffer
    this.audioBuffer.push(...Array.from(audioBuffer));
    
    // Process in chunks of bufferSize
    while (this.audioBuffer.length >= this.bufferSize) {
      const chunk = this.audioBuffer.splice(0, this.bufferSize);
      const energy = this.calculateEnergy(chunk);
      
      if (energy > this.SILENCE_THRESHOLD) {
        // Voice activity detected
        this.silentFrames = 0;
        this.voiceFrames++;
        
        // If we have enough voice frames, consider it speech
        if (this.voiceFrames >= this.MIN_VOICE_FRAMES && !this.speechDetected) {
          this.speechDetected = true;
          this.onVoiceActivityStart();
        }
      } else {
        // Silence detected
        if (this.speechDetected) {
          this.silentFrames++;
          
          // If enough silence frames, consider utterance ended
          if (this.silentFrames >= this.SILENCE_FRAMES_TO_END) {
            this.speechDetected = false;
            this.voiceFrames = 0;
            this.onVoiceActivityEnd();
            
            // Process the collected audio as speech
            if (this.audioBuffer.length > 0) {
              const speechData = new Float32Array(this.audioBuffer);
              this.audioBuffer = [];
              this.onSpeechDetected(speechData);
            }
          }
        }
      }
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
    this.silentFrames = 0;
    this.voiceFrames = 0;
    this.speechDetected = false;
    this.audioBuffer = [];
  }
  
  stop() {
    this.isListening = false;
  }
}

// Export for use in browser and Node.js
if (typeof module !== "undefined" && module.exports) {
  module.exports = ContinuousListener;
} else {
  window.ContinuousListener = ContinuousListener;
}