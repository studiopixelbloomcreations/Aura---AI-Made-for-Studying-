// Aura Live Task Execution Engine - Performs actions and manages projects
"use strict";

class AuraLiveTaskExecutionEngine {
  constructor() {
    this.state = {
      initialized: false,
      activeTasks: [],
      completedTasks: [],
      failedTasks: [],
      taskQueue: [],
      projects: [],
      lastUpdated: null
    };
    
    this.taskHandlers = {};
    this.projectHandlers = {};
    this.executionLock = false;
    this.maxConcurrentTasks = 3;
    
    // Configuration
    this.config = {
      taskTimeout: 30000, // 30 seconds
      retryAttempts: 3,
      retryDelay: 1000, // 1 second
      maxTaskHistory: 1000
    };
    
    // Bind methods
    this.processTaskQueue = this.processTaskQueue.bind(this);
    this.executeTask = this.executeTask.bind(this);
  }
  
  // Initialize task execution engine
  async initialize() {
    try {
      // Register default task handlers
      this.registerDefaultHandlers();
      
      // Start task processing interval
      this.processInterval = setInterval(this.processTaskQueue, 1000); // Check every second
      
      this.state.initialized = true;
      this.state.lastUpdated = new Date().toISOString();
      
      return { success: true };
    } catch (error) {
      console.error("Failed to initialize task execution engine:", error);
      return { success: false, error: error.message };
    }
  }
  
  // Register a task handler
  registerTaskHandler(taskType, handler) {
    this.taskHandlers[taskType] = handler;
  }
  
  // Register a project handler
  registerProjectHandler(projectType, handler) {
    this.projectHandlers[projectType] = handler;
  }
  
  // Add a task to the queue
  async addTask(taskType, payload, options = {}) {
    if (!this.state.initialized) {
      await this.initialize();
    }
    
    try {
      const task = {
        id: this.generateTaskId(),
        type: taskType,
        payload: { ...payload },
        options: { ...options },
        status: 'pending',
        priority: options.priority || 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        attempts: 0,
        maxRetries: options.maxRetries || this.config.retryAttempts
      };
      
      // Validate task type has handler
      if (!this.taskHandlers[taskType]) {
        return { 
          success: false, 
          error: `No handler registered for task type: ${taskType}` 
        };
      }
      
      this.state.taskQueue.push(task);
      this.state = {
        ...this.state,
        taskQueue: [...this.state.taskQueue], // Trigger reactivity
        lastUpdated: new Date().toISOString()
      };
      
      return { success: true, taskId: task.id };
    } catch (error) {
      console.error("Error adding task:", error);
      return { success: false, error: error.message };
    }
  }
  
  // Add a project
  async addProject(projectType, payload, options = {}) {
    if (!this.state.initialized) {
      await this.initialize();
    }
    
    try {
      const project = {
        id: this.generateProjectId(),
        type: projectType,
        payload: { ...payload },
        options: { ...options },
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        progress: 0,
        tasks: [] // Associated task IDs
      };
      
      // Validate project type has handler
      if (!this.projectHandlers[projectType]) {
        return { 
          success: false, 
          error: `No handler registered for project type: ${projectType}` 
        };
      }
      
      this.state.projects.push(project);
      this.state = {
        ...this.state,
        projects: [...this.state.projects], // Trigger reactivity
        lastUpdated: new Date().toISOString()
      };
      
      return { success: true, projectId: project.id };
    } catch (error) {
      console.error("Error adding project:", error);
      return { success: false, error: error.message };
    }
  }
  
  // Process the task queue
  async processTaskQueue() {
    // Prevent concurrent processing
    if (this.executionLock) return;
    
    // Check if we have capacity
    const runningTasks = this.state.activeTasks.filter(t => t.status === 'executing');
    if (runningTasks.length >= this.maxConcurrentTasks) return;
    
    // Get pending tasks sorted by priority
    const pendingTasks = this.state.taskQueue
      .filter(task => task.status === 'pending')
      .sort((a, b) => b.priority - a.priority);
    
    // Process up to available capacity
    const availableSlots = this.maxConcurrentTasks - runningTasks.length;
    const tasksToProcess = pendingTasks.slice(0, availableSlots);
    
    // Execute tasks
    for (const task of tasksToProcess) {
      this.executeTask(task).catch(console.error);
    }
  }
  
