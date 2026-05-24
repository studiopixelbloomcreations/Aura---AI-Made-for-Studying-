// src/aura-live/identity/profile-loader.js
"use strict";

/**
 * Handles loading and saving of user profiles.
 * Profiles contain the AI configuration, personalization data, learning patterns, etc.
 * In a real implementation, this would use IndexedDB or a backend service.
 * For now, we use localStorage for simplicity.
 */
class ProfileLoader {
  static STORAGE_PREFIX = "aura_profile_";

  /**
   * Save profile to storage
   * @param {Object} profile - Profile object to save
   * @returns {Promise<Object>} Result of save operation
   */
  static async saveProfile(profile) {
    try {
      const key = this.getStorageKey(profile.unique_id);
      const value = JSON.stringify(profile);
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(key, value);
      }
      // In a real implementation, also save to Supabase or backend
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Load profile from storage by unique_id
   * @param {string} unique_id - The unique ID
   * @returns {Promise<Object|null>} Loaded profile or null if not found
   */
  static async loadProfile(unique_id) {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const key = this.getStorageKey(unique_id);
        const value = window.localStorage.getItem(key);
        if (value) {
          return JSON.parse(value);
        }
      }
      return null;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Update profile in storage (merge changes)
   * @param {string} unique_id - The unique ID
   * @param {Object} updates - Partial updates to apply to the profile
   * @returns {Promise<Object>} Result of update operation
   */
  static async updateProfile(unique_id, updates) {
    try {
      const existing = await this.loadProfile(unique_id);
      if (!existing) {
        return { success: false, error: "Profile not found" };
      }
      const updated = { ...existing, ...updates, updated_at: new Date().toISOString() };
      return await this.saveProfile(updated);
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete profile from storage (for logout or reset)
   * @param {string} unique_id - The unique ID
   * @returns {Promise<Object>} Result of delete operation
   */
  static async deleteProfile(unique_id) {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const key = this.getStorageKey(unique_id);
        window.localStorage.removeItem(key);
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get storage key for a unique_id
   * @param {string} unique_id - The unique ID
   * @returns {string} Storage key
   */
  static getStorageKey(unique_id) {
    return `${this.STORAGE_PREFIX}${unique_id}`;
  }
}

// Export for use in browser and Node.js
if (typeof module !== "undefined" && module.exports) {
  module.exports = ProfileLoader;
} else {
  window.ProfileLoader = ProfileLoader;
}