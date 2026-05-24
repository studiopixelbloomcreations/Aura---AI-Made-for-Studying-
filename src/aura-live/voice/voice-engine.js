// Aura Live Voice Engine - Handles voice input/output using Puter.js
"use strict";

class AuraLiveVoiceEngine {
  constructor() {
    this.state = {
      initialized: false,
      listening: false,
      wakeWordDetected: false,
      transcript: "",
      audioLevel: 0,
      processor: null
    };
    
    this.audioContext = null;
    this.analyser = null;
    this.source = null;
    this.stream = null;
    this.processorNode = null;
    this.wakeWordDetector = null;
    this.continuousListener = null;
    this.interruptibleResponder = null;
    
    // Configuration
    this.config = {
      wakeWord: "hey aura",
      sampleRate: 16000,
      bufferSize: 256,
      silenceThreshold: 0.01,
      voiceActivityTimeout: 2000 // ms
    };
    
    // Bind methods
    this.processAudioCallback = this.processAudioCallback.bind(this);
    this.detectWakeWord = this.detectWakeWord.bind(this);
    this.handleVoiceActivity = this.handleVoiceActivity.bind(this);
  }
  
  // Initialize voice engine
  async initialize() {
    try {
      // Request microphone access
      this.stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          sampleRate: this.config.sampleRate,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        } 
      });
      
      // Set up audio context
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: this.config.sampleRate
      });
      
      // Create analyser for volume visualization
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      
      // Create audio processor for real-time processing
      this.processorNode = this.audioContext.createScriptProcessor(
        this.config.bufferSize, 
        1, 
        1
      );
      
      // Connect audio graph
      this.source = this.audioContext.createMediaStreamSource(this.stream);
      this.source.connect(this.analyser);
      this.analyser.connect(this.processorNode);
      this.processorNode.connect(this.audioContext.destination);
      
      // Initialize wake word detector
      this.wakeWordDetector = new WakeWordDetector({
        onWakeWordDetected: this.handleWakeWordDetected.bind(this),
        sampleRate: this.config.sampleRate,
        bufferSize: this.config.bufferSize
      });
      
      // Initialize continuous listener
      this.continuousListener = new ContinuousListener({
        onVoiceActivityStart: this.handleVoiceActivityStart.bind(this),
        onVoiceActivityEnd: this.handleVoiceActivityEnd.bind(this),
        onSpeechDetected: this.handleSpeechDetected.bind(this),
        sampleRate: this.config.sampleRate,
        bufferSize: this.config.bufferSize
      });
      
      // Initialize interruptible responder
      this.interruptibleResponder = new InterruptibleResponder({
        onResponseStart: this.handleResponseStart.bind(this),
        onResponseEnd: this.handleResponseEnd.bind(this),
        onInterrupted: this.handleInterrupted.bind(this)
      });
      
      // Set up audio processing callback
      this.processorNode.onaudioprocess = this.processAudioCallback;
      
      this.state.initialized = true;
      return { success: true };
    } catch (error) {
      console.error("Failed to initialize voice engine:", error);
      await this.shutdown();
      return { success: false, error: error.message };
    }
  }
  
  // Process audio callback from ScriptProcessorNode
  processAudioCallback(event) {
    if (!this.state.initialized) return;
    
    const inputBuffer = event.inputBuffer.getChannelData(0);
    
    // Update audio level for visualization
    this.updateAudioLevel(inputBuffer);
    
    // Route audio to different processors based on state
    if (this.state.listening && !this.state.wakeWordDetected) {
      // Listening for wake word
      this.wakeWordDetector.process(inputBuffer);
    } else if (this.state.wakeWordDetected || this.state.listening) {
      // Processing voice command or in continuous listening mode
      this.continuousListener.process(inputBuffer);
    }
  }
  
  // Update audio level for UI visualization
  updateAudioLevel(buffer) {
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      sum += buffer[i] * buffer[i];
    }
    const rms = Math.sqrt(sum / buffer.length);
    this.state.audioLevel = Math.min(rms * 100, 100); // Scale to 0-100
  }
  
  // Handle wake word detection
  async handleWakeWordDetected() {
    this.state.wakeWordDetected = true;
    this.updateState({ wakeWordDetected: true });
    
    // Give user feedback that wake word was detected
    // In a real implementation, this might play a sound or show visual feedback
    
    // Start processing voice command after wake word
    setTimeout(() => {
      this.state.wakeWordDetected = false;
      this.updateState({ wakeWordDetected: false });
    }, 1500); // Reset after 1.5 seconds
  }
  
  // Handle voice activity start
  handleVoiceActivityStart() {
    this.updateState({ listening: true });
  }
  
  // Handle voice activity end
  handleVoiceActivityEnd() {
    this.updateState({ listening: false });
  }
  
  // Handle speech detection
  async handleSpeechDetected(audioData) {
    try {
      // Process the detected speech
      const result = await this.processSpeech(audioData);
      
      // Update transcript
      this.state.transcript = result.text || "";
      this.updateState({ transcript: this.state.transcript });
      
      // If we have a transcript, process it through NCS/Harmony
      if (this.state.transcript.trim().length > 0) {
        await this.processVoiceCommand(this.state.transcript);
      }
    } catch (error) {
      console.error("Error handling speech detection:", error);
    } finally {
      // Reset listening state after processing
      setTimeout(() => {
        this.updateState({ listening: false });
      }, this.config.voiceActivityTimeout);
    }
  }
  
  // Process speech audio data (would send to backend for recognition)
  async processSpeech(audioData) {
    // Convert audio data to blob for transmission
    const audioBlob = this.audioDataToBlob(audioData);
    
    // In a real implementation, this would send to voice recognition service
    // For now, we'll simulate with a placeholder
    return {
      text: "[Speech recognition would happen here]",
      confidence: 0.85
    };
  }
  
  // Convert audio data to blob
  audioDataToBlob(audioData) {
    // Convert Float32Array to WAV blob (simplified)
    const wavBuffer = this.encodeWAV(audioData);
    return new Blob([wavBuffer], { type: 'audio/wav' });
  }
  
  // Encode audio data as WAV (simplified implementation)
  encodeWAV(samples) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    
    // RIFF identifier
    this.writeString(view, 0, 'RIFF');
    // RIFF length
    view.setUint32(4, 36 + samples.length * 2, true);
    // RIFF type
    this.writeString(view, 8, 'WAVE');
    // format chunk identifier
    this.writeString(view, 12, 'fmt ');
    // format chunk length
    view.setUint32(16, 16, true);
    // audio format (1 = PCM)
    view.setUint16(20, 1, true);
    // number of channels
    view.setUint16(22, 1, true);
    // sample rate
    view.setUint32(24, this.config.sampleRate, true);
    // byte rate (sample rate * block align)
    view.setUint32(28, this.config.sampleRate * 4, true);
    // block align (channel count * bytes per sample)
    view.setUint16(32, 4, true);
    // bits per sample
    view.setUint16(34, 16, true);
    // data chunk identifier
    this.writeString(view, 36, 'data');
    // data chunk length
    view.setUint32(40, samples.length * 2, true);
    
    // Write PCM samples
    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
      let s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }
    
    return view;
  }
  
  // Write string to DataView
  writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }
  
  // Process voice command through NCS/Harmony
  async processVoiceCommand(transcript) {
    try {
      // Update state to processing
      this.updateState({ 
        ...this.state,
        processing: true,
        listening: false
      });
      
      // In a real implementation, this would:
      // 1. Send transcript to NCS for analysis
      // 2. Get cognitive blueprint from NCS
      // 3. Route to Harmony engine for multi-model processing
      // 4. Get response and send to TTS
      
      // For now, simulate processing
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Update state to speaking
      this.updateState({ 
        ...this.state,
        speaking: true,
        processing: false
      });
      
      // Simulate speaking
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Return to listening state
      this.updateState({ 
        ...this.state,
        speaking: false,
        listening: true
      });
      
    } catch (error) {
      console.error("Error processing voice command:", error);
      this.updateState({ 
        ...this.state,
        processing: false,
        speaking: false,
        listening: true,
        error: error.message
      });
    }
  }
  
  // Update state and notify listeners
  updateState(updates) {
    this.state = { ...this.state, ...updates };
    // In a real implementation, this would notify UI components
    // For now, we'll just log state changes
    // console.log("Voice state updated:", this.state);
  }
  
  // Start listening for wake word
  async startListening() {
    if (!this.state.initialized) {
      await this.initialize();
    }
    
    this.updateState({ listening: true });
    return { success: true };
  }
  
  // Stop listening
  stopListening() {
    this.updateState({ 
      listening: false,
      wakeWordDetected: false,
      processing: false,
      speaking: false
    });
    return { success: true };
  }
  
  // Process audio input directly (for testing)
  async processAudio(audioData) {
    return this.processSpeech(audioData);
  }
  
  // Shutdown voice engine
  async shutdown() {
    // Stop audio processing
    if (this.processorNode) {
      this.processorNode.onaudioprocess = null;
    }
    
    // Close media stream
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    
    // Close audio context
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    
    // Reset state
    this.state = {
      initialized: false,
      listening: false,
      wakeWordDetected: false,
      transcript: "",
      audioLevel: 0,
      processor: null
    };
    
    return { success: true };
  }
}

// Wake Word Detector (simplified)
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

// Continuous Listener (simplified)
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

// Interruptible Responder (simplified)
class InterruptibleResponder {
  constructor(options) {
    this.onResponseStart = options.onResponseStart;
    this.onResponseEnd = options.onResponseEnd;
    this.onInterrupted = options.onInterrupted;
    this.isSpeaking = false;
    this.canBeInterrupted = true;
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
      this.onInterrupted();
    }
  }
  
  setCanBeInterrupted(value) {
    this.canBeInterrupted = value;
  }
}

// Export for use in browser and Node.js
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    AuraLiveVoiceEngine,
    WakeWordDetector,
    ContinuousListener,
    InterruptibleResponder
  };
} else {
  window.AuraLiveVoiceEngine = AuraLiveVoiceEngine;
  window.WakeWordDetector = WakeWordDetector;
  window.ContinuousListener = ContinuousListener;
  window.InterruptibleResponder = InterruptibleResponder;
}