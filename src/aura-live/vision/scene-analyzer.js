// src/aura-live/vision/scene-analyzer.js
"use strict";

/**
 * Scene Analyzer using TensorFlow.js and a pre-trained model (e.g., MobileNet) for scene classification.
 * Classifies the scene in an image (e.g., "indoor", "outdoor", "city street", "forest", etc.).
 */
class SceneAnalyzer {
  /**
   * @param {Object} options - Configuration options.
   * @param {number} options.confidenceThreshold - Minimum confidence to consider a prediction (default: 0.5).
   * @param {string} options.modelUrl - URL to the model JSON file (if not using default).
   * @param {Array<string>} options.labels - Array of class labels (if not using default).
   */
  constructor(options = {}) {
    this.confidenceThreshold = options.confidenceThreshold || 0.5;
    this.modelUrl = options.modelUrl || 'https://tfhub.dev/google/tfjs-model/imagenet/mobilenet_v2_100_224/classification/5/default/1'; // MobileNetV2 from TF Hub
    this.labels = options.labels || null; // We'll load labels from a URL if not provided, or use ImageNet labels by default.
    this.model = null;
    this.isLoading = false;
    this.isInitialized = false;
    this.labelProxy = null; // We'll fetch labels if needed.
  }

  /**
   * Initialize the scene analyzer by loading the model and labels.
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
            resolve(this.isInitialized ? { success: true } : { success: false, error: 'Model failed to load' });
          }
        }, 100);
      });
    }

    this.isLoading = true;
    try {
      // Check if TensorFlow.js is available
      if (typeof tf === 'undefined') {
        throw new Error('TensorFlow.js is not loaded. Please include the TensorFlow.js script before using the scene analyzer.');
      }

      // Load the model
      this.model = await tf.loadLayersModel(this.modelUrl);

      // Load labels if not provided
      if (!this.labels) {
        // We'll try to fetch labels from a URL (for ImageNet, we can use a known URL)
        // For MobileNetV2, the labels are the same as ImageNet.
        const labelsUrl = 'https://storage.googleapis.com/download.tensorflow.org/data/imagenet_class_index.json';
        const response = await fetch(labelsUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch labels: ${response.status}`);
        }
        const json = await response.json();
        // The json is an object where keys are class indices and values are [className, description]
        // We want an array of class names in order of index.
        this.labels = Object.keys(json)
          .sort((a, b) => parseInt(a) - parseInt(b))
          .map(key => json[key][0]); // className
      }

      this.isInitialized = true;
      this.isLoading = false;
      return { success: true };
    } catch (error) {
      this.isLoading = false;
      this.isInitialized = false;
      return { success: false, error: error.message };
    }
  }

  /**
   * Analyze the scene in the given image data.
   * @param {ImageData|HTMLImageElement|HTMLVideoElement|HTMLCanvasElement} imageData - The image to analyze.
   * @returns {Promise<Object>} Scene analysis result with { label, confidence, allPredictions: Array<{label, confidence}> }.
   */
  async analyze(imageData) {
    if (!this.isInitialized) {
      await this.initialize();
    }
    if (!this.model) {
      throw new Error('Scene analysis model is not initialized.');
    }

    try {
      // Preprocess the image for the model (assuming MobileNetV2: 224x224, RGB, normalized to [0,1])
      // We'll convert the imageData to a tensor, resize, normalize, and expand dimensions.
      let tensor;
      if (imageData instanceof HTMLVideoElement ||
          imageData instanceof HTMLImageElement ||
          imageData instanceof HTMLCanvasElement) {
        tensor = tf.browser.fromPixels(imageData)
          .resize([224, 224])
          .toFloat()
          .div(tf.scalar(255.0))
          .expandDims(0);
      } else if (imageData instanceof ImageData) {
        // Create a temporary canvas to hold the image data
        const canvas = document.createElement('canvas');
        canvas.width = imageData.width;
        canvas.height = imageData.height;
        const ctx = canvas.getContext('2d');
        ctx.putImageData(imageData, 0, 0);
        tensor = tf.browser.fromPixels(canvas)
          .resize([224, 224])
          .toFloat()
          .div(tf.scalar(255.0))
          .expandDims(0);
      } else {
        throw new Error('Unsupported image data type for scene analysis. Please provide ImageData, HTMLImageElement, HTMLVideoElement, or HTMLCanvasElement.');
      }

      // Run the model prediction
      const predictions = await model.predict(tensor).data();

      // Get the top predictions (we'll get the top 5 for now)
      const top5 = Array.from(predictions)
        .map((prob, index) => ({ index, prob }))
        .sort((a, b) => b.prob - a.prob)
        .slice(0, 5)
        .map(({ index, prob }) => ({
          label: this.labels[index] || `unknown_${index}`,
          confidence: parseFloat(prob.toFixed(4))
        }));

      // The top prediction is the first one
      const topPrediction = top5[0];

      // Filter by confidence threshold (if needed, we can still return the top even if below threshold, but we can note it)
      // We'll return the top prediction and the top 5 for context.

      return {
        label: topPrediction.label,
        confidence: topPrediction.confidence,
        allPredictions: top5
      };
    } catch (error) {
      throw new Error(`Error during scene analysis: ${error.message}`);
    }
  }

  /**
   * Shutdown the scene analyzer and release resources.
   * @returns {Promise<Object>} Result of shutdown.
   */
  async shutdown() {
    if (this.model) {
      // Dispose of the model's resources if possible
      if (this.model.dispose) {
        this.model.dispose();
      }
      this.model = null;
    }
    this.labels = null;
    this.isInitialized = false;
    this.isLoading = false;
    return { success: true };
  }
}

// Export for use in browser and Node.js (if applicable)
if (typeof module !== "undefined" && module.exports) {
  module.exports = SceneAnalyzer;
} else {
  window.SceneAnalyzer = SceneAnalyzer;
}