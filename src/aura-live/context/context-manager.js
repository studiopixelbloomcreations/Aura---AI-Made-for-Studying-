// Aura Live Context Manager - Detects active workflows and infers intention
"use strict";

class AuraLiveContextManager {
  constructor() {
    this.state = {
      initialized: false,
      currentWorkflow: "idle",
      activeModules: [],
      intention: "",
      confidence: 0,
      contextHistory: [],
      lastUpdated: null
    };
    
    this.workflowDetectors = [];
    intentionInferrers = [];
    this.contextUpdateInterval = 2000; // ms
    this.contextTimeout = 30000; // ms - context expires after 30s of inactivity
    
    // Bind methods
    this.updateContext = this.updateContext.bind(this);
    this.detectWorkflow = this.detectWorkflow.bind(this);
    this.inferIntention = this.inferIntention.bind(this);
  }
  
  // Initialize context manager
  async initialize() {
    try {
      // Initialize workflow detectors
      this.initializeWorkflowDetectors();
      
      // Initialize intention inferrers
      this.initializeIntentionInferrers();
      
      // Start context update interval
      this.updateInterval = setInterval(this.updateContext, this.contextUpdateInterval);
      
      this.state.initialized = true;
      this.state.lastUpdated = new Date().toISOString();
      
      return { success: true };
    } catch (error) {
      console.error("Failed to initialize context manager:", error);
      return { success: false, error: error.message };
    }
  }
  
  // Initialize workflow detectors
  initializeWorkflowDetectors() {
    this.workflowDetectors = [
      new StudyWorkflowDetector(),
      new ConversationWorkflowDetector(),
      new CreationWorkflowDetector(),
      new ResearchWorkflowDetector(),
      new ProblemSolvingWorkflowDetector()
    ];
  }
  
  // Initialize intention inferrers
  initializeIntentionInferrers() {
    this.intentionInferrers = [
      new KeywordIntentionInferrer(),
      new PatternIntentionInferrer(),
      new ContextualIntentionInferrer()
    ];
  }
  
  // Update context based on current inputs
  async updateContext() {
    try {
      // Get inputs from various sources
      const inputs = await this.gatherContextInputs();
      
      // Detect workflow
      const workflowResult = this.detectWorkflow(inputs);
      
      // Infer intention
      const intentionResult = this.inferIntention(inputs, workflowResult);
      
      // Calculate confidence
      const confidence = this.calculateContextConfidence(workflowResult, intentionResult);
      
      // Update state
      const now = new Date().toISOString();
      this.state = {
        ...this.state,
        currentWorkflow: workflowResult.workflow || "idle",
        activeModules: workflowResult.activeModules || [],
        intention: intentionResult.intention || "",
        confidence: confidence,
        contextHistory: [
          ...this.state.contextHistory,
          {
            timestamp: now,
            workflow: this.state.currentWorkflow,
            intention: this.state.intention,
            confidence: this.state.confidence
          }
        ].slice(-50), // Keep last 50 entries
        lastUpdated: now
      };
      
      // Check for context timeout
      this.checkContextTimeout();
      
      return { success: true, context: this.getState() };
    } catch (error) {
      console.error("Error updating context:", error);
      return { success: false, error: error.message };
    }
  }
  
  // Gather inputs from various sources
  async gatherContextInputs() {
    const inputs = {
      timestamp: new Date().toISOString(),
      voice: {},
      vision: {},
      interaction: {},
      system: {}
    };
    
    // In a real implementation, this would get data from:
    // - Voice engine (transcript, wake word, etc.)
    // - Vision engine (objects, scene, text)
    // - UI interactions (clicks, selections, etc.)
    // - System state (time, date, etc.)
    
    // For now, we'll simulate with placeholder data
    inputs.voice = {
      transcript: "", // Would come from voice engine
      wakeWordDetected: false,
      listening: false,
      processing: false
    };
    
    inputs.vision = {
      objects: [], // Would come from vision engine
      scene: "", // Would come from vision engine
      text: "", // Would come from vision engine (OCR)
      cameraActive: false
    };
    
    inputs.interaction = {
      activeElement: "", // Currently focused UI element
      recentActions: [], // Recent user actions
      inputFields: {}, // Form/input field states
      selections: [] // Text/selections made
    };
    
    inputs.system = {
      time: new Date(),
      dayOfWeek: new Date().getDay(),
      hourOfDay: new Date().getHours(),
      pageUrl: window.location.href, // Current page
      referrer: document.referrer // Where user came from
    };
    
    return inputs;
  }
  
