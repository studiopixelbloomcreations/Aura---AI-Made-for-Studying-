// src/aura-live/identity/identity-storage.js
"use strict";

/**
 * Handles storage and retrieval of identity data.
 * In a real implementation, this would use IndexedDB or a backend service.
 * For now, we use localStorage for simplicity.
 */
class IdentityStorage {
  static STORAGE_PREFIX = "aura_identity_";

  /**
   * Save identity to storage
   * @param {Object} identity - Identity object to save
   * @returns {Promise<Object>} Result of save operation
   */
  static async saveIdentity(identity) {
    try {
      const key = this.getStorageKey(identity.user_id);
      const value = JSON.stringify(identity);
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
   * Load identity from storage by user_id
   * @param {string} user_id - The user's ID
   * @returns {Promise<Object|null>} Loaded identity or null if not found
   */
  static async loadIdentity(user_id) {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const key = this.getStorageKey(user_id);
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
   * Delete identity from storage (for logout or reset)
   * @param {string} user_id - The user's ID
   * @returns {Promise<Object>} Result of delete operation
   */
  static async deleteIdentity(user_id) {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const key = this.getStorageKey(user_id);
        window.localStorage.removeItem(key);
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get storage key for a user_id
   * @param {string} user_id - The user's ID
   * @returns {string} Storage key
   */
  static getStorageKey(user_id) {
    return `${this.STORAGE_PREFIX}${user_id}`;
  }
}

// Export for use in browser and Node.js
if (typeof module !== "undefined" && module.exports) {
  module.exports = IdentityStorage;
} else {
  window.IdentityStorage = IdentityStorage;
}