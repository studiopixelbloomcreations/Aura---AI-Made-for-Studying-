// src/aura-live/identity/identity-generator.js
"use strict";

/**
 * Generates a unique identifier in the format AURA-XXXXXXXXXX
 * where X is a hexadecimal character (0-9, a-f)
 * Uses cryptographically secure random number generation
 */
class IdentityGenerator {
  /**
   * Generate a unique ID
   * @returns {string} Unique ID in format AURA-XXXXXXXXXX
   */
  static generate() {
    // Generate 12 hexadecimal characters (6 bytes of random data)
    const randomBytes = crypto.getRandomValues(new Uint8Array(6));
    let hex = '';
    for (let i = 0; i < randomBytes.length; i++) {
      hex += randomBytes[i].toString(16).padStart(2, '0');
    }
    return `AURA-${hex}`;
  }
}

// Export for use in browser and Node.js
if (typeof module !== "undefined" && module.exports) {
  module.exports = IdentityGenerator;
} else {
  window.IdentityGenerator = IdentityGenerator;
}