  // Detect current workflow based on inputs
  detectWorkflow(inputs) {
    let bestMatch = { workflow: "idle", confidence: 0, activeModules: [] };
    
    for (const detector of this.workflowDetectors) {
      try {
        const result = detector.detect(inputs);
        if (result.confidence > bestMatch.confidence) {
          bestMatch = result;
        }
      } catch (error) {
        console.error(`Error in workflow detector ${detector.constructor.name}:`, error);
      }
    }
    
    return bestMatch;
  }
  
  // Infer user intention based on inputs and workflow
  inferIntention(inputs, workflowResult) {
    let bestMatch = { intention: "", confidence: 0 };
    
    for (const inferrer of this.intentionInferrers) {
      try {
        const result = inferrer.infer(inputs, workflowResult);
        if (result.confidence > bestMatch.confidence) {
          bestMatch = result;
        }
      } catch (error) {
        console.error(`Error in intention inferrer ${inferrer.constructor.name}:`, error);
      }
    }
    
    return bestMatch;
  }
  
  // Calculate overall context confidence
  calculateContextConfidence(workflowResult, intentionResult) {
    // Weight workflow detection higher than intention inference
    const workflowWeight = 0.6;
    const intentionWeight = 0.4;
    
    return Math.min(1.0, 
      (workflowResult.confidence * workflowWeight) + 
      (intentionResult.confidence * intentionWeight)
    );
  }
  
  // Check if context has timed out due to inactivity
  checkContextTimeout() {
    if (!this.state.lastUpdated) return;
    
    const lastUpdate = new Date(this.state.lastUpdated);
    const now = new Date();
    const elapsed = now.getTime() - lastUpdate.getTime();
    
    if (elapsed > this.contextTimeout) {
      // Context has expired, reset to idle
      this.state = {
        ...this.state,
        currentWorkflow: "idle",
        activeModules: [],
        intention: "",
        confidence: 0,
        lastUpdated: new Date().toISOString()
      };
    }
  }
  
  // Get current state
  getState() {
    return { ...this.state };
  }
  
  // Get context for injection into NCS/Harmony
  getContextInjection() {
    return {
      workflow: this.state.currentWorkflow,
      activeModules: this.state.activeModules,
      intention: this.state.intention,
      confidence: this.state.confidence,
      timestamp: this.state.lastUpdated,
      // Additional context for NCS
      ncsContext: {
        userMessage: "", // Would be populated from voice input
        observatoryOutput: {
          type: this.state.currentWorkflow,
          confidence: this.state.confidence
        },
        activeModules: this.state.activeModules,
        recentCalls: [], // Would track recent function calls
        metadata: {},
        sessionData: {}
      }
    };
  }
  
  // Manually set context (for testing or external updates)
  setContext(updates) {
    this.state = { ...this.state, ...updates };
    this.state.lastUpdated = new Date().toISOString();
  }
  
  // Reset context to idle
  resetContext() {
    this.state = {
      ...this.state,
      currentWorkflow: "idle",
      activeModules: [],
      intention: "",
      confidence: 0,
      lastUpdated: new Date().toISOString(),
      contextHistory: []
    };
  }
  
  // Shutdown context manager
  async shutdown() {
    // Clear update interval
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    
    // Reset state
    this.state.initialized = false;
    this.state.currentWorkflow = "idle";
    this.state.activeModules = [];
    this.state.intention = "";
    this.state.confidence = 0;
    this.state.contextHistory = [];
    this.state.lastUpdated = null;
    
    return { success: true };
  }
}

