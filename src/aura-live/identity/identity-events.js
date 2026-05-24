// src/aura-live/identity/identity-events.js
"use strict";

/**
 * Manages identity-related events for the Aura Live system.
 * This allows different parts of the application to subscribe to identity changes.
 */
class IdentityEvents {
  constructor() {
    this.listeners = new Map();
    this.listenerIdCounter = 0;
  }

  /**
   * Subscribe to identity events.
   * @param {string} eventType - The type of event to listen for (e.g., 'identity_created', 'identity_loaded', 'profile_updated')
   * @param {Function} callback - The function to call when the event occurs
   * @returns {string} A listener ID that can be used to unsubscribe
   */
  subscribe(eventType, callback) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Map());
    }
    const id = `listener_${this.listenerIdCounter++}`;
    this.listeners.get(eventType).set(id, callback);
    return id;
  }

  /**
   * Unsubscribe from an identity event.
   * @param {string} eventType - The type of event
   * @param {string} listenerId - The ID returned by subscribe
   * @returns {boolean} True if unsubscribed, false if not found
   */
  unsubscribe(eventType, listenerId) {
    if (!this.listeners.has(eventType)) return false;
    const listeners = this.listeners.get(eventType);
    if (!listeners.has(listenerId)) return false;
    listeners.delete(listenerId);
    // Clean up if no more listeners for this event type
    if (listeners.size === 0) {
      this.listeners.delete(eventType);
    }
    return true;
  }

  /**
   * Emit an event to all subscribed listeners.
   * @param {string} eventType - The type of event to emit
   * @param {*} data - The data to pass to the listeners
   */
  emit(eventType, data) {
    if (!this.listeners.has(eventType)) return;
    const listeners = this.listeners.get(eventType);
    listeners.forEach((callback) => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in identity event listener for ${eventType}:`, error);
      }
    });
  }

  /**
   * Clear all listeners for a specific event type or all event types.
   * @param {string} [eventType] - The event type to clear, or undefined to clear all
   */
  clear(eventType) {
    if (eventType) {
      this.listeners.delete(eventType);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Get the number of listeners for a specific event type.
   * @param {string} eventType - The event type to check
   * @returns {number} Number of listeners
   */
  listenerCount(eventType) {
    if (!this.listeners.has(eventType)) return 0;
    return this.listeners.get(eventType).size;
  }
}

// Export for use in browser and Node.js
if (typeof module !== "undefined" && module.exports) {
  module.exports = IdentityEvents;
} else {
  window.IdentityEvents = IdentityEvents;
}