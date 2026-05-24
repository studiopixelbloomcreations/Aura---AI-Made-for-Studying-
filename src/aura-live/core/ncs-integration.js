// Aura Live NCS Integration - Bridges Aura Live with Neural Command System
const { detectSystemState, buildCognitiveBlueprint, compileCognitivePrompt } = require("../../../core/ncs_engine");

class AuraLiveNCSIntegration {
  constructor(auraLiveCore) {
    this.auraLiveCore = auraLiveCore;
    this.ncsBlueprint = null;
    this.lastNCSUpdate = 0;
    this.NCS_UPDATE_INTERVAL = 1000; // Update NCS every second max
  }
  
  // Update NCS based on current Aura Live state
  async updateNCSContext() {
    const now = Date.now();
    // Throttle updates to prevent excessive processing
    if (now - this.lastNCSUpdate < this.NCS_UPDATE_INTERVAL) {
      return this.ncsBlueprint;
    }
    
    try {
      const liveState = this.auraLiveCore.getState();
      
      // Build context for NCS from Aura Live state
      const ncsContext = {
        userMessage: liveState.voice.transcript || "",
        observatoryOutput: {
          type: liveState.context.currentWorkflow,
          complexity: this.detectComplexityFromState(liveState),
          objects: liveState.vision.objects,
          scene: liveState.vision.scene,
          text: liveState.vision.text
        },
        activeModules: liveState.context.activeModules,
        recentCalls: this.getRecentCalls(liveState),
        metadata: {
          providerAvailability: this.getProviderAvailability(),
          complexity: this.detectComplexityFromState(liveState)
        },
        sessionData: {
          profile: this.getUserProfile(liveState),
          personalization: this.getPersonalizationData(liveState),
          ai_config: this.getAIConfig(liveState)
        }
      };
      
      // Detect system state using NCS
      const systemState = detectSystemState(ncsContext);
      
      // Build cognitive blueprint
      const cognitiveBlueprint = buildCognitiveBlueprint(ncsContext, systemState);
      
      // Compile cognitive prompt
      const ncsPrompt = compileCognitivePrompt(cognitiveBlueprint);
      
      this.ncsBlueprint = {
        systemState,
        cognitiveBlueprint,
        ncsPrompt,
        timestamp: now
      };
      
      this.lastNCSUpdate = now;
      
      // Notify Aura Live core of NCS update
      this.auraLiveCore.updateState({
        context: {
          ...liveState.context,
          ncsConfidence: systemState.confidence,
          ncsWorkflow: systemState.systemType
        }
      });
      
      return this.ncsBlueprint;
    } catch (error) {
      console.error("Error updating NCS context:", error);
      return this.ncsBlueprint || null;
    }
  }
  
  // Get current NCS blueprint
  getCurrentNCSBlueprint() {
    return this.ncsBlueprint;
  }
  
  // Detect complexity from Aura Live state
  detectComplexityFromState(state) {
    // Simple heuristic based on voice transcript length and vision data
    const voiceLength = (state.voice.transcript || "").length;
    const visionComplexity = state.vision.objects.length + (state.vision.scene ? 1 : 0);
    
    if (voiceLength > 100 || visionComplexity > 5) return "high";
    if (voiceLength > 50 || visionComplexity > 2) return "medium";
    return "low";
  }
  
  // Get recent calls from state (simplified)
  getRecentCalls(state) {
    // In a real implementation, this would track actual function calls
    const calls = [];
    if (state.voice.transcript) calls.push("voice_input");
    if (state.vision.objects.length > 0) calls.push("vision_input");
    if (state.context.currentWorkflow !== "idle") calls.push("workflow_active");
    return calls;
  }
  
  // Get provider availability (placeholder - would integrate with actual provider system)
  getProviderAvailability() {
    return {
      groq: true,
      openrouter: true,
      mistral: true,
      huggingface: true,
      deepseek: true,
      puter: true
    };
  }
  
  // Get user profile (placeholder)
  getUserProfile(state) {
    // Would integrate with actual profile system
    return {
      userId: "current_user",
      name: "Student",
      grade: 9,
      language: state.context.language || "English"
    };
  }
  
  // Get personalization data (placeholder)
  getPersonalizationData(state) {
    // Would integrate with actual personalization system
    return {
      tone: "friendly",
      humorLevel: 5,
      verbosity: "medium",
      teachingStyle: "socratic"
    };
  }
  
  // Get AI config (placeholder)
  getAIConfig(state) {
    // Would integrate with actual AI config system
    return {
      preferredModels: ["groq", "openrouter"],
      temperature: 0.7,
      maxTokens: 1000
    };
  }
  
  // Shutdown
  async shutdown() {
    this.ncsBlueprint = null;
    this.lastNCSUpdate = 0;
  }
}

// Export for use in browser and Node.js
if (typeof module !== "undefined" && module.exports) {
  module.exports = AuraLiveNCSIntegration;
} else {
  window.AuraLiveNCSIntegration = AuraLiveNCSIntegration;
}