// Study Workflow Detector
class StudyWorkflowDetector {
  detect(inputs) {
    let confidence = 0;
    const activeModules = [];
    
    // Check for study-related keywords in voice transcript
    const transcript = (inputs.voice.transcript || "").toLowerCase();
    const studyKeywords = [
      "study", "learn", "homework", "assignment", "exam", "test", "quiz",
      "math", "science", "english", "history", "explain", "solve", "help me",
      "what is", "how to", "define", "example", "formula", "equation"
    ];
    
    const keywordMatches = studyKeywords.filter(keyword => 
      transcript.includes(keyword)
    );
    
    if (keywordMatches.length > 0) {
      confidence += Math.min(0.4, keywordMatches.length * 0.1);
      activeModules.push("voice_input");
    }
    
    // Check for study-related vision inputs
    const objects = inputs.vision.objects || [];
    const studyObjects = ["book", "notebook", "pen", "pencil", "calculator", "computer", "tablet"];
    const objectMatches = objects.filter(obj => 
      studyObjects.includes(obj.label.toLowerCase())
    );
    
    if (objectMatches.length > 0) {
      confidence += Math.min(0.3, objectMatches.length * 0.1);
      activeModules.push("vision_input");
    }
    
    // Check time of day (study hours)
    const hour = inputs.system.hourOfDay;
    if ((hour >= 8 && hour <= 12) || (hour >= 14 && hour <= 18)) {
      confidence += 0.2;
      activeModules.append("system_time");
    }
    
    return {
      workflow: confidence > 0.3 ? "study" : "idle",
      confidence: Math.min(1.0, confidence),
      activeModules: [...new Set(activeModules)] // Remove duplicates
    };
  }
}

// Conversation Workflow Detector
class ConversationWorkflowDetector {
  detect(inputs) {
    let confidence = 0;
    const activeModules = [];
    
    // Check for conversational patterns in voice transcript
    const transcript = (inputs.voice.transcript || "").toLowerCase();
    const conversationPatterns = [
      "hi", "hello", "hey", "how are you", "thanks", "thank you",
      "bye", "goodbye", "what's up", "tell me about", "i think",
      "i feel", "in my opinion"
    ];
    
    const patternMatches = conversationPatterns.filter(pattern => 
      transcript.includes(pattern)
    );
    
    if (patternMatches.length > 0) {
      confidence += Math.min(0.5, patternMatches.length * 0.1);
      activeModules.push("voice_input");
    }
    
    // Check for back-and-forth interaction
    if (inputs.voice.listening && inputs.voice.processing) {
      confidence += 0.3;
      activeModules.push("voice_engine");
    }
    
    return {
      workflow: confidence > 0.4 ? "conversation" : "idle",
      confidence: Math.min(1.0, confidence),
      activeModules: [...new Set(activeModules)]
    };
  }
}

// Creation Workflow Detector
class CreationWorkflowDetector {
  detect(inputs) {
    let confidence = 0;
    const activeModules = [];
    
    // Check for creation-related keywords
    const transcript = (inputs.voice.transcript || "").toLowerCase();
    const creationKeywords = [
      "create", "make", "build", "design", "draw", "write", "compose",
      "generate", "produce", "construct", "develop", "plan", "outline",
      "essay", "story", "poem", "diagram", "chart", "graph", "presentation"
    ];
    
    const keywordMatches = creationKeywords.filter(keyword => 
      transcript.includes(keyword)
    );
    
    if (keywordMatches.length > 0) {
      confidence += Math.min(0.5, keywordMatches.length * 0.1);
      activeModules.push("voice_input");
    }
    
    // Check for creation-related vision inputs (drawing, writing, etc.)
    const objects = inputs.vision.objects || [];
    const creationObjects = ["paper", "canvas", "drawing", "writing", "sketch", "design"];
    const objectMatches = objects.filter(obj => 
      creationObjects.some(co => obj.label.toLowerCase().includes(co))
    );
    
    if (objectMatches.length > 0) {
      confidence += Math.min(0.3, objectMatches.length * 0.1);
      activeModules.push("vision_input");
    }
    
    return {
      workflow: confidence > 0.3 ? "creation" : "idle",
      confidence: Math.min(1.0, confidence),
      activeModules: [...new Set(activeModules)]
    };
  }
}

