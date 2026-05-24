// src/aura-live/self-improvement/self-improvement-engine.js
"use strict";

/**
 * Self Improvement Engine - Tracks interactions and optimizes AI behavior over time.
 */
class SelfImprovementEngine {
  constructor(memoryGraphEngine, identityManager, personalityEngine) {
    this.memoryGraph = memoryGraphEngine;
    this.identity = identityManager;
    this.personality = personalityEngine;

    // Tracking data (in a real implementation, this would be stored in memory graph or backend)
    this.interactionHistory = []; // Array of interaction objects
    this.corrections = []; // User corrections to AI responses
    this.rejectedResponses = []; // Responses the user rejected or requested to change
    this.acceptedResponses = []; // Responses the user accepted or found helpful
    this.conversationLengths = []; // Length of conversations (in messages or time)
    this.returnFrequency = {} // Tracks how often the user returns (timestamps)
    this.satisfactionSignals = []; // Explicit satisfaction signals (thumbs up, etc.)
    this.failedActions = []; // Actions that failed (e.g., task execution failures)
    this.successfulActions = []; // Actions that succeeded
    this.preferredWorkflows = {} // Workflow preferences (counts)
    this.preferredResponseStructures = {} // Preferred response structures (e.g., bullet points, paragraphs)
    this.learningWeights = {} // Weights for different aspects of learning (to be adjusted)
    this.responseScoreHistory = [] // History of response scores

    // Configuration
    this.config = {
      maxHistory: 1000, // Maximum number of interactions to keep in memory
      correctionThreshold: 0.3, // Threshold for considering a correction significant
      satisfactionThreshold: 0.7, // Threshold for considering a response satisfactory
      learningRate: 0.01, // How quickly to adjust weights
      responseScoreDecay: 0.995 // Decay factor for response scores over time
    };

    // Bind methods
    this.recordInteraction = this.recordInteraction.bind(this);
    this.recordCorrection = this.recordCorrection.bind(this);
    this.recordRejectedResponse = this.recordRejectedResponse.bind(this);
    this.recordAcceptedResponse = this.recordAcceptedResponse.bind(this);
    this.recordConversationLength = this.recordConversationLength.bind(this);
    this.recordReturn = this.recordReturn.bind(this);
    this.recordSatisfactionSignal = this.recordSatisfactionSignal.bind(this);
    this.recordFailedAction = this.recordFailedAction.bind(this);
    this.recordSuccessfulAction = this.recordSuccessfulAction.bind(this);
    this.updatePreferredWorkflows = this.updatePreferredWorkflows.bind(this);
    this.updatePreferredResponseStructures = this.updatePreferredResponseStructures.bind(this);
    this.calculateResponseScore = this.calculateResponseScore.bind(this);
    this.updateLearningWeights = this.updateLearningWeights.bind(this);
    this.adaptiveRouting = this.adaptiveRouting.bind(this);
    this.autoPromptOptimizer = this.autoPromptOptimizer.bind(this);
    this.getExecutionStats = this.getExecutionStats.bind(this);
  }

