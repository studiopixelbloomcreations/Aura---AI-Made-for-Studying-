// src/aura-live/personality/personality-engine.js
"use strict";

/**
 * Personality Engine - Dynamically adapts AI behavior based on user profile, context, and interaction history.
 */
class PersonalityEngine {
  constructor(memoryGraphEngine, contextEngine, identityManager, selfImprovementEngine) {
    this.memoryGraph = memoryGraphEngine;
    this.context = contextEngine;
    this.identity = identityManager;
    this.selfImprovement = selfImprovementEngine;

    // Personality traits (default values, will be overridden by identity and learning)
    this.traits = {
      humorLevel: 0.5,           // 0.0 (serious) to 1.0 (very humorous)
      speechStyle: "adaptive",   // e.g., "formal", "casual", "enthusiastic", "empathetic"
      pacing: 0.5,               // 0.0 (fast) to 1.0 (slow)
      verbosity: 0.5,            // 0.0 (terse) to 1.0 (very verbose)
      emotionalWarmth: 0.5,      // 0.0 (detached) to 1.0 (very warm)
      explanationDepth: 0.5,     // 0.0 (surface) to 1.0 (deep)
      teachingStyle: "socratic", // e.g., "socratic", "directive", "exploratory", "mentor"
      interactionStyle: "adaptive" // e.g., "adaptive", "collaborative", "guiding"
    };

    // Base traits from identity (set during initialization)
    this.baseTraits = { ...this.traits };

    // Tracking
    this.lastUpdate = null;
    this.updateInterval = 5000; // Update every 5 seconds (can be adjusted)
    this.isInitialized = false;

    // Bind methods
    this.updateTraits = this.updateTraits.bind(this);
  }