  // Execute a single task
  async executeTask(task) {
    // Mark task as executing
    task.status = 'executing';
    task.updatedAt = new Date().toISOString();
    task.startedAt = new Date().toISOString();
    
    // Update state
    this.updateTaskInQueue(task);
    this.state = {
      ...this.state,
      activeTasks: [...this.state.activeTasks.filter(t => t.id !== task.id), task],
      lastUpdated: new Date().toISOString()
    };
    
    try {
      // Get handler for this task type
      const handler = this.taskHandlers[task.type];
      if (!handler) {
        throw new Error(`No handler found for task type: ${task.type}`);
      }
      
      // Execute with timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Task timeout after ${this.config.taskTimeout}ms`)), 
                  this.config.taskTimeout);
      });
      
      const result = await Promise.race([
        handler(task.payload, task.options),
        timeoutPromise
      ]);
      
      // Task completed successfully
      task.status = 'completed';
      task.completedAt = new Date().toISOString();
      task.result = result;
      
      // Move to completed tasks
      this.completeTask(task);
      
    } catch (error) {
      // Task failed
      task.status = 'failed';
      task.updatedAt = new Date().toISOString();
      task.error = error.message;
      task.attempts++;
      
      // Check if we should retry
      if (task.attempts < task.maxRetries) {
        // Reset to pending for retry
        task.status = 'pending';
        task.retryAt = new Date(Date.now() + this.config.retryDelay).toISOString();
        
        // Update in queue
        this.updateTaskInQueue(task);
        
        console.log(`Task ${task.id} failed, retrying (attempt ${task.attempts}/${task.maxRetries}): ${error.message}`);
      } else {
        // Max retries exceeded, move to failed
        this.failTask(task);
        console.error(`Task ${task.id} failed permanently after ${task.attempts} attempts: ${error.message}`);
      }
    }
  }
  
  // Complete a task
  completeTask(task) {
    // Remove from active tasks
    this.state.activeTasks = this.state.activeTasks.filter(t => t.id !== task.id);
    
    // Add to completed tasks
    this.state.completedTasks.push(task);
    
    // Remove from queue
    this.state.taskQueue = this.state.taskQueue.filter(t => t.id !== task.id);
    
    // Update state
    this.state = {
      ...this.state,
      lastUpdated: new Date().toISOString()
    };
    
    // Limit task history
    if (this.state.completedTasks.length > this.config.maxTaskHistory) {
      this.state.completedTasks = this.state.completedTasks.slice(-this.config.maxTaskHistory);
    }
  }
  
  // Fail a task
  failTask(task) {
    // Remove from active tasks
    this.state.activeTasks = this.state.activeTasks.filter(t => t.id !== task.id);
    
    // Add to failed tasks
    this.state.failedTasks.push(task);
    
    // Remove from queue
    this.state.taskQueue = this.state.taskQueue.filter(t => t.id !== task.id);
    
    // Update state
    this.state = {
      ...this.state,
      lastUpdated: new Date().toISOString()
    };
    
    // Limit task history
    if (this.state.failedTasks.length > this.config.maxTaskHistory) {
      this.state.failedTasks = this.state.failedTasks.slice(-this.config.maxTaskHistory);
    }
  }
  
  // Update task in queue (for reactivity)
  updateTaskInQueue(updatedTask) {
    const index = this.state.taskQueue.findIndex(t => t.id === updatedTask.id);
    if (index !== -1) {
      this.state.taskQueue[index] = updatedTask;
    }
  }
  
  // Get task by ID
  getTaskById(taskId) {
    // Check active tasks
    const activeTask = this.state.activeTasks.find(t => t.id === taskId);
    if (activeTask) return activeTask;
    
    // Check queue
    const queuedTask = this.state.taskQueue.find(t => t.id === taskId);
    if (queuedTask) return queuedTask;
    
    // Check completed tasks
    const completedTask = this.state.completedTasks.find(t => t.id === taskId);
    if (completedTask) return completedTask;
    
    // Check failed tasks
    const failedTask = this.state.failedTasks.find(t => t.id === taskId);
    if (failedTask) return failedTask;
    
    return null;
  }
  
  // Get project by ID
  getProjectById(projectId) {
    return this.state.projects.find(p => p.id === projectId);
  }
  
  // Update project progress
  async updateProjectProgress(projectId, progress, options = {}) {
    const projectIndex = this.state.projects.findIndex(p => p.id === projectId);
    if (projectIndex === -1) {
      return { success: false, error: 'Project not found' };
    }
    
    const project = this.state.projects[projectIndex];
    project.progress = Math.max(0, Math.min(100, progress));
    project.updatedAt = new Date().toISOString();
    
    if (options.status) {
      project.status = options.status;
    }
    
    // Update state
    this.state.projects[projectIndex] = project;
    this.state = {
      ...this.state,
      projects: [...this.state.projects],
      lastUpdated: new Date().toISOString()
    };
    
    return { success: true, project };
  }
  
  // Cancel a task
  async cancelTask(taskId) {
    const task = this.getTaskById(taskId);
    if (!task) {
      return { success: false, error: 'Task not found' };
    }
    
    if (task.status === 'executing') {
      // Can't cancel executing task easily - would need to implement cancellation tokens
      return { 
        success: false, 
        error: 'Cannot cancel executing task' 
      };
    }
    
    // Remove from appropriate collection
    if (task.status === 'pending') {
      this.state.taskQueue = this.state.taskQueue.filter(t => t.id !== taskId);
    }
    
    // Update state
    this.state = {
      ...this.state,
      lastUpdated: new Date().toISOString()
    };
    
    return { success: true };
  }
  
  // Get execution statistics
  getExecutionStats() {
    return {
      activeTasks: this.state.activeTasks.length,
      queuedTasks: this.state.taskQueue.filter(t => t.status === 'pending').length,
      completedTasks: this.state.completedTasks.length,
      failedTasks: this.state.failedTasks.length,
      totalTasksProcessed: this.state.completedTasks.length + this.state.failedTasks.length,
      successRate: this.state.completedTasks.length > 0 
        ? (this.state.completedTasks.length / (this.state.completedTasks.length + this.state.failedTasks.length)) * 100
        : 0
    };
  }
  
  // Generate unique task ID
  generateTaskId() {
    return `task_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  // Generate unique project ID
  generateProjectId() {
    return `project_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  // Register default task handlers
  registerDefaultHandlers() {
    // Text summarization task
    this.registerTaskHandler('summarize_text', async (payload) => {
      const { text, maxLength = 100 } = payload;
      // Simple summarization - in reality would use NLP model
      if (text.length <= maxLength) return text;
      return text.substring(0, maxLength) + '...';
    });
    
    // Text translation task
    this.registerTaskHandler('translate_text', async (payload) => {
      const { text, targetLanguage = 'es' } = payload;
      // Placeholder - would use translation API
      return `[Translated to ${targetLanguage}]: ${text}`;
    });
    
    // Math problem solving task
    this.registerTaskHandler('solve_math', async (payload) => {
      const { problem } = payload;
      // Placeholder - would use math solving API
      return `Solution for: ${problem}`;
    });
    
    // Flashcard creation task
    this.registerTaskHandler('create_flashcards', async (payload) => {
      const { content, count = 5 } = payload;
      // Simple flashcard generation
      const flashcards = [];
      const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
      for (let i = 0; i < Math.min(count, sentences.length); i++) {
        flashcards.push({
          front: sentences[i].trim(),
          back: `Explanation of: ${sentences[i].trim()}`
        });
      }
      return flashcards;
    });
    
    // Study plan generation task
    this.registerTaskHandler('generate_study_plan', async (payload) => {
      const { subject, topics, daysUntilExam = 7 } = payload;
      // Simple study plan generation
      const plan = {
        subject,
        topics,
        daysUntilExam,
        dailySchedule: [],
        totalHours: topics.length * 2 // Assume 2 hours per topic
      };
      
      // Distribute topics across days
      const topicsPerDay = Math.max(1, Math.ceil(topics.length / daysUntilExam));
      for (let day = 0; day < daysUntilExam; day++) {
        const start = day * topicsPerDay;
        const end = Math.min(start + topicsPerDay, topics.length);
        plan.dailySchedule.push({
          day: day + 1,
          topics: topics.slice(start, end),
          hours: Math.min(2, (end - start) * 2)
        });
      }
      
      return plan;
    });
    
    // Essay outline task
    this.registerTaskHandler('create_essay_outline', async (payload) => {
      const { topic, essayType = 'expository' } = payload;
      // Simple outline generation
      const outline = {
        topic,
        type: essayType,
        sections: [
          { type: 'introduction', content: `Introduction to ${topic}` },
          { type: 'body', content: `Main points about ${topic}` },
          { type: 'body', content: `Supporting evidence for ${topic}` },
          { type: 'body', content: `Counterarguments and responses` },
          { type: 'conclusion', content: `Conclusion about ${topic}` }
        ]
      };
      
      return outline;
    });
    
    // Register default project handlers
    this.registerProjectHandler('essay_writing', async (payload) => {
      // Essay writing project handler
      return {
        type: 'essay_writing',
        status: 'initialized',
        message: `Essay writing project initialized for: ${payload.topic}`
      };
    });
    
    this.registerProjectHandler('research_project', async (payload) => {
      // Research project handler
      return {
        type: 'research_project',
        status: 'initialized',
        message: `Research project initialized for: ${payload.topic}`
      };
    });
    
    this.registerProjectHandler('exam_preparation', async (payload) => {
      // Exam preparation project handler
      return {
        type: 'exam_preparation',
        status: 'initialized',
        message: `Exam preparation project initialized for: ${payload.subject}`
      };
    });
  }
  
  // Shutdown task execution engine
  async shutdown() {
    // Clear processing interval
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = null;
    }
    
    // Wait for active tasks to complete or timeout (simplified)
    // In a real implementation, we'd properly cancel tasks
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Reset state
    this.state.initialized = false;
    this.state.activeTasks = [];
    this.state.completedTasks = [];
    this.state.failedTasks = [];
    this.state.taskQueue = [];
    this.state.projects = [];
    this.state.lastUpdated = null;
    
    // Clear handlers
    this.taskHandlers = {};
    this.projectHandlers = {};
    
    return { success: true };
  }
}

// Export for use in browser and Node.js
if (typeof module !== "undefined" && module.exports) {
  module.exports = AuraLiveTaskExecutionEngine;
} else {
  window.AuraLiveTaskExecutionEngine = AuraLiveTaskExecutionEngine;
}