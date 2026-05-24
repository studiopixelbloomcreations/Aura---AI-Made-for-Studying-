// Aura Live Core - Realtime Intelligence Interface Core
"use strict";

class AuraLiveCore {
  constructor() {
    this.state = {
      active: false,
      listening: false,
      processing: false,
      speaking: false,
      voice: {
        wakeWordDetected: false,
        audioLevel: 0,
        transcript: ""
      },
      vision: {
        cameraActive: false,
        objects: [],
        text: "",
        scene: ""
      },
      context: {
        currentWorkflow: "idle",
        activeModules: [],
        intention: "",
        confidence: 0
      },
      memory: {
        recentFacts: [],
        activeProjects: [],
        learningPatterns: {}
      }
    };
    
    this.modules = {};
    this.eventListeners = new Map();
  }
  
  // Initialize all Aura Live modules
  async initialize() {
    try {
      // Initialize voice module
      if (this.modules.voice) {
        await this.modules.voice.initialize();
      }
      
      // Initialize vision module
      if (this.modules.vision) {
        await this.modules.vision.initialize();
      }
      
      // Initialize context module
      if (this.modules.context) {
        await this.modules.context.initialize();
      }
      
      // Initialize memory module
      if (this.modules.memory) {
        await this.modules.memory.initialize();
      }
      
      this.state.active = true;
      return { success: true };
    } catch (error) {
      console.error("Failed to initialize Aura Live Core:", error);
      return { success: false, error: error.message };
    }
  }
  
  // Register a module
  registerModule(name, module) {
    this.modules[name] = module;
    if (this.state.active && module.initialize) {
      module.initialize().catch(console.error);
    }
  }
  
  // Update state
  updateState(updates) {
    this.state = { ...this.state, ...updates };
    this.notifyStateChange();
  }
  
  // Get current state
  getState() {
    return { ...this.state };
  }
  
  // Subscribe to state changes
  subscribeToStateChanges(callback) {
    const id = Math.random().toString(36).substr(2, 9);
    this.eventListeners.set(id, callback);
    return id;
  }
  
  // Unsubscribe from state changes
  unsubscribeFromStateChanges(id) {
    this.eventListeners.delete(id);
  }
  
  // Notify state change listeners
  notifyStateChange() {
    this.eventListeners.forEach(callback => {
      try {
        callback(this.getState());
      } catch (error) {
        console.error("Error in state change listener:", error);
      }
    });
  }
  
  // Process voice input
  async processVoiceInput(audioData) {
    this.updateState({ 
      ...this.state,
      voice: { ...this.state.voice, processing: true }
    });
    
    try {
      if (this.modules.voice && this.modules.voice.processAudio) {
        const result = await this.modules.voice.processAudio(audioData);
        this.updateState({ 
          ...this.state,
          voice: { ...this.state.voice, transcript: result.text || "", processing: false }
        });
        return result;
      }
    } catch (error) {
      console.error("Error processing voice input:", error);
      this.updateState({ 
        ...this.state,
        voice: { ...this.state.voice, processing: false, error: error.message }
      });
      throw error;
    }
  }
  
  // Process vision input
  async processVisionInput(imageData) {
    this.updateState({ 
      ...this.state,
      vision: { ...this.state.vision, processing: true }
    });
    
    try {
      if (this.modules.vision && this.modules.vision.processImage) {
        const result = await this.modules.vision.processImage(imageData);
        this.updateState({ 
          ...this.state,
          vision: { ...this.state.vision, ...result, processing: false }
        });
        return result;
      }
    } catch (error) {
      console.error("Error processing vision input:", error);
      this.updateState({ 
        ...this.state,
        vision: { ...this.state.vision, processing: false, error: error.message }
      });
      throw error;
    }
  }
  
  // Inject context into NCS/Harmony
  generateContextInjection() {
    return {
      workflow: this.state.context.currentWorkflow,
      activeModules: this.state.context.activeModules,
      intention: this.state.context.intention,
      confidence: this.state.context.confidence,
      recentFacts: this.state.memory.recentFacts.slice(0, 5),
      activeProjects: this.state.memory.activeProjects,
      voiceTranscript: this.state.voice.transcript,
      visionScene: this.state.vision.scene,
      visionObjects: this.state.vision.objects,
      visionText: this.state.vision.text
    };
  }
  
  // Shutdown
  async shutdown() {
    // Shutdown all modules
    for (const [name, module] of Object.entries(this.modules)) {
      if (module.shutdown) {
        try {
          await module.shutdown();
        } catch (error) {
          console.error(`Error shutting down module ${name}:`, error);
        }
      }
    }
    
    this.state.active = false;
    this.eventListeners.clear();
  }
}

// Export for use in browser and Node.js
if (typeof module !== "undefined" && module.exports) {
  module.exports = AuraLiveCore;
} else {
  window.AuraLiveCore = AuraLiveCore;
}