// Research Workflow Detector
class ResearchWorkflowDetector {
  detect(inputs) {
    let confidence = 0;
    const activeModules = [];
    
    // Check for research-related keywords
    const transcript = (inputs.voice.transcript || "").toLowerCase();
    const researchKeywords = [
      "research", "investigate", "explore", "find out", "discover",
      "information", "data", "facts", "statistics", "study", "analyze",
      "compare", "contrast", "evaluate", "assess", "review", "survey"
    ];
    
    const keywordMatches = researchKeywords.filter(keyword => 
      transcript.includes(keyword)
    );
    
    if (keywordMatches.length > 0) {
      confidence += Math.min(0.4, keywordMatches.length * 0.1);
      activeModules.push("voice_input");
    }
    
    // Check for research-related vision inputs (books, documents, screens)
    const objects = inputs.vision.objects || [];
    const researchObjects = ["book", "document", "screen", "monitor", "display", "chart", "graph"];
    const objectMatches = objects.filter(obj => 
      researchObjects.some(ro => obj.label.toLowerCase().includes(ro))
    );
    
    if (objectMatches.length > 0) {
      confidence += Math.min(0.3, objectMatches.length * 0.1);
      activeModules.push("vision_input");
    }
    
    return {
      workflow: confidence > 0.3 ? "research" : "idle",
      confidence: Math.min(1.0, confidence),
      activeModules: [...new Set(activeModules)]
    };
  }
}

// Problem Solving Workflow Detector
class ProblemSolvingWorkflowDetector {
  detect(inputs) {
    let confidence = 0;
    const activeModules = [];
    
    // Check for problem-solving keywords
    const transcript = (inputs.voice.transcript || "").toLowerCase();
    const problemKeywords = [
      "problem", "solve", "solution", "answer", "figure out", "work out",
      "calculate", "compute", "determine", "find", "why", "how come",
      "troubleshoot", "debug", "fix", "correct", "mistake", "error"
    ];
    
    const keywordMatches = problemKeywords.filter(keyword => 
      transcript.includes(keyword)
    );
    
    if (keywordMatches.length > 0) {
      confidence += Math.min(0.4, keywordMatches.length * 0.1);
      activeModules.push("voice_input");
    }
    
    // Check for mathematical symbols or equations in vision (OCR)
    const text = (inputs.vision.text || "").toLowerCase();
    const mathSymbols = ["+", "-", "*", "/", "=", ">", "<", "∑", "∫", "π", "θ", "α", "β"];
    const symbolCount = mathSymbols.reduce((count, symbol) => 
      count + (text.split(symbol).length - 1), 0
    );
    
    if (symbolCount > 2) {
      confidence += Math.min(0.3, symbolCount * 0.05);
      activeModules.push("vision_ocr");
    }
    
    return {
      workflow: confidence > 0.3 ? "problem_solving" : "idle",
      confidence: Math.min(1.0, confidence),
      activeModules: [...new Set(activeModules)]
    };
  }
}

// Keyword Intention Inferrer
class KeywordIntentionInferrer {
  infer(inputs, workflowResult) {
    let confidence = 0;
    let intention = "general_inquiry";
    
    const transcript = (inputs.voice.transcript || "").toLowerCase();
    
    // Define intention patterns
    const intentionPatterns = {
      "explanation_request": ["explain", "describe", "tell me about", "what is", "what does"],
      "help_request": ["help me", "can you help", "i need help", "assist me", "support"],
      "calculation_request": ["calculate", "compute", "solve", "what is the answer", "how much"],
      "translation_request": ["translate", "what does this mean in", "how do you say"],
      "summarization_request": ["summarize", "summary", "briefly", "in short", "tl;dr"],
      "example_request": ["example", "give me an example", "for instance", "like what"],
      "comparison_request": ["compare", "difference between", "versus", "vs", "better than"],
      "definition_request": ["define", "definition of", "what does the word mean"],
      "opinion_request": ["what do you think", "your opinion", "do you believe", "is it true that"],
      "homework_help": ["homework", "assignment", "worksheet", "problem set", "exercise"]
    };
    
    // Check each intention pattern
    for (const [intent, keywords] of Object.entries(intentionPatterns)) {
      const matches = keywords.filter(keyword => transcript.includes(keyword));
      if (matches.length > 0) {
        const intentConfidence = Math.min(0.8, matches.length * 0.2);
        if (intentConfidence > confidence) {
          confidence = intentConfidence;
          intention = intent;
        }
      }
    }
    
    // Boost confidence if we have a strong workflow match
    if (workflowResult.confidence > 0.7) {
      confidence = Math.min(1.0, confidence + 0.2);
    }
    
    return {
      intention,
      confidence: Math.min(1.0, confidence)
    };
  }
}

