// src/aura-live/vision/vision-engine.js
"use strict";

/**
 * Vision Engine - Main coordinator for vision tasks (object detection, OCR, scene analysis).
 */
class VisionEngine {
  /**
   * @param {Object} options - Configuration options.
   * @param {Object} options.objectDetectorOptions - Options for ObjectDetector.
   * @param {Object} options.ocrEngineOptions - Options for OCREngine.
   * @param {Object} options.sceneAnalyzerOptions - Options for SceneAnalyzer.
   */
  constructor(options = {}) {
    this.objectDetector = new ObjectDetector(options.objectDetectorOptions);
    this.ocrEngine = new OCREngine(options.ocrEngineOptions);
    this.sceneAnalyzer = new SceneAnalyzer(options.sceneAnalyzerOptions);

    this.state = {
      initialized: false,
      objects: [],
      text: "",
      scene: "",
      width: 640,
      height: 480
    };

    // Bind methods
    this.initialize = this.initialize.bind(this);
    this.processFrame = this.processFrame.bind(this);
    this.getState = this.getState.bind(this);
    this.shutdown = this.shutdown.bind(this);
  }

  /**
   * Initialize the vision engine and its components.
   * @returns {Promise<Object>} Result of initialization.
   */
  async initialize() {
    try {
      // Initialize all components
      const [objResult, ocrResult, sceneResult] = await Promise.all([
        this.objectDetector.initialize(),
        this.ocrEngine.initialize(),
        this.sceneAnalyzer.initialize()
      ]);

      if (!objResult.success || !ocrResult.success || !sceneResult.success) {
        throw new Error(`Failed to initialize vision components: 
          ObjectDetector: ${objResult.error || 'unknown'}, 
          OCREngine: ${ocrResult.error || 'unknown'}, 
          SceneAnalyzer: ${sceneResult.error || 'unknown'}`);
      }

      this.state.initialized = true;
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Process a single frame (image data) through all vision components.
   * @param {ImageData|HTMLImageElement|HTMLVideoElement|HTMLCanvasElement} frame - The frame to process.
   * @returns {Promise<Object>} Vision state after processing.
   */
  async processFrame(frame) {
    if (!this.state.initialized) {
      await this.initialize();
    }

    try {
      // Run all analyses in parallel
      const [objectsResult, textResult, sceneResult] = await Promise.all([
        this.objectDetector.detect(frame),
        this.ocrEngine.recognize(frame),
        this.sceneAnalyzer.analyze(frame)
      ]);

      this.state = {
        ...this.state,
        objects: objectsResult,
        text: textResult,
        scene: sceneResult.label,
        // We can also store the full scene result if needed
        // sceneDetails: sceneResult
      };

      return { success: true, state: { ...this.state } };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get the current vision state.
   * @returns {Object} A copy of the current state.
   */
  getState() {
    return { ...this.state };
  }

  /**
   * Shutdown the vision engine and its components.
   * @returns {Promise<Object>} Result of shutdown.
   */
  async shutdown() {
    try {
      // Shutdown all components
      const [objResult, ocrResult, sceneResult] = await Promise.all([
        this.objectDetector.shutdown(),
        this.ocrEngine.shutdown(),
        this.sceneAnalyzer.shutdown()
      ]);

      this.state.initialized = false;
      this.state.objects = [];
      this.state.text = "";
      this.state.scene = "";

      // If any shutdown failed, we still want to return the overall result
      // but we can log the errors.
      if (!objResult.success) {
        console.warn("Error shutting down object detector:", objResult.error);
      }
      if (!ocrResult.success) {
        console.warn("Error shutting down OCR engine:", ocrResult.error);
      }
      if (!sceneResult.success) {
        console.warn("Error shutting down scene analyzer:", sceneResult.error);
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

// Export for use in browser and Node.js
if (typeof module !== "undefined" && module.exports) {
  module.exports = VisionEngine;
} else {
  window.VisionEngine = VisionEngine;
}