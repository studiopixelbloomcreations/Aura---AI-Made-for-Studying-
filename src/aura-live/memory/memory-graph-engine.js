// Aura Live Memory Graph Engine - Structured intelligence memory system
"use strict";

class AuraLiveMemoryGraphEngine {
  constructor() {
    this.state = {
      initialized: false,
      nodes: [],
      edges: [],
      projects: [],
      preferences: {},
      learningPatterns: {},
      unfinishedWork: [],
      sessions: [],
      lastUpdated: null
    };
    
    this.nodeIndex = new Map(); // id -> node index
    this.edgeIndex = new Map(); // id -> edge index
    this.typeIndex = new Map(); // type -> Set of node ids
    this.projectIndex = new Map(); // projectId -> Set of node ids
    
    // Configuration
    this.config = {
      maxNodes: 10000,
      maxEdges: 50000,
      importanceDecayDays: 30,
      similarityThreshold: 0.7,
      autoSaveInterval: 5000 // ms
    };
    
    // Bind methods
    this.autoSave = this.autoSave.bind(this);
  }
  
  // Initialize memory graph engine
  async initialize() {
    try {
      // Load existing data from storage
      await this.loadFromStorage();
      
      // Start auto-save interval
      this.saveInterval = setInterval(this.autoSave, this.config.autoSaveInterval);
      
      this.state.initialized = true;
      this.state.lastUpdated = new Date().toISOString();
      
      return { success: true };
    } catch (error) {
      console.error("Failed to initialize memory graph engine:", error);
      return { success: false, error: error.message };
    }
  }
  