// Pattern Intention Infarer
class PatternIntentionInferrer {
  infer(inputs, workflowResult) {
    let confidence = 0;
    let intention = "general_inquiry";
    
    const transcript = (inputs.voice.transcript || "").trim();
    
    // Check for question patterns
    if (transcript.endsWith("?") || 
        transcript.startsWith("what") || 
        transcript.startsWith("how") || 
        transcript.startsWith("why") || 
        transcript.startsWith("when") || 
        transcript.startsWith("where") || 
        transcript.startsWith("who")) {
      intention = "question";
      confidence = 0.7;
    }
    
    // Check for command patterns
    else if (transcript.startsWith("please") || 
             transcript.startsWith("could you") || 
             transcript.startsWith("would you") || 
             transcript.startsWith("can you") || 
             transcript.startsWith("do you")) {
      intention = "request";
      confidence = 0.6;
    }
    
    // Check for statement patterns
    else if (transcript.length > 10 && !transcript.endsWith("?")) {
      intention = "statement";
      confidence = 0.5;
    }
    
    // Check for greeting patterns
    const greetings = ["hi", "hello", "hey", "good morning", "good afternoon", "good evening"];
    if (greetings.some(g => transcript.toLowerCase().startsWith(g))) {
      intention = "greeting";
      confidence = 0.8;
    }
    
    // Check for farewell patterns
    const farewells = ["bye", "goodbye", "see you", "talk later", "have a good"];
    if (farewells.some(f => transcript.toLowerCase().startsWith(f))) {
      intention = "farewell";
      confidence = 0.8;
    }
    
    return {
      intention,
      confidence: Math.min(1.0, confidence)
    };
  }
}

// Contextual Intention Infarer
class ContextualIntentionInferrer {
  infer(inputs, workflowResult) {
    let confidence = 0;
    let intention = "general_inquiry";
    
    // Use workflow as strong prior for intention
    const workflowToIntentionMap = {
      "study": "explanation_request",
      "conversation": "general_inquiry",
      "creation": "creation_request",
      "research": "information_request",
      "problem_solving": "problem_solving_request",
      "idle": "general_inquiry"
    };
    
    const workflowIntention = workflowToIntentionMap[workflowResult.workflow] || "general_inquiry";
    if (workflowResult.confidence > 0.5) {
      intention = workflowIntention;
      confidence = workflowResult.confidence * 0.8; // Slightly lower confidence than workflow alone
    }
    
    // Adjust based on recent interaction history
    const recentContext = inputs.system; // Would come from context history in real implementation
    if (recentContext && recentContext.interactionPattern) {
      // In a real implementation, we'd analyze patterns over time
      // For now, we'll just use a simple heuristic
      if (recentContext.interactionPattern === "follow_up_question") {
        if (intention === "general_inquiry") {
          intention = "follow_up_question";
          confidence = Math.min(1.0, confidence + 0.2);
        }
      }
    }
    
    return {
      intention,
      confidence: Math.min(1.0, confidence)
    };
  }
}

// Export for use in browser and Node.js
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    AuraLiveContextManager,
    StudyWorkflowDetector,
    ConversationWorkflowDetector,
    CreationWorkflowDetector,
    ResearchWorkflowDetector,
    ProblemSolvingWorkflowDetector,
    KeywordIntentionInferrer,
    PatternIntentionInferrer,
    ContextualIntentionInferrer
  };
} else {
  window.AuraLiveContextManager = AuraLiveContextManager;
  window.StudyWorkflowDetector = StudyWorkflowDetector;
  window.ConversationWorkflowDetector = ConversationWorkflowDetector;
  window.CreationWorkflowDetector = CreationWorkflowDetector;
  window.ResearchWorkflowDetector = ResearchWorkflowDetector;
  window.ProblemSolvingWorkflowDetector = ProblemSolvingWorkflowDetector;
  window.KeywordIntentionInferrer = KeywordIntentionInferrer;
  window.PatternIntentionInferrer = PatternIntentionInferrer;
  window.ContextualIntentionInferrer = ContextualIntentionInferrer;
}