  /**
   * Initialize the personality engine.
   * @returns {Promise<Object>} Result of initialization.
   */
  async initialize() {
    try {
      // Load base traits from identity
      await this.loadBaseTraitsFromIdentity();

      // Load any existing personality traits from memory graph (if any)
      await this.loadTraitsFromMemoryGraph();

      // Set up periodic updates (optional, we can also update on events)
      this.updateIntervalId = setInterval(this.updateTraits, this.updateInterval);

      this.isInitialized = true;
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Load base traits from the identity system.
   */
  async loadBaseTraitsFromIdentity() {
    try {
      const profile = this.identity.getProfile();
      if (profile && profile.personalization_data) {
        const answers = profile.personalization_data;

        // Map personalization answers to traits
        // Example mappings (adjust based on actual personalization questions)
        if (answers.humor_level !== undefined) {
          this.baseTraits.humorLevel = this.normalizeHumorLevel(answers.humor_level);
        }
        if (answers.speech_style !== undefined) {
          this.baseTraits.speechStyle = answers.speech_style;
        }
        if (answers.pacing !== undefined) {
          this.baseTraits.pacing = this.normalizePacing(answers.pacing);
        }
        if (answers.verbosity !== undefined) {
          this.baseTraits.verbosity = this.normalizeVerbosity(answers.verbosity);
        }
        if (answers.emotional_warmth !== undefined) {
          this.baseTraits.emotionalWarmth = this.normalizeEmotionalWarmth(answers.emotional_warmth);
        }
        if (answers.explanation_depth !== undefined) {
          this.baseTraits.explanationDepth = this.normalizeExplanationDepth(answers.explanation_depth);
        }
        if (answers.teaching_style !== undefined) {
          this.baseTraits.teachingStyle = answers.teaching_style;
        }
        if (answers.interaction_style !== undefined) {
          this.baseTraits.interactionStyle = answers.interaction_style;
        }
      }

      // Start with base traits
      this.traits = { ...this.baseTraits };
    } catch (error) {
      console.warn("Could not load base traits from identity:", error);
    }
  }

  /**
   * Load personality traits from memory graph (if stored).
   */
  async loadTraitsFromMemoryGraph() {
    try {
      // We might store personality traits as a special node type in memory graph
      // For now, we'll skip and rely on base traits and real-time updates.
      // In a future enhancement, we could store and retrieve the trait history.
    } catch (error) {
      console.warn("Could not load traits from memory graph:", error);
    }
  }

  /**
   * Update personality traits based on current context, memory, and behavior.
   * This method should be called periodically or in response to significant events.
   */
  async updateTraits() {
    if (!this.isInitialized) return;

    try {
      // Start with base traits
      let updatedTraits = { ...this.baseTraits };

      // Get current context
      const context = this.context.getState();

      // Get memory graph summary for recent interactions
      const memorySummary = this.memoryGraph.getContextSummary();

      // Get self-improvement signals (if available)
      const improvementSignals = this.selfImprovement ? this.selfImprovement.getExecutionStats() : {};

      // Get identity profile for baseline preferences
      const profile = this.identity.getProfile();
      const personalizationData = profile ? profile.personalization_data : {};

      // Adjust traits based on context (workflow, intention)
      updatedTraits = this.adjustTraitsByContext(updatedTraits, context);

      // Adjust traits based on memory (recent interactions, learning patterns)
      updatedTraits = this.adjustTraitsByMemory(updatedTraits, memorySummary);

      // Adjust traits based on self-improvement signals (success/failure rates, etc.)
      updatedTraits = this.adjustTraitsByImprovement(updatedTraits, improvementSignals);

      // Adjust traits based on identity (age, learning style, etc.) - already in baseTraits, but we can fine-tune
      updatedTraits = this.adjustTraitsByIdentity(updatedTraits, personalizationData);

      // Apply constraints (ensure values are within bounds)
      updatedTraits = this.constrainTraits(updatedTraits);

      // Only update if there's a significant change (to avoid excessive updates)
      if (this.hasSignificantChange(this.traits, updatedTraits)) {
        this.traits = updatedTraits;
        this.lastUpdate = new Date().toISOString();

        // Optionally, store the updated traits in memory graph for persistence
        await this.storeTraitsInMemoryGraph();

        // Notify subsystems (e.g., via events or direct calls) - for now, we'll just log
        // In a real implementation, we might emit an event or update a global state
        console.debug("Personality traits updated:", this.traits);
      }
    } catch (error) {
      console.error("Error updating personality traits:", error);
    }
  }

  /**
   * Adjust traits based on current workflow and intention from context engine.
   * @param {Object} traits - Current traits to adjust
   * @param {Object} context - Context engine state
   * @returns {Object} Adjusted traits
   */
  adjustTraitsByContext(traits, context) {
    const { currentWorkflow, intention, confidence } = context;

    // Adjust based on workflow
    switch (currentWorkflow) {
      case "study":
        // During study: increase explanation depth, decrease humor slightly, more direct teaching style
        traits.explanationDepth = Math.min(1.0, traits.explanationDepth + 0.1);
        traits.humorLevel = Math.max(0.0, traits.humorLevel - 0.05);
        traits.teachingStyle = "directive";
        break;
      case "conversation":
        // During conversation: increase emotional warmth, increase humor, more adaptive style
        traits.emotionalWarmth = Math.min(1.0, traits.emotionalWarmth + 0.1);
        traits.humorLevel = Math.min(1.0, traits.humorLevel + 0.1);
        traits.teachingStyle = "socratic";
        break;
      case "creation":
        // During creation: increase verbosity, increase humor, more exploratory style
        traits.verbosity = Math.min(1.0, traits.verbosity + 0.1);
        traits.humorLevel = Math.min(1.0, traits.humorLevel + 0.1);
        traits.teachingStyle = "exploratory";
        break;
      case "research":
        // During research: increase explanation depth, decrease pacing (more thoughtful), more directive
        traits.explanationDepth = Math.min(1.0, traits.explanationDepth + 0.15);
        traits.pacing = Math.min(1.0, traits.pacing + 0.1);
        traits.teachingStyle = "directive";
        break;
      case "problem_solving":
        // During problem solving: increase pacing (more thoughtful), increase explanation depth, more directive
        traits.pacing = Math.min(1.0, traits.pacing + 0.1);
        traits.explanationDepth = Math.min(1.0, traits.explanationDepth + 0.1);
        traits.teachingStyle = "directive";
        break;
      default:
        // idle or unknown: no specific adjustment
        break;
    }

    // Adjust based on intention (if confidence is high enough)
    if (confidence > 0.6) {
      switch (intention) {
        case "explanation_request":
          traits.explanationDepth = Math.min(1.0, traits.explanationDepth + 0.1);
          traits.teachingStyle = "directive";
          break;
        case "help_request":
          traits.emotionalWarmth = Math.min(1.0, traits.emotionalWarmth + 0.1);
          traits.teachingStyle = "mentor";
          break;
        case "calculation_request":
          traits.pacing = Math.min(1.0, traits.pacing + 0.05); // Slightly more thoughtful
          traits.verbosity = Math.max(0.0, traits.verbosity - 0.1); // More terse for calculations
          break;
        case "example_request":
          traits.teachingStyle = "exploratory";
          traits.verbosity = Math.min(1.0, traits.verbosity + 0.05);
          break;
        case "definition_request":
          traits.explanationDepth = Math.min(1.0, traits.explanationDepth + 0.05);
          traits.teachingStyle = "directive";
          break;
        default:
          break;
      }
    }

    return traits;
  }

  /**
   * Adjust traits based on memory graph summary (recent interactions, learning patterns).
   * @param {Object} traits - Current traits to adjust
   * @param {Object} memorySummary - Summary from memory graph engine
   * @returns {Object} Adjusted traits
   */
  adjustTraitsByMemory(traits, memorySummary) {
    // Example: if the user has been struggling with a topic, increase explanation depth and emotional warmth
    // We don't have specific struggling data in the summary, but we can look at recent facts or learning patterns if available.

    // For now, we'll skip this adjustment and rely on context and self-improvement.
    // In a future enhancement, we can analyze the memory graph for patterns.
    return traits;
  }

  /**
   * Adjust traits based on self-improvement signals (success/failure rates, etc.).
   * @param {Object} traits - Current traits to adjust
   * @param {Object} improvementSignals - Signals from self-improvement engine
   * @returns {Object} Adjusted traits
   */
  adjustTraitsByImprovement(traits, improvementSignals) {
    // Example: if the user is rejecting responses frequently, we might adjust humor or explanation depth.
    // Since we don't have the self-improvement engine fully implemented yet, we'll skip.
    return traits;
  }

  /**
   * Adjust traits based on identity (age, learning style, etc.).
   * @param {Object} traits - Current traits to adjust
   * @param {Object} personalizationData - User's personalization answers
   * @returns {Object} Adjusted traits
   */
  adjustTraitsByIdentity(traits, personalizationData) {
    // We already set baseTraits from identity, but we can make small adjustments based on specific answers.
    // For example, if the user prefers a certain teaching style, we can nudge the trait towards that.

    // Example: if the user said they like a "humorous" style, we can increase humor level.
    // We already mapped humor_level in loadBaseTraitsFromIdentity, so we might not need to do much here.

    // However, we can adjust based on combinations or context-specific preferences.
    // For now, we'll return the traits as they are (baseTraits already applied).
    return traits;
  }

  /**
   * Ensure trait values are within valid bounds.
   * @param {Object} traits - Traits to constrain
   * @returns {Object} Constrained traits
   */
  constrainTraits(traits) {
    // Constrain numeric traits to [0, 1]
    const numericTraits = ["humorLevel", "pacing", "verbosity", "emotionalWarmth", "explanationDepth"];
    numericTraits.forEach(trait => {
      if (traits[trait] !== undefined) {
        traits[trait] = Math.max(0, Math.min(1, traits[trait]));
      }
    });

    // Ensure string traits are valid (we'll accept any string, but we can have a list of allowed values)
    const allowedSpeechStyles = ["adaptive", "formal", "casual", "enthusiastic", "empathetic"];
    const allowedTeachingStyles = ["socratic", "directive", "exploratory", "mentor"];
    const allowedInteractionStyles = ["adaptive", "collaborative", "guiding", "directive"];

    if (traits.speechStyle && !allowedSpeechStyles.includes(traits.speechStyle)) {
      traits.speechStyle = "adaptive";
    }
    if (traits.teachingStyle && !allowedTeachingStyles.includes(traits.teachingStyle)) {
      traits.teachingStyle = "socratic";
    }
    if (traits.interactionStyle && !allowedInteractionStyles.includes(traits.interactionStyle)) {
      traits.interactionStyle = "adaptive";
    }

    return traits;
  }

  /**
   * Check if there's a significant change between old and new traits.
   * @param {Object} oldTraits - Previous traits
   * @param {Object} newTraits - New traits
   * @returns {boolean} True if there's a significant change
   */
  hasSignificantChange(oldTraits, newTraits) {
    const threshold = 0.05; // 5% change threshold for numeric traits
    const numericTraits = ["humorLevel", "pacing", "verbosity", "emotionalWarmth", "explanationDepth"];

    for (const trait of numericTraits) {
      const oldVal = oldTraits[trait] || 0;
      const newVal = newTraits[trait] || 0;
      if (Math.abs(newVal - oldVal) > threshold) {
        return true;
      }
    }

    // Also check for changes in string traits
    const stringTraits = ["speechStyle", "teachingStyle", "interactionStyle"];
    for (const trait of stringTraits) {
      if (oldTraits[trait] !== newTraits[trait]) {
        return true;
      }
    }

    return false;
  }

  /**
   * Store the current personality traits in memory graph for persistence.
   * We'll store them as a node of type "personality_traits".
   */
  async storeTraitsInMemoryGraph() {
    try {
      // We'll store the traits as a single node with the current timestamp.
      // We can update the same node by storing it with a fixed ID or by updating the existing node.
      // For simplicity, we'll create a new node each time (the memory graph engine can handle pruning).

      const nodeId = this.memoryGraph.addNode(
        "personality_traits",
        {
          traits: this.traits,
          timestamp: this.lastUpdate
        },
        0.8, // High importance for personality traits
        this.identity.getUniqueId() // Link to the user's project (or we can use a fixed project ID for personality)
      );

      // We don't need to do anything with the nodeId for now, but we can log it.
      // console.debug("Stored personality traits node:", nodeId);
    } catch (error) {
      console.warn("Could not store personality traits in memory graph:", error);
    }
  }

  /**
   * Get the current personality traits.
   * @returns {Object} A copy of the current traits.
   */
  getTraits() {
    return { ...this.traits };
  }

  /**
   * Get a specific trait value.
   * @param {string} traitName - The name of the trait (e.g., "humorLevel")
   * @returns {*} The trait value or undefined if not found.
   */
  getTrait(traitName) {
    return this.traits[traitName];
  }

  /**
   * Set a trait directly (for testing or external adjustment).
   * @param {string} traitName - The name of the trait
   * @param {*} value - The value to set
   */
  setTrait(traitName, value) {
    if (this.traits.hasOwnProperty(traitName)) {
      this.traits[traitName] = value;
      this.lastUpdate = new Date().toISOString();
    }
  }

  /**
   * Reset traits to base traits (from identity).
   */
  resetToBase() {
    this.traits = { ...this.baseTraits };
    this.lastUpdate = new Date().toISOString();
  }

  /**
   * Shutdown the personality engine.
   * @returns {Promise<Object>} Result of shutdown.
   */
  async shutdown() {
    if (this.updateIntervalId) {
      clearInterval(this.updateIntervalId);
      this.updateIntervalId = null;
    }
    this.isInitialized = false;
    return { success: true };
  }
}

// Export for use in browser and Node.js
if (typeof module !== "undefined" && module.exports) {
  module.exports = PersonalityEngine;
} else {
  window.PersonalityEngine = PersonalityEngine;
}