  /**
   * Initialize the self-improvement engine.
   * @returns {Promise<Object>} Result of initialization.
   */
  async initialize() {
    try {
      // Load any existing data from memory graph (if we stored it previously)
      await this.loadDataFromMemoryGraph();

      // Set up periodic tasks (e.g., decaying old scores, saving to memory graph)
      this.decayIntervalId = setInterval(() => {
        this.applyResponseScoreDecay();
        this.saveDataToMemoryGraph();
      }, 60000); // Every minute

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Load data from memory graph (if we stored it previously).
   */
  async loadDataFromMemoryGraph() {
    try {
      // We could store our data as a special node type in the memory graph.
      // For simplicity, we'll skip this for now and start fresh.
      // In a future enhancement, we can load the data from memory graph.
    } catch (error) {
      console.warn("Could not load self-improvement data from memory graph:", error);
    }
  }

  /**
   * Save data to memory graph for persistence.
   * We'll store a summary node periodically.
   */
  async saveDataToMemoryGraph() {
    try {
      // We'll create a summary node with our key metrics.
      const summary = {
        timestamp: new Date().toISOString(),
        interactionCount: this.interactionHistory.length,
        correctionCount: this.corrections.length,
        acceptedResponseCount: this.acceptedResponses.length,
        rejectedResponseCount: this.rejectedResponses.length,
        averageConversationLength: this.average(this.conversationLengths),
        satisfactionRate: this.calculateSatisfactionRate(),
        preferredWorkflows: { ...this.preferredWorkflows },
        preferredResponseStructures: { ...this.preferredResponseStructures },
        learningWeights: { ...this.learningWeights }
      };

      // We'll store this as a node of type "self_improvement_summary"
      // We can update the same node by using a fixed ID, but for simplicity we'll add a new one.
      // The memory graph engine will prune old nodes if needed.
      this.memoryGraph.addNode(
        "self_improvement_summary",
        summary,
        0.7, // Medium-high importance
        this.identity.getUniqueId() // Link to the user
      );
    } catch (error) {
      console.warn("Could not save self-improvement data to memory graph:", error);
    }
  }

  /**
   * Record an interaction (a single turn in a conversation).
   * @param {Object} interaction - Object containing details of the interaction.
   *   Expected properties: userMessage, aiResponse, context, timestamp, etc.
   */
  recordInteraction(interaction) {
    try {
      const normalizedInteraction = {
        ...interaction,
        timestamp: interaction.timestamp || new Date().toISOString()
      };

      this.interactionHistory.push(normalizedInteraction);
      // Keep only the most recent interactions
      if (this.interactionHistory.length > this.config.maxHistory) {
        this.interactionHistory.shift(); // Remove the oldest
      }

      // Update derived metrics
      this.updatePreferredWorkflows(normalizedInteraction.context);
      this.updatePreferredResponseStructures(normalizedInteraction.aiResponse);

      // Optionally, we can calculate a response score for this interaction and update weights
      const score = this.calculateResponseScore(normalizedInteraction);
      this.responseScoreHistory.push({ score, timestamp: normalizedInteraction.timestamp });

      // Apply decay to response scores periodically (we also do it in the interval)
    } catch (error) {
      console.error("Error recording interaction:", error);
    }
  }

  /**
   * Record a user correction to an AI response.
   * @param {Object} correction - Object containing the original response, corrected response, and context.
   */
  recordCorrection(correction) {
    try {
      const normalizedCorrection = {
        ...correction,
        timestamp: correction.timestamp || new Date().toISOString()
      };

      this.corrections.push(normalizedCorrection);
      // Keep only the most recent corrections
      if (this.corrections.length > this.config.maxHistory) {
        this.corrections.shift();
      }

      // We can use corrections to adjust our learning weights immediately
      // For example, if the user corrected the tone to be more formal, we can increase weight on formality.
      // This is a simplified example; a real implementation would be more sophisticated.
      this.applyCorrectionToLearningWeights(normalizedCorrection);
    } catch (error) {
      console.error("Error recording correction:", error);
    }
  }

  /**
   * Record a rejected response (user indicated the response was not helpful or wrong).
   * @param {Object} rejectedResponse - Object containing the rejected response and context.
   */
  recordRejectedResponse(rejectedResponse) {
    try {
      const normalized = {
        ...rejectedResponse,
        timestamp: rejectedResponse.timestamp || new Date().toISOString()
      };

      this.rejectedResponses.push(normalized);
      if (this.rejectedResponses.length > this.config.maxHistory) {
        this.rejectedResponses.shift();
      }

      // We can adjust learning weights based on rejection (e.g., if the response was too humorous, decrease humor weight)
      this.applyRejectionToLearningWeights(normalized);
    } catch (error) {
      console.error("Error recording rejected response:", error);
    }
  }

  /**
   * Record an accepted response (user indicated the response was helpful or correct).
   * @param {Object} acceptedResponse - Object containing the accepted response and context.
   */
  recordAcceptedResponse(acceptedResponse) {
    try {
      const normalized = {
        ...acceptedResponse,
        timestamp: acceptedResponse.timestamp || new Date().toISOString()
      };

      this.acceptedResponses.push(normalized);
      if (this.acceptedResponses.length > this.config.maxHistory) {
        this.acceptedResponses.shift();
      }

      // We can adjust learning weights based on acceptance (e.g., if the response was accepted, reinforce the traits that led to it)
      this.applyAcceptanceToLearningWeights(normalized);
    } catch (error) {
      console.error("Error recording accepted response:", error);
    }
  }

  /**
   * Record the length of a conversation (in messages or time).
   * @param {number} length - The length of the conversation (e.g., number of messages).
   */
  recordConversationLength(length) {
    if (typeof length === "number" && !isNaN(length)) {
      this.conversationLengths.push(length);
      if (this.conversationLengths.length > this.config.maxHistory) {
        this.conversationLengths.shift();
      }
    }
  }

  /**
   * Record that the user has returned (for return frequency calculation).
   */
  recordReturn() {
    const timestamp = new Date().toISOString();
    const date = new Date(timestamp).toDateString(); // Just the date part for simplicity
    this.returnFrequency[date] = (this.returnFrequency[date] || 0) + 1;
  }

  /**
   * Record an explicit satisfaction signal (e.g., thumbs up, positive feedback).
   * @param {Object} signal - Object containing the satisfaction signal and context.
   */
  recordSatisfactionSignal(signal) {
    try {
      const normalized = {
        ...signal,
        timestamp: signal.timestamp || new Date().toISOString()
      };

      this.satisfactionSignals.push(normalized);
      if (this.satisfactionSignals.length > this.config.maxHistory) {
        this.satisfactionSignals.shift();
      }
    } catch (error) {
      console.error("Error recording satisfaction signal:", error);
    }
  }

  /**
   * Record a failed action (e.g., task execution failed).
   * @param {Object} failedAction - Object containing details of the failed action.
   */
  recordFailedAction(failedAction) {
    try {
      const normalized = {
        ...failedAction,
        timestamp: failedAction.timestamp || new Date().toISOString()
      };

      this.failedActions.push(normalized);
      if (this.failedActions.length > this.config.maxHistory) {
        this.failedActions.shift();
      }
    } catch (error) {
      console.error("Error recording failed action:", error);
    }
  }

  /**
   * Record a successful action (e.g., task execution succeeded).
   * @param {Object} successfulAction - Object containing details of the successful action.
   */
  recordSuccessfulAction(successfulAction) {
    try {
      const normalized = {
        ...successfulAction,
        timestamp: successfulAction.timestamp || new Date().toISOString()
      };

      this.successfulActions.push(normalized);
      if (this.successfulActions.length > this.config.maxHistory) {
        this.successfulActions.shift();
      }
    } catch (error) {
      console.error("Error recording successful action:", error);
    }
  }

  /**
   * Update preferred workflows based on context from an interaction.
   * @param {Object} context - The context object from an interaction.
   */
  updatePreferredWorkflows(context) {
    if (!context || !context.currentWorkflow) return;
    const workflow = context.currentWorkflow;
    this.preferredWorkflows[workflow] = (this.preferredWorkflows[workflow] || 0) + 1;
  }

  /**
   * Update preferred response structures based on an AI response.
   * @param {string} response - The AI response text.
   */
  updatePreferredResponseStructures(response) {
    if (typeof response !== "string") return;

    // Simple heuristic to determine response structure
    const structure = this.detectResponseStructure(response);
    this.preferredResponseStructures[structure] = (this.preferredResponseStructures[structure] || 0) + 1;
  }

  /**
   * Detect the structure of a response (e.g., bullet points, paragraphs, etc.).
   * @param {string} response - The response text.
   * @returns {string} A label for the structure (e.g., "bullet_points", "paragraphs", "single_sentence").
   */
  detectResponseStructure(response) {
    if (!response || typeof response !== "string") return "unknown";

    // Trim and split by lines
    const lines = response.trim().split(/\r?\n/);
    const nonEmptyLines = lines.filter(line => line.trim() !== "");

    if (nonEmptyLines.length === 0) return "empty";

    // Check for bullet points (lines starting with -, *, or numbers followed by .)
    const bulletPointRegex = /^[\s]*([-*]|\d+\.)/;
    const bulletPointLines = nonEmptyLines.filter(line => bulletPointRegex.test(line));
    if (bulletPointLines.length >= nonEmptyLines.length * 0.5) {
      return "bullet_points";
    }

    // Check for numbered list (more specific)
    const numberedListRegex = /^[\s]*\d+\./;
    const numberedListLines = nonEmptyLines.filter(line => numberedListRegex.test(line));
    if (numberedListLines.length >= nonEmptyLines.length * 0.5) {
      return "numbered_list";
    }

    // Check for single sentence (approximately)
    if (nonEmptyLines.length === 1 && response.split(/[.!?]+/).length <= 2) {
      return "single_sentence";
    }

    // Default to paragraphs (multiple lines or multiple sentences)
    return "paragraphs";
  }

  /**
   * Calculate a response score for an interaction (0.0 to 1.0).
   * This score can be used to reinforce or discourage certain behaviors.
   * @param {Object} interaction - The interaction object (userMessage, aiResponse, context, etc.).
   * @returns {number} A score between 0.0 and 1.0.
   */
  calculateResponseScore(interaction) {
    let score = 0.5; // Start with neutral

    const { userMessage, aiResponse, context } = interaction;

    // Factor 1: Length appropriateness (not too short, not too long)
    const responseLength = aiResponse ? aiResponse.length : 0;
    const idealLength = 200; // Arbitrary ideal length in characters
    const lengthScore = 1 - Math.abs(responseLength - idealLength) / (idealLength * 2);
    score += (lengthScore - 0.5) * 0.2; // Weight: 0.2, centered around 0.5

    // Factor 2: Relevance to user message (simple keyword overlap)
    if (userMessage && aiResponse) {
      const userWords = new Set(userMessage.toLowerCase().match(/\b\w+\b/g) || []);
      const responseWords = new Set(aiResponse.toLowerCase().match(/\b\w+\b/g) || []);
      const intersection = new Set([...userWords].filter(w => responseWords.has(w)));
      const relevance = userWords.size > 0 ? intersection.size / userWords.size : 0;
      score += (relevance - 0.5) * 0.3; // Weight: 0.3
    }

    // Factor 3: Context appropriateness (e.g., during study, we want more explanatory)
    if (context && context.currentWorkflow) {
      const workflow = context.currentWorkflow;
      // We can define ideal traits for each workflow and see if the response matches.
      // For simplicity, we'll just give a small boost for known workflows.
      if (workflow === "study" || workflow === "research" || workflow === "problem_solving") {
        score += 0.1;
      }
    }

    // Factor 4: Based on explicit satisfaction signals (if we have any for this interaction)
    // We would need to link signals to interactions, which we don't do in this simple version.
    // We'll skip for now.

    // Constrain score to [0, 1]
    score = Math.max(0, Math.min(1, score));

    return score;
  }

  /**
   * Apply a correction to the learning weights.
   * This is a simplified example; a real implementation would be more sophisticated.
   * @param {Object} correction - The correction object.
   */
  applyCorrectionToLearningWeights(correction) {
    // Example: if the correction is about tone being too humorous, we decrease humor weight.
    // We don't have a structured way to parse corrections, so we'll skip for now.
    // In a real implementation, we would use NLP to understand the correction.
  }

  /**
   * Apply a rejection to the learning weights.
   * @param {Object} rejectedResponse - The rejected response object.
   */
  applyRejectionToLearningWeights(rejectedResponse) {
    // Example: if the rejected response was too long, we decrease verbosity weight.
    // We don't have a structured way to analyze why it was rejected, so we'll skip.
  }

  /**
   * Apply an acceptance to the learning weights.
   * @param {Object} acceptedResponse - The accepted response object.
   */
  applyAcceptanceToLearningWeights(acceptedResponse) {
    // Example: if the accepted response had a certain structure, we increase weight on that structure.
    // We don't have a structured way to analyze the response, so we'll skip.
  }

  /**
   * Update learning weights based on recent interactions and response scores.
   * This method should be called periodically to adjust the weights used in adaptive routing and prompt optimization.
   */
  updateLearningWeights() {
    // We'll adjust weights based on the correlation between traits and response scores.
    // For simplicity, we'll skip the complex implementation and just apply a small decay and random walk.
    // In a real implementation, we would use regression or machine learning to find the optimal weights.

    // Apply decay to all weights
    const decayFactor = 0.99;
    for (const key in this.learningWeights) {
      this.learningWeights[key] *= decayFactor;
    }

    // Ensure weights are within reasonable bounds (e.g., 0 to 2)
    for (const key in this.learningWeights) {
      this.learningWeights[key] = Math.max(0, Math.min(2, this.learningWeights[key]));
    }

    // We can also add a small amount of random noise to encourage exploration.
    for (const key in this.learningWeights) {
      this.learningWeights[key] += (Math.random() - 0.5) * 0.02;
    }
  }

  /**
   * Apply decay to response scores over time.
   * This ensures that recent interactions have more weight than old ones.
   */
  applyResponseScoreDecay() {
    const now = Date.now();
    this.responseScoreHistory = this.responseScoreHistory
      .filter(entry => {
        const age = now - new Date(entry.timestamp).getTime();
        // Keep entries from the last 30 days (adjust as needed)
        return age < 30 * 24 * 60 * 60 * 1000;
      })
      .map(entry => ({
        score: entry.score * Math.pow(this.config.responseScoreDecay, (now - new Date(entry.timestamp).getTime()) / (60 * 60 * 1000)), // Decay per hour
        timestamp: entry.timestamp
      }));
  }

  /**
   * Adaptive routing: Suggest which AI models or workflows to prefer based on learned preferences.
   * @returns {Object} Suggestions for routing (e.g., preferred models, preferred workflows).
   */
  adaptiveRouting() {
    // We'll return the preferred workflows and response structures we've learned.
    // In a real implementation, we would also suggest preferred models based on success rates.
    return {
      preferredWorkflows: { ...this.preferredWorkflows },
      preferredResponseStructures: { ...this.preferredResponseStructures },
      // We can also include suggested traits based on learning weights (if we had a mapping from weights to traits)
      suggestedTraits: {} // Placeholder
    };
  }

  /**
   * Auto prompt optimizer: Suggest adjustments to the system prompt based on learned preferences.
   * @returns {Object} Suggestions for prompt adjustments (e.g., adjust humor, verbosity, etc.).
   */
  autoPromptOptimizer() {
    // We'll use the learning weights to suggest adjustments to the prompt.
    // For now, we'll return a placeholder.
    // In a real implementation, we would map learning weights to specific prompt adjustments.
    return {
      adjustments: {
        // Example: if we learned that users prefer more humorous responses, we suggest increasing humor in the prompt.
        // We don't have a direct mapping, so we'll leave it empty.
      },
      rationale: "Based on learned preferences from interaction history."
    };
  }

  /**
   * Get execution statistics (for monitoring and debugging).
   * @returns {Object} Statistics about the self-improvement engine's data.
   */
  getExecutionStats() {
    return {
      interactionCount: this.interactionHistory.length,
      correctionCount: this.corrections.length,
      rejectedResponseCount: this.rejectedResponses.length,
      acceptedResponseCount: this.acceptedResponses.length,
      averageConversationLength: this.average(this.conversationLengths),
      returnFrequency: { ...this.returnFrequency },
      satisfactionRate: this.calculateSatisfactionRate(),
      failedActionCount: this.failedActions.length,
      successfulActionCount: this.successfulActions.length,
      preferredWorkflows: { ...this.preferredWorkflows },
      preferredResponseStructures: { ...this.preferredResponseStructures },
      learningWeights: { ...this.learningWeights },
      recentResponseScoreAverage: this.average(this.responseScoreHistory.map(entry => entry.score))
    };
  }

  /**
   * Calculate the satisfaction rate (percentage of accepted responses among accepted+rejected).
   * @returns {number} Satisfaction rate between 0 and 1.
   */
  calculateSatisfactionRate() {
    const total = this.acceptedResponses.length + this.rejectedResponses.length;
    if (total === 0) return 0.5; // Neutral if no data
    return this.acceptedResponses.length / total;
  }

  /**
   * Helper: Calculate the average of an array of numbers.
   * @param {number[]} arr - Array of numbers.
   * @returns {number} Average or 0 if empty.
   */
  average(arr) {
    if (!arr || arr.length === 0) return 0;
    const sum = arr.reduce((acc, val) => acc + val, 0);
    return sum / arr.length;
  }

  /**
   * Shutdown the self-improvement engine.
   * @returns {Promise<Object>} Result of shutdown.
   */
  async shutdown() {
    if (this.decayIntervalId) {
      clearInterval(this.decayIntervalId);
      this.decayIntervalId = null;
    }
    // Save data to memory graph before shutting down
    await this.saveDataToMemoryGraph();
    this.isInitialized = false;
    return { success: true };
  }
}

// Export for use in browser and Node.js
if (typeof module !== "undefined" && module.exports) {
  module.exports = SelfImprovementEngine;
} else {
  window.SelfImprovementEngine = SelfImprovementEngine;
}