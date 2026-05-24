// Aura Live Preview Engine - Dynamic content previews
"use strict";

class AuraLivePreviewEngine {
  constructor() {
    this.state = {
      initialized: false,
      activePreview: null,
      previewQueue: [],
      cache: new Map(),
      lastUpdated: null
    };
    
    this.previewGenerators = {
      text: this.generateTextPreview.bind(this),
      code: this.generateCodePreview.bind(this),
      diagram: this.generateDiagramPreview.bind(this),
      math: this.generateMathPreview.bind(this),
      essay: this.generateEssayPreview.bind(this),
      plan: this.generatePlanPreview.bind(this),
      summary: this.generateSummaryPreview.bind(this)
    };
    
    // Configuration
    this.config = {
      maxCacheSize: 50,
      previewTimeout: 5000, // ms
      cacheTTL: 300000 // 5 minutes
    };
    
    // Bind methods
    this.cleanupCache = this.cleanupCache.bind(this);
  }
  
  // Initialize preview engine
  async initialize() {
    try {
      // Start cache cleanup interval
      this.cacheInterval = setInterval(this.cleanupCache, 60000); // Every minute
      
      this.state.initialized = true;
      this.state.lastUpdated = new Date().toISOString();
      
      return { success: true };
    } catch (error) {
      console.error("Failed to initialize preview engine:", error);
      return { success: false, error: error.message };
    }
  }
  
  // Generate a preview for content
  async generatePreview(type, content, options = {}) {
    if (!this.state.initialized) {
      await this.initialize();
    }
    
    try {
      // Check cache first
      const cacheKey = this.generateCacheKey(type, content, options);
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        return { success: true, preview: cached, fromCache: true };
      }
      
      // Check if we have a generator for this type
      const generator = this.previewGenerators[type];
      if (!generator) {
        return { 
          success: false, 
          error: `No preview generator available for type: ${type}` 
        };
      }
      
      // Generate preview with timeout
      const previewPromise = generator(content, options);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Preview generation timeout')), 
                  this.config.previewTimeout);
      });
      
      const preview = await Promise.race([previewPromise, timeoutPromise]);
      
      // Cache the preview
      this.addToCache(cacheKey, preview);
      
      this.state = {
        ...this.state,
        activePreview: { type, content, options, timestamp: new Date().toISOString() },
        lastUpdated: new Date().toISOString()
      };
      
      return { success: true, preview, fromCache: false };
    } catch (error) {
      console.error("Error generating preview:", error);
      return { success: false, error: error.message };
    }
  }
  
  // Generate cache key
  generateCacheKey(type, content, options) {
    return `${type}:${JSON.stringify(content)}:${JSON.stringify(options)}`;
  }
  
  // Add to cache
  addToCache(key, value) {
    // Implement LRU-like cache eviction
    if (this.state.cache.size >= this.config.maxCacheSize) {
      // Remove oldest entry (simple implementation)
      const keys = Array.from(this.state.cache.keys());
      this.state.cache.delete(keys[0]);
    }
    
    this.state.cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }
  
  // Get from cache
  getFromCache(key) {
    const entry = this.state.cache.get(key);
    if (!entry) return null;
    
    // Check if expired
    if (Date.now() - entry.timestamp > this.config.cacheTTL) {
      this.state.cache.delete(key);
      return null;
    }
    
    return entry.value;
  }
  
  // Cleanup expired cache entries
  cleanupCache() {
    const now = Date.now();
    for (const [key, entry] of this.state.cache.entries()) {
      if (now - entry.timestamp > this.config.cacheTTL) {
        this.state.cache.delete(key);
      }
    }
  }
  
  // Get active preview
  getActivePreview() {
    return this.state.activePreview;
  }
  
  // Clear cache
  clearCache() {
    this.state.cache.clear();
  }
  
  // Preview generators
  
  async generateTextPreview(content, options = {}) {
    // Simulate text preview generation
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const maxLength = options.maxLength || 100;
    const preview = content.length > maxLength 
      ? content.substring(0, maxLength) + '...' 
      : content;
    
    return {
      type: 'text',
      content: preview,
      format: options.format || 'plain',
      metadata: {
        length: content.length,
        previewLength: preview.length,
        truncated: content.length > maxLength
      }
    };
  }
  
  async generateCodePreview(content, options = {}) {
    // Simulate code preview generation
    await new Promise(resolve => setTimeout(resolve, 150));
    
    const language = options.language || 'javascript';
    const showLineNumbers = options.showLineNumbers !== false;
    
    // In a real implementation, this would use a syntax highlighting library
    const highlightedCode = `<pre class="code-preview language-${language}">${this.escapeHtml(
      content
    )}</pre>`;
    
    return {
      type: 'code',
      content: highlightedCode,
      language: language,
      lineCount: content.split('\n').length,
      metadata: {
        language,
        showLineNumbers,
        size: content.length
      }
    };
  }
  
  async generateDiagramPreview(content, options = {}) {
    // Simulate diagram preview generation
    await new Promise(resolve => setTimeout(resolve, 200));
    
    const diagramType = options.type || 'flowchart';
    
    // In a real implementation, this would use a diagram generation library
    const preview = {
      type: 'diagram',
      diagramType,
      content: `<!-- Diagram preview for: ${this.escapeHtml(content)} -->`,
      metadata: {
        sourceLength: content.length,
        diagramType,
        generatedAt: new Date().toISOString()
      }
    };
    
    return preview;
  }
  
  async generateMathPreview(content, options = {}) {
    // Simulate math preview generation
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const format = options.format || 'latex';
    
    // In a real implementation, this would use MathJax or KaTeX
    const preview = {
      type: 'math',
      format,
      content: `\\(${this.escapeHtml(content)}\\)`,
      metadata: {
        original: content,
        format,
        length: content.length
      }
    };
    
    return preview;
  }
  
  async generateEssayPreview(content, options = {}) {
    // Simulate essay preview generation
    await new Promise(resolve => setTimeout(resolve, 150));
    
    const maxLength = options.maxLength || 200;
    const preview = content.length > maxLength 
      ? content.substring(0, maxLength) + '...' 
      : content;
    
    // Basic word count and reading time estimation
    const wordCount = content.trim().split(/\s+/).filter(word => word.length > 0).length;
    const readingTime = Math.max(1, Math.round(wordCount / 200)); // Assuming 200 wpm
    
    return {
      type: 'essay',
      content: preview,
      metadata: {
        wordCount,
        readingTimeMinutes: readingTime,
        truncated: content.length > maxLength,
        fullLength: content.length
      }
    };
  }
  
  async generatePlanPreview(content, options = {}) {
    // Simulate plan preview generation
    await new Promise(resolve => setTimeout(resolve, 150));
    
    // Try to parse as JSON or extract steps
    let steps = [];
    try {
      // If it looks like JSON, try to parse
      if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed.steps)) {
          steps = parsed.steps;
        } else if (Array.isArray(parsed)) {
          steps = parsed;
        }
      } else {
        // Otherwise, split by lines or common step indicators
        steps = content
          .split(/\n|\d+\.|-[\s]|•/)
          .map(step => step.trim())
          .filter(step => step.length > 0);
      }
    } catch (e) {
      // Fallback to line splitting
      steps = content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
    }
    
    // Limit to reasonable number of steps for preview
    const previewSteps = steps.slice(0, 5);
    const hasMore = steps.length > 5;
    
    return {
      type: 'plan',
      steps: previewSteps,
      metadata: {
        totalSteps: steps.length,
        previewSteps: previewSteps.length,
        hasMoreSteps: hasMore,
        completedSteps: steps.filter(step => 
          step.toLowerCase().includes('done') || 
          step.toLowerCase().includes('completed')
        ).length
      }
    };
  }
  
  async generateSummaryPreview(content, options = {}) {
    // Simulate summary preview generation
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const maxLength = options.maxLength || 150;
    const preview = content.length > maxLength 
      ? content.substring(0, maxLength) + '...' 
      : content;
    
    return {
      type: 'summary',
      content: preview,
      metadata: {
        originalLength: content.length,
        previewLength: preview.length,
        compressionRatio: Math.round((preview.length / content.length) * 100),
        truncated: content.length > maxLength
      }
    };
  }
  
  // Helper to escape HTML
  escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    
    return text.replace(/[&<>"']/g, m => map[m]);
  }
  
  // Shutdown preview engine
  async shutdown() {
    // Clear cache cleanup interval
    if (this.cacheInterval) {
      clearInterval(this.cacheInterval);
      this.cacheInterval = null;
    }
    
    // Clear state
    this.state.initialized = false;
    this.state.activePreview = null;
    this.state.previewQueue = [];
    this.state.cache.clear();
    this.state.lastUpdated = null;
    
    return { success: true };
  }
}

// Export for use in browser and Node.js
if (typeof module !== "undefined" && module.exports) {
  module.exports = AuraLivePreviewEngine;
} else {
  window.AuraLivePreviewEngine = AuraLivePreviewEngine;
}