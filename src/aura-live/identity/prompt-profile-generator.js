// src/aura-live/identity/prompt-profile-generator.js
"use strict";

/**
 * Generates a detailed system profile for the Harmony engine based on the user's profile.
 * This profile is used to permanently adapt the AI's behavior to the user.
 */
class PromptProfileGenerator {
  /**
   * Generate a prompt for the Harmony engine based on the user's profile.
   * @param {Object} profile - The user's profile object
   * @returns {string} A detailed prompt for the Harmony engine
   */
  static generate(profile) {
    if (!profile) {
      return "No profile available. Using default behavior.";
    }

    const { personalization_data, ai_config, learning_patterns, goals, interests, behavior_evolution } = profile;

    // Build structured profile from personalization data (reuse existing logic)
    const { buildStructuredProfile, generateAIConfig, buildPersonalizationPrompt } = require("../../../core/personalization_engine");
    const structuredProfile = buildStructuredProfile({ answers: personalization_data });
    const aiConfigFromProfile = generateAIConfig(structuredProfile);
    const personalizationPrompt = buildPersonalizationPrompt({ personalization_data: structuredProfile, ai_config: aiConfigFromProfile });

    // Build the comprehensive prompt
    const sections = [
      "=== AURA AI PERSONALIZED PROFILE ===",
      "",
      "User Identity:",
      `  Name: ${structuredProfile.identity_snapshot.name || "Unknown"}`,
      `  Email: ${structuredProfile.identity_snapshot.email || "Not provided"}`,
      "",
      "Personalization Answers:",
      `  Interests: ${Array.isArray(structuredProfile.interests) && structuredProfile.interests.length > 0 ? structuredProfile.interests.join(", ") : "None specified"}`,
      `  Goals: ${Array.isArray(structuredProfile.goals) && structuredProfile.goals.length > 0 ? structuredProfile.goals.join(", ") : "None specified"}`,
      `  Communication Style: ${structuredProfile.communication_style || "adaptive"}`,
      `  Tone: ${structuredProfile.tone || "adaptive"}`,
      `  Learning Style: ${(structuredProfile.behavior_preferences && structuredProfile.behavior_preferences.learning_style) || "adaptive"}`,
      `  Response Length Preference: ${(structuredProfile.behavior_preferences && structuredProfile.behavior_preferences.response_length) || "balanced"}`,
      `  Preferred Language: ${(structuredProfile.behavior_preferences && structuredProfile.behavior_preferences.language) || "English"}`,
      "",
      "AI Configuration:",
      `  Tone: ${aiConfigFromProfile.tone || "adaptive"}`,
      `  Communication Style: ${aiConfigFromProfile.communication_style || "adaptive"}`,
      `  Response Preferences:`,
      `    Length: ${aiConfigFromProfile.response_preferences.length || "balanced"}`,
      `    Depth: ${aiConfigFromProfile.response_preferences.depth || "adaptive"}`,
      `    Format: ${aiConfigFromProfile.response_preferences.format || "adaptive"}`,
      `  Memory Policy:`,
      `    Save User Preferences: ${aiConfigFromProfile.memory_policy.save_user_preferences !== false}`,
      `    Save Conversation Facts: ${aiConfigFromProfile.memory_policy.save_conversation_facts !== false}`,
      `    Instant Reload: ${aiConfigFromProfile.memory_policy.instant_reload !== false}`,
      `  Routing Hints:`,
      `    Preferred Models: ${Array.isArray(aiConfigFromProfile.routing_hints.preferred_models) && aiConfigFromProfile.routing_hints.preferred_models.length > 0 ? aiConfigFromProfile.routing_hints.preferred_models.join(", ") : "None"}`,
      `    Strong Topics: ${Array.isArray(aiConfigFromProfile.routing_hints.strong_topics) && aiConfigFromProfile.routing_hints.strong_topics.length > 0 ? aiConfigFromProfile.routing_hints.strong_topics.join(", ") : "None"}`,
      `    Active Goals: ${Array.isArray(aiConfigFromProfile.routing_hints.active_goals) && aiConfigFromProfile.routing_hints.active_goals.length > 0 ? aiConfigFromProfile.routing_hints.active_goals.join(", ") : "None"}`,
      "",
      "Learned Patterns:",
      learning_patterns && Object.keys(learning_patterns).length > 0
        ? Object.entries(learning_patterns).map(([key, value]) => `  ${key}: ${JSON.stringify(value)}`).join("\n")
        : "  No learned patterns yet",
      "",
      "Current Goals:",
      goals && goals.length > 0
        ? goals.map(goal => `  - ${goal}`).join("\n")
        : "  No goals set",
      "",
      "Current Interests:",
      interests && interests.length > 0
        ? interests.map(interest => `  - ${interest}`).join("\n")
        : "  No interests set",
      "",
      "Behavior Evolution:",
      behavior_evolution && behavior_evolution.length > 0
        ? behavior_evolution.map((entry, index) => `  [${index + 1}] ${new Date(entry.timestamp || Date.now()).toLocaleString()}: ${entry.description || "No description"}`).join("\n")
        : "  No behavior evolution recorded",
      "",
      "Instructions for Harmony Engine:",
      "1. Adapt tone, communication style, and response preferences according to the user's profile.",
      "2. Use the learning patterns to adjust explanations and examples.",
      "3. Prioritize the user's strong topics and active goals in responses.",
      "4. Consider the user's interests when generating examples or suggesting related topics.",
      "5. Update the behavior evolution with significant interactions.",
      "6. Always maintain accuracy and conciseness while being personalized.",
      "",
      "=== END PROFILE ==="
    ];

    return sections.filter(Boolean).join("\n");
  }
}

// Export for use in browser and Node.js
if (typeof module !== "undefined" && module.exports) {
  module.exports = PromptProfileGenerator;
} else {
  window.PromptProfileGenerator = PromptProfileGenerator;
}