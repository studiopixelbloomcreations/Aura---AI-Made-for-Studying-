// src/aura-live/identity/identity-manager.js
"use strict";

const { getCurrentUser, generateUniqueIdentifier } = require("../../../core/identity_system");
const { generateUniqueId } = require("../../../core/unique_id");
const IdentityGenerator = require("./identity-generator");
const IdentityStorage = require("./identity-storage");
const ProfileLoader = require("./profile-loader");
const PromptProfileGenerator = require("./prompt-profile-generator");

class IdentityManager {
  constructor() {
    this.currentUser = null;
    this.uniqueId = null;
    this.identity = null;
    this.profile = null;
    this.isInitialized = false;
    this.personalizationComplete = false;
  }

  /**
   * Initialize the identity manager
   * @returns {Promise<Object>} Result of initialization
   */
  async initialize() {
    try {
      // Get current user from auth system
      this.currentUser = getCurrentUser();
      if (!this.currentUser) {
        return { success: false, error: "No authenticated user found" };
      }

      // Check if we already have an identity for this user
      const existingIdentity = await IdentityStorage.loadIdentity(this.currentUser.user_id);
      if (existingIdentity) {
        // Load existing identity
        this.uniqueId = existingIdentity.unique_id;
        this.identity = existingIdentity;
        this.profile = await ProfileLoader.loadProfile(this.uniqueId);
        this.isInitialized = true;
        return { success: true, identity: this.identity, profile: this.profile, isNew: false };
      }

      // No existing identity, we need to create one (will be done after personalization)
      this.isInitialized = true;
      return { success: true, needsPersonalization: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Create a new identity after personalization
   * @param {Object} personalizationData - User's personalization answers
   * @returns {Promise<Object>} Result of identity creation
   */
  async createIdentity(personalizationData) {
    try {
      if (!this.currentUser) {
        return { success: false, error: "No user context" };
      }

      // Generate unique ID
      const uniqueId = IdentityGenerator.generate();
      this.uniqueId = uniqueId;

      // Create identity record
      this.identity = {
        user_id: this.currentUser.user_id,
        unique_id: uniqueId,
        email: this.currentUser.email,
        name: this.currentUser.name,
        avatar: this.currentUser.avatar,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        personalization_data: personalizationData,
        is_complete: true
      };

      // Save identity to storage
      await IdentityStorage.saveIdentity(this.identity);

      // Generate and save profile
      const aiConfig = await this.generateAIConfig(personalizationData);
      const personalizationPrompt = this.buildPersonalizationPrompt(personalizationData, aiConfig);
      this.profile = {
        unique_id: uniqueId,
        personalization_data: personalizationData,
        ai_config: aiConfig,
        personalization_prompt: personalizationPrompt,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        learning_patterns: {},
        goals: personalizationData.goals || [],
        interests: personalizationData.interests || [],
        behavior_evolution: [],
        projects: [],
        unfinished_work: [],
        ai_observations: []
      };

      await ProfileLoader.saveProfile(this.profile);

      // Generate prompt for Harmony engine
      const harmonyPrompt = PromptProfileGenerator.generate(this.profile);
      await this.updateHarmonyProfile(harmonyPrompt);

      this.personalizationComplete = true;
      return { success: true, identity: this.identity, profile: this.profile, harmonyPrompt };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Load existing identity for current user
   * @returns {Promise<Object>} Loaded identity and profile
   */
  async loadExistingIdentity() {
    try {
      if (!this.currentUser) {
        return { success: false, error: "No user context" };
      }

      this.identity = await IdentityStorage.loadIdentity(this.currentUser.user_id);
      if (!this.identity) {
        return { success: false, error: "No identity found for user" };
      }

      this.uniqueId = this.identity.unique_id;
      this.profile = await ProfileLoader.loadProfile(this.uniqueId);
      this.isInitialized = true;
      this.personalizationComplete = true;

      return { success: true, identity: this.identity, profile: this.profile };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if identity is complete (personalization done)
   * @returns {boolean} True if personalization is complete
   */
  isPersonalizationComplete() {
    return this.personalizationComplete && !!this.identity && !!this.profile;
  }

  /**
   * Get current identity
   * @returns {Object|null} Current identity or null
   */
  getIdentity() {
    return this.identity || null;
  }

  /**
   * Get current profile
   * @returns {Object|null} Current profile or null
   */
  getProfile() {
    return this.profile || null;
  }

  /**
   * Get unique ID
   * @returns {string|null} Unique ID or null
   */
  getUniqueId() {
    return this.uniqueId || null;
  }

  /**
   * Generate AI config from personalization data
   * @param {Object} personalizationData - User's personalization answers
   * @returns {Object} AI configuration
   */
  async generateAIConfig(personalizationData) {
    // Reuse existing personalization engine logic
    const { buildStructuredProfile, generateAIConfig: generateAIConfigFromProfile } = require("../../../core/personalization_engine");
    const profile = buildStructuredProfile({ answers: personalizationData });
    return generateAIConfigFromProfile(profile);
  }

  /**
   * Build personalization prompt from data and AI config
   * @param {Object} personalizationData - User's answers
   * @param {Object} aiConfig - Generated AI configuration
   * @returns {string} Personalization prompt
   */
  buildPersonalizationPrompt(personalizationData, aiConfig) {
    const { buildPersonalizationPrompt: buildPromptFromProfile } = require("../../../core/personalization_engine");
    const profile = buildStructuredProfile({ answers: personalizationData });
    return buildPromptFromProfile({ personalization_data: profile, ai_config: aiConfig });
  }

  /**
   * Update Harmony engine with the generated profile prompt
   * @param {string} harmonyPrompt - Prompt for Harmony engine
   * @returns {Promise<Object>} Result of update
   */
  async updateHarmonyProfile(harmonyPrompt) {
    // This would typically send a message to the Harmony engine via NCS or directly
    // For now, we'll store it in the profile and assume the system picks it up
    // In a real implementation, this might involve calling a Netlify function or updating Supabase
    try {
      // Example: Save to profile so other systems can access it
      await ProfileLoader.updateProfile(this.uniqueId, { harmony_prompt: harmonyPrompt });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Reset identity state (for testing or logout)
   */
  reset() {
    this.currentUser = null;
    this.uniqueId = null;
    this.identity = null;
    this.profile = null;
    this.isInitialized = false;
    this.personalizationComplete = false;
  }
}

// Export for use in browser and Node.js
if (typeof module !== "undefined" && module.exports) {
  module.exports = IdentityManager;
} else {
  window.IdentityManager = IdentityManager;
}