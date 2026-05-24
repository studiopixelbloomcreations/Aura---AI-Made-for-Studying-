// src/aura-live/vision/ocr-engine.js
"use strict";

/**
 * OCR Engine using Tesseract.js for optical character recognition.
 * Extracts text from images.
 */
class OCREngine {
  /**
   * @param {Object} options - Configuration options.
   * @param {number} options.confidenceThreshold - Minimum confidence to consider a word (default: 0.6).
   * @param {string} options.lang - Language for OCR (default: 'eng').
   * @param {Object} options.logger - Logger object (optional).
   */
  constructor(options = {}) {
    this.confidenceThreshold = options.confidenceThreshold || 0.6;
    this.lang = options.lang || 'eng';
    this.logger = options.logger || { log: () => {}, warn: () => {}, error: () => {} };
    this.worker = null;
    this.isLoading = false;
    this.isInitialized = false;
  }

  /**
   * Initialize the OCR engine by loading Tesseract.js and creating a worker.
   * @returns {Promise<Object>} Result of initialization.
   */
  async initialize() {
    if (this.isInitialized) return { success: true };
    if (this.isLoading) {
      // Wait for the ongoing initialization to complete
      return new Promise(resolve => {
        const checkInterval = setInterval(() => {
          if (!this.isLoading) {
            clearInterval(checkInterval);
            resolve(this.isInitialized ? { success: true } : { success: false, error: 'OCR worker failed to load' });
          }
        }, 100);
      });
    }

    this.isLoading = true;
    try {
      // Check if Tesseract.js is available
      if (typeof Tesseract === 'undefined') {
        throw new Error('Tesseract.js is not loaded. Please include the Tesseract.js script before using the OCR engine.');
      }

      // Create a worker
      this.worker = Tesseract.createWorker({
        logger: this.logger
      });

      // Load the language data
      await this.worker.load();
      await this.worker.loadLanguage(this.lang);
      await this.worker.initialize(this.lang);

      this.isInitialized = true;
      this.isLoading = false;
      return { success: true };
    } catch (error) {
      this.isLoading = false;
      this.isInitialized = false;
      this.logger.error(`OCR engine initialization failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Recognize text in the given image data.
   * @param {ImageData|HTMLImageElement|HTMLVideoElement|HTMLCanvasElement} imageData - The image to analyze.
   * @returns {Promise<string>} Recognized text.
   */
  async recognize(imageData) {
    if (!this.isInitialized) {
      await this.initialize();
    }
    if (!this.worker) {
      throw new Error('OCR worker is not initialized.');
    }

    try {
      // Convert imageData to a format that Tesseract can accept (e.g., HTMLImageElement, HTMLCanvasElement, etc.)
      // We'll assume imageData is one of the types that Tesseract.accepts.
      // If it's ImageData, we can convert to a canvas or use createImageBitmap.
      let img;
      if (imageData instanceof ImageData) {
        // Create a temporary canvas to hold the image data
        const canvas = document.createElement('canvas');
        canvas.width = imageData.width;
        canvas.height = imageData.height;
        const ctx = canvas.getContext('2d');
        ctx.putImageData(imageData, 0, 0);
        img = canvas;
      } else if (imageData instanceof HTMLImageElement ||
                 imageData instanceof HTMLVideoElement ||
                 imageData instanceof HTMLCanvasElement) {
        img = imageData;
      } else {
        throw new Error('Unsupported image data type for OCR. Please provide ImageData, HTMLImageElement, HTMLVideoElement, or HTMLCanvasElement.');
      }

      // Recognize text
      const result = await this.worker.recognize(img);
      const text = result.data.text.trim();

      // Optionally, we can filter by confidence, but Tesseract.js returns words with confidence.
      // We'll return the full text for now, but we can adjust to return only high confidence words if needed.
      return text;
    } catch (error) {
      throw new Error(`Error during OCR recognition: ${error.message}`);
    }
  }

  /**
   * Shutdown the OCR engine and terminate the worker.
   * @returns {Promise<Object>} Result of shutdown.
   */
  async shutdown() {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
    this.isInitialized = false;
    this.isLoading = false;
    return { success: true };
  }
}

// Export for use in browser and Node.js (if applicable)
if (typeof module !== "undefined" && module.exports) {
  module.exports = OCREngine;
} else {
  window.OCREngine = OCREngine;
}