  // Add a node to the memory graph
  addNode(type, data, importance = 0.5, projectId = null) {
    try {
      // Check if we're at capacity
      if (this.state.nodes.length >= this.config.maxNodes) {
        this.pruneLowImportanceNodes();
      }
      
      // Create node
      const node = {
        id: this.generateId(),
        type,
        data: { ...data, importance },
        importance,
        projectId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        accessCount: 0,
        lastAccessed: new Date().toISOString()
      };
      
      // Add to storage
      const index = this.state.nodes.length;
      this.state.nodes.push(node);
      this.nodeIndex.set(node.id, index);
      
      // Update indices
      if (!this.typeIndex.has(type)) {
        this.typeIndex.set(type, new Set());
      }
      this.typeIndex.get(type).add(node.id);
      
      if (projectId) {
        if (!this.projectIndex.has(projectId)) {
          this.projectIndex.set(projectId, new Set());
        }
        this.projectIndex.get(projectId).add(node.id);
        
        // Add to projects list if not already there
        if (!this.state.projects.some(p => p.id === projectId)) {
          this.state.projects.push({
            id: projectId,
            name: data.projectName || `Project ${projectId}`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
        }
      }
      
      this.state.lastUpdated = new Date().toISOString();
      
      return { success: true, node };
    } catch (error) {
      console.error("Error adding node to memory graph:", error);
      return { success: false, error: error.message };
    }
  }
  
  // Add an edge (relationship) between nodes
  addEdge(fromId, toId, type, weight = 1.0, properties = {}) {
    try {
      // Validate nodes exist
      const fromIndex = this.nodeIndex.get(fromId);
      const toIndex = this.nodeIndex.get(toId);
      
      if (fromIndex === undefined || toIndex === undefined) {
        return { success: false, error: "One or both nodes not found" };
      }
      
      // Check if we're at capacity
      if (this.state.edges.length >= this.config.maxEdges) {
        this.pruneLowWeightEdges();
      }
      
      // Create edge
      const edge = {
        id: this.generateId(),
        fromId,
        toId,
        type,
        weight,
        properties: { ...properties },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      // Add to storage
      const index = this.state.edges.length;
      this.state.edges.push(edge);
      this.edgeIndex.set(edge.id, index);
      
      this.state.lastUpdated = new Date().toISOString();
      
      return { success: true, edge };
    } catch (error) {
      console.error("Error adding edge to memory graph:", error);
      return { success: false, error: error.message };
    }
  }
  
  // Update node data
  updateNode(nodeId, updates) {
    try {
      const index = this.nodeIndex.get(nodeId);
      if (index === undefined) {
        return { success: false, error: "Node not found" };
      }
      
      const node = this.state.nodes[index];
      const oldData = { ...node.data };
      
      // Update data
      node.data = { ...node.data, ...updates };
      node.updatedAt = new Date().toISOString();
      
      // Recalculate importance if provided
      if (updates.importance !== undefined) {
        node.importance = updates.importance;
      }
      
      this.state.lastUpdated = new Date().toISOString();
      
      return { success: true, node };
    } catch (error) {
      console.error("Error updating node:", error);
      return { success: false, error: error.message };
    }
  }
  
  // Update edge data
  updateEdge(edgeId, updates) {
    try {
      const index = this.edgeIndex.get(edgeId);
      if (index === undefined) {
        return { success: false, error: "Edge not found" };
      }
      
      const edge = this.state.edges[index];
      
      // Update data
      edge.properties = { ...edge.properties, ...updates };
      edge.updatedAt = new Date().toISOString();
      
      // Recalculate weight if provided
      if (updates.weight !== undefined) {
        edge.weight = updates.weight;
      }
      
      this.state.lastUpdated = new Date().toISOString();
      
      return { success: true, edge };
    } catch (error) {
      console.error("Error updating edge:", error);
      return { success: false, error: error.message };
    }
  }
  
  // Remove node
  removeNode(nodeId) {
    try {
      const index = this.nodeIndex.get(nodeId);
      if (index === undefined) {
        return { success: false, error: "Node not found" };
      }
      
      const node = this.state.nodes[index];
      
      // Remove associated edges
      const edgesToRemove = this.state.edges
        .filter(edge => edge.fromId === nodeId || edge.toId === nodeId)
        .map(edge => edge.id);
      
      for (const edgeId of edgesToRemove) {
        this.removeEdge(edgeId);
      }
      
      // Remove from indices
      this.nodeIndex.delete(nodeId);
      this.typeIndex.get(node.type).delete(nodeId);
      if (this.typeIndex.get(node.type).size === 0) {
        this.typeIndex.delete(node.type);
      }
      
      if (node.projectId) {
        const projectNodes = this.projectIndex.get(node.projectId);
        if (projectNodes) {
          projectNodes.delete(nodeId);
          if (projectNodes.size === 0) {
            this.projectIndex.delete(node.projectId);
          }
        }
        
        // Remove project if no nodes remain
        if (!this.projectIndex.has(node.projectId)) {
          const projectIndex = this.state.projects.findIndex(p => p.id === node.projectId);
          if (projectIndex !== -1) {
            this.state.projects.splice(projectIndex, 1);
          }
        }
      }
      
      // Remove node from array
      this.state.nodes.splice(index, 1);
      
      // Update nodeIndex (rebuild for simplicity - in production would use more efficient method)
      this.rebuildNodeIndex();
      
      this.state.lastUpdated = new Date().toISOString();
      
      return { success: true };
    } catch (error) {
      console.error("Error removing node:", error);
      return { success: false, error: error.message };
    }
  }
  
  // Remove edge
  removeEdge(edgeId) {
    try {
      const index = this.edgeIndex.get(edgeId);
      if (index === undefined) {
        return { success: false, error: "Edge not found" };
      }
      
      // Remove edge from array
      this.state.edges.splice(index, 1);
      
      // Update edgeIndex (rebuild for simplicity)
      this.rebuildEdgeIndex();
      
      this.state.lastUpdated = new Date().toISOString();
      
      return { success: true };
    } catch (error) {
      console.error("Error removing edge:", error);
      return { success: false, error: error.message };
    }
  }
  
  // Query nodes by type and content
  queryNodes(options = {}) {
    try {
      let results = [...this.state.nodes];
      
      // Filter by type
      if (options.type) {
        results = results.filter(node => node.type === options.type);
      }
      
      // Filter by projectId
      if (options.projectId) {
        results = results.filter(node => node.projectId === options.projectId);
      }
      
      // Filter by data properties
      if (options.dataFilters) {
        for (const [key, value] of Object.entries(options.dataFilters)) {
          results = results.filter(node => 
            node.data[key] !== undefined && 
            (typeof value === 'function' ? value(node.data[key]) : node.data[key] === value)
          );
        }
      }
      
      // Filter by importance threshold
      if (options.minImportance !== undefined) {
        results = results.filter(node => node.importance >= options.minImportance);
      }
      
      // Filter by date range
      if (options.startDate) {
        const start = new Date(options.startDate);
        results = results.filter(node => new Date(node.createdAt) >= start);
      }
      if (options.endDate) {
        const end = new Date(options.endDate);
        results = results.filter(node => new Date(node.createdAt) <= end);
      }
      
      // Sort results
      if (options.sortBy) {
        results.sort((a, b) => {
          if (options.sortBy === 'importance') {
            return b.importance - a.importance;
          }
          if (options.sortBy === 'updatedAt') {
            return new Date(b.updatedAt) - new Date(a.updatedAt);
          }
          if (options.sortBy === 'createdAt') {
            return new Date(b.createdAt) - new Date(a.createdAt);
          }
          return 0;
        });
      }
      
      // Limit results
      if (options.limit) {
        results = results.slice(0, options.limit);
      }
      
      return { success: true, nodes: results };
    } catch (error) {
      console.error("Error querying nodes:", error);
      return { success: false, error: error.message };
    }
  }
  
  // Query edges by type and nodes
  queryEdges(options = {}) {
    try {
      let results = [...this.state.edges];
      
      // Filter by type
      if (options.type) {
        results = results.filter(edge => edge.type === options.type);
      }
      
      // Filter by connected nodes
      if (options.fromId) {
        results = results.filter(edge => edge.fromId === options.fromId);
      }
      if (options.toId) {
        results = results.filter(edge => edge.toId === options.toId);
      }
      if (options.connectedTo) {
        results = results.filter(edge => 
          edge.fromId === options.connectedTo || edge.toId === options.connectedTo
        );
      }
      
      // Filter by weight threshold
      if (options.minWeight !== undefined) {
        results = results.filter(edge => edge.weight >= options.minWeight);
      }
      
      // Sort results
      if (options.sortBy) {
        results.sort((a, b) => {
          if (options.sortBy === 'weight') {
            return b.weight - a.weight;
          }
          if (options.sortBy === 'updatedAt') {
            return new Date(b.updatedAt) - new Date(a.updatedAt);
          }
          if (options.sortBy === 'createdAt') {
            return new Date(b.createdAt) - new Date(a.createdAt);
          }
          return 0;
        });
      }
      
      // Limit results
      if (options.limit) {
        results = results.slice(0, options.limit);
      }
      
      return { success: true, edges: results };
    } catch (error) {
      console.error("Error querying edges:", error);
      return { success: false, error: error.message };
    }
  }
  
  // Find related nodes through graph traversal
  findRelatedNodes(nodeId, maxDepth = 2, edgeTypes = null) {
    try {
      const startIndex = this.nodeIndex.get(nodeId);
      if (startIndex === undefined) {
        return { success: false, error: "Start node not found" };
      }
      
      const visited = new Set();
      const toVisit = [{ nodeId, depth: 0 }];
      const relatedNodes = new Map(); // nodeId -> { node, distance, path }
      
      while (toVisit.length > 0) {
        const { nodeId: currentId, depth } = toVisit.pop();
        
        if (visited.has(currentId) || depth > maxDepth) {
          continue;
        }
        
        visited.add(currentId);
        
        // Get current node
        const currentIndex = this.nodeIndex.get(currentId);
        if (currentIndex === undefined) continue;
        const currentNode = this.state.nodes[currentIndex];
        
        // Store node info
        if (!relatedNodes.has(currentId)) {
          relatedNodes.set(currentId, {
            node: currentNode,
            distance: depth,
            path: [] // In a full implementation, we'd track the actual path
          });
        }
        
        // Find connected edges
        const edges = this.state.edges.filter(edge => 
          (edge.fromId === currentId || edge.toId === currentId) &&
          (!edgeTypes || edgeTypes.includes(edge.type))
        );
        
        // Add connected nodes to visit list
        for (const edge of edges) {
          const neighborId = edge.fromId === currentId ? edge.toId : edge.fromId;
          if (!visited.has(neighborId)) {
            toVisit.push({ nodeId: neighborId, depth: depth + 1 });
          }
        }
      }
      
      // Convert to array and sort by distance
      const results = Array.from(relatedNodes.values())
        .sort((a, b) => a.distance - b.distance)
        .map(item => item.node);
      
      return { success: true, nodes: results };
    } catch (error) {
      console.error("Error finding related nodes:", error);
      return { success: false, error: error.message };
    }
  }
  
  // Calculate importance score for new information
  calculateImportance(data, context = {}) {
    let importance = 0.5; // Base importance
    
    // Factor 1: Recency (more recent = slightly higher importance)
    // Already handled by default 0.5
    
    // Factor 2: Specificity (specific facts > general statements)
    if (data.name || data.title || data.specificFact) {
      importance += 0.1;
    }
    
    // Factor 3: Emotional significance
    if (data.emotional || data.personal || data.secret) {
      importance += 0.2;
    }
    
    // Factor 4: Relation to existing knowledge
    // In a real implementation, this would check similarity to existing nodes
    // For now, we'll use a simple heuristic
    if (data.relatedToProject || data.buildsOnPrevious) {
      importance += 0.15;
    }
    
    // Factor 5: Actionability (information that leads to action)
    if (data.actionItem || data.task || data.nextStep) {
      importance += 0.1;
    }
    
    // Context factors
    if (context.isDuringStudySession) {
      importance += 0.1;
    }
    if (context.isRepeatedInformation) {
      importance -= 0.1; // Repeated info is less important
    }
    
    // Clamp to 0-1 range
    return Math.max(0, Math.min(1, importance));
  }
  
  // Add information to memory graph with automatic importance scoring
  addInformation(type, data, context = {}) {
    const importance = this.calculateImportance(data, context);
    return this.addNode(type, data, importance, context.projectId);
  }
  
  // Get summary for context injection
  getContextSummary() {
    try {
      // Get recent high-importance nodes
      const recentNodes = this.state.nodes
        .filter(node => 
          new Date().getTime() - new Date(node.updatedAt).getTime() < 24 * 60 * 60 * 1000 // Last 24 hours
        )
        .sort((a, b) => b.importance - a.importance)
        .slice(0, 10);
      
      // Get active projects
      const activeProjects = this.state.projects
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        .slice(0, 5);
      
      // Get learning patterns
      const learningPatterns = Object.entries(this.state.learningPatterns)
        .sort(([,a], [,b]) => b.updatedAt - a.updatedAt)
        .slice(0, 5)
        .map(([pattern, data]) => ({ pattern, ...data }));
      
      // Get unfinished work
      const unfinishedWork = this.state.unfinishedWork
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        .slice(0, 5);
      
      return {
        recentFacts: recentNodes.map(node => ({
          id: node.id,
          type: node.type,
          summary: this.summarizeNodeData(node.data),
          importance: node.importance,
          timestamp: node.updatedAt
        })),
        activeProjects: activeProjects.map(project => ({
          id: project.id,
          name: project.name,
          updatedAt: project.updatedAt
        })),
        learningPatterns,
        unfinishedWork,
        totalNodes: this.state.nodes.length,
        totalEdges: this.state.edges.length
      };
    } catch (error) {
      console.error("Error generating context summary:", error);
      return {
        recentFacts: [],
        activeProjects: [],
        learningPatterns: [],
        unfinishedWork: [],
        totalNodes: 0,
        totalEdges: 0
      };
    }
  }
  
  // Summarize node data for context
  summarizeNodeData(data) {
    // Create a brief summary of the node data
    const parts = [];
    
    if data.name) parts.push(`Name: ${data.name}`);
    if (data.title) parts.push(`Title: ${data.title}`);
    if (data.summary) parts.push(data.summary);
    if (data.fact) parts.push(`Fact: ${data.fact}`);
    if (data.description) parts.push(`Description: ${data.description}`);
    
    // Limit length
    let summary = parts.join('; ');
    if (summary.length > 200) {
      summary = summary.substring(0, 197) + '...';
    }
    
    return summary || 'Information node';
  }
  
  // Prune low importance nodes when at capacity
  pruneLowImportanceNodes() {
    // Sort nodes by importance (ascending) and remove lowest 10%
    const nodesToRemove = Math.ceil(this.state.nodes.length * 0.1);
    const sortedNodes = [...this.state.nodes].sort((a, b) => a.importance - b.importance);
    
    for (let i = 0; i < nodesToRemove; i++) {
      this.removeNode(sortedNodes[i].id);
    }
  }
  
  // Prune low weight edges when at capacity
  pruneLowWeightEdges() {
    // Sort edges by weight (ascending) and remove lowest 10%
    const edgesToRemove = Math.ceil(this.state.edges.length * 0.1);
    const sortedEdges = [...this.state.edges].sort((a, b) => a.weight - b.weight);
    
    for (let i = 0; i < edgesToRemove; i++) {
      this.removeEdge(sortedEdges[i].id);
    }
  }
  
  // Rebuild node index (called after bulk operations)
  rebuildNodeIndex() {
    this.nodeIndex.clear();
    this.state.nodes.forEach((node, index) => {
      this.nodeIndex.set(node.id, index);
    });
  }
  
  // Rebuild edge index (called after bulk operations)
  rebuildEdgeIndex() {
    this.edgeIndex.clear();
    this.state.edges.forEach((edge, index) => {
      this.edgeIndex.set(edge.id, index);
    });
  }
  
  // Generate unique ID
  generateId() {
    return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
  }
  
  // Auto-save to storage
  async autoSave() {
    try {
      await this.saveToStorage();
    } catch (error) {
      console.error("Error in auto-save:", error);
    }
  }
  
  // Save to storage (localStorage for browser, would be IndexedDB or server in production)
  async saveToStorage() {
    try {
      const data = {
        nodes: this.state.nodes,
        edges: this.state.edges,
        projects: this.state.projects,
        preferences: this.state.preferences,
        learningPatterns: this.state.learningPatterns,
        unfinishedWork: this.state.unfinishedWork,
        sessions: this.state.sessions,
        lastUpdated: this.state.lastUpdated
      };
      
      // In browser, use localStorage
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('auraLiveMemoryGraph', JSON.stringify(data));
      }
      
      // In Node.js, would use file system or database
      // For now, we'll just log
      // console.log('Memory graph saved to storage');
      
      return { success: true };
    } catch (error) {
      console.error("Error saving to storage:", error);
      return { success: false, error: error.message };
    }
  }
  
  // Load from storage
  async loadFromStorage() {
    try {
      let data = null;
      
      // In browser, use localStorage
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = localStorage.getItem('auraLiveMemoryGraph');
        if (saved) {
          data = JSON.parse(saved);
        }
      }
      
      // Apply loaded data
      if (data) {
        this.state.nodes = data.nodes || [];
        this.state.edges = data.edges || [];
        this.state.projects = data.projects || [];
        this.state.preferences = data.preferences || {};
        this.state.learningPatterns = data.learningPatterns || {};
        this.state.unfinishedWork = data.unfinishedWork || [];
        this.state.sessions = data.sessions || [];
        this.state.lastUpdated = data.lastUpdated || new Date().toISOString();
        
        // Rebuild indices
        this.rebuildNodeIndex();
        this.rebuildEdgeIndex();
        
        // Rebuild type and project indices
        this.typeIndex.clear();
        this.projectIndex.clear();
        
        this.state.nodes.forEach((node, index) => {
          // Type index
          if (!this.typeIndex.has(node.type)) {
            this.typeIndex.set(node.type, new Set());
          }
          this.typeIndex.get(node.type).add(node.id);
          
          // Project index
          if (node.projectId) {
            if (!this.projectIndex.has(node.projectId)) {
              this.projectIndex.set(node.projectId, new Set());
            }
            this.projectIndex.get(node.projectId).add(node.id);
          }
        });
      }
      
      return { success: true };
    } catch (error) {
      console.error("Error loading from storage:", error);
      // Start with empty state
      this.state.nodes = [];
      this.state.edges = [];
      this.state.projects = [];
      this.state.preferences = {};
      this.state.learningPatterns = {};
      this.state.unfinishedWork = [];
      this.state.sessions = [];
      this.state.lastUpdated = new Date().toISOString();
      return { success: false, error: error.message };
    }
  }
  
  // Shutdown memory graph engine
  async shutdown() {
    // Clear auto-save interval
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
      this.saveInterval = null;
    }
    
    // Final save
    await this.saveToStorage();
    
    // Clear state
    this.state.initialized = false;
    this.state.nodes = [];
    this.state.edges = [];
    this.state.projects = [];
    this.state.preferences = {};
    this.state.learningPatterns = {};
    this.state.unfinishedWork = [];
    this.state.sessions = [];
    this.state.lastUpdated = null;
    
    // Clear indices
    this.nodeIndex.clear();
    this.edgeIndex.clear();
    this.typeIndex.clear();
    this.projectIndex.clear();
    
    return { success: true };
  }
}

// Export for use in browser and Node.js
if (typeof module !== "undefined" && module.exports) {
  module.exports = AuraLiveMemoryGraphEngine;
} else {
  window.AuraLiveMemoryGraphEngine = AuraLiveMemoryGraphEngine;
}