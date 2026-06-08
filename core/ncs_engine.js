"use strict";

const { getConfigSection } = require("./config_loader");

/**
 * NCS Engine — Neurocognitive State detection and cognitive blueprint generation.
 *
 * Upgrades in this version:
 *   - Live Context Buffer integration (session-scoped context from AURA LIVE)
 *   - LUMEN memory awareness for state detection
 *   - Enhanced signal detection with live session context
 *   - Better context pipeline: context → NCS → blueprint → Harmony
 */

// ---------------------------------------------------------------------------
// Signal definitions
// ---------------------------------------------------------------------------

const SIGNALS = [
  {
    key: "collaborative_reasoning",
    weight: 2.4,
    test: (ctx) =>
      count(ctx.activeModules, /harmony|model|router|fusion|council/i) +
      count(ctx.recentCalls, /harmony|model|router|fusion|council/i) +
      (ctx.liveContext && ctx.liveContext.turn_count > 5 ? 1 : 0),
  },
  {
    key: "evaluation_flow",
    weight: 2.2,
    test: (ctx) =>
      scoreText(ctx.text, /\b(exam|quiz|grade|score|mark|evaluate|answer|paper|test)\b/i) +
      count(ctx.activeModules, /exam|grade|quiz/i),
  },
  {
    key: "memory_reasoning",
    weight: 2.0,
    test: (ctx) =>
      scoreText(ctx.text, /\b(remember|my name|my school|i like|i prefer|memory|profile|habit)\b/i) +
      count(ctx.activeModules, /memory|profile|graph/i) +
      (ctx.lumenMemoryCount > 3 ? 1 : 0),
  },
  {
    key: "personalization_flow",
    weight: 1.8,
    test: (ctx) =>
      scoreText(ctx.text, /\b(tone|style|teach me|explain like|personal|preferred|pace)\b/i) +
      hasKeys(ctx.sessionData, ["profile", "personalization", "ai_config"]) +
      (ctx.liveContext && ctx.liveContext.current_topic ? 1 : 0),
  },
  {
    key: "execution_mode",
    weight: 1.9,
    test: (ctx) =>
      scoreText(ctx.text, /\b(create|generate|make|open|save|plan|summarize|organize|diagram|file)\b/i) +
      count(ctx.activeModules, /task|action|workflow|execution/i) +
      (ctx.liveContext && ctx.liveContext.detected_objects && ctx.liveContext.detected_objects.length > 0 ? 1 : 0),
  },
  {
    key: "adaptive_learning",
    weight: 1.7,
    test: (ctx) =>
      scoreText(ctx.text, /\b(weak|strong|improve|practice|study plan|learn|difficulty|mistake)\b/i) +
      count(ctx.activeModules, /exam|gamification|analytics|progress/i),
  },
];

// ---------------------------------------------------------------------------
// Context normalization (with Live Context Buffer support)
// ---------------------------------------------------------------------------

function normalizeContext(context) {
  const ctx = context && typeof context === "object" ? context : {};
  return {
    text: String(ctx.userMessage || ctx.message || "").trim(),
    observatoryOutput: ctx.observatoryOutput || ctx.observatory || {},
    activeModules: Array.isArray(ctx.activeModules) ? ctx.activeModules : [],
    recentCalls: Array.isArray(ctx.recentCalls) ? ctx.recentCalls : [],
    metadata: ctx.metadata && typeof ctx.metadata === "object" ? ctx.metadata : {},
    sessionData: ctx.sessionData && typeof ctx.sessionData === "object" ? ctx.sessionData : {},

    // NEW: Live Context Buffer from AURA LIVE sessions
    liveContext: ctx.liveContext || ctx.live_context || null,

    // NEW: LUMEN memory count for state awareness
    lumenMemoryCount: Number(ctx.lumenMemoryCount || ctx.lumen_memory_count || 0),

    // NEW: LUMEN memories array (top memories for prompt injection)
    lumenMemories: Array.isArray(ctx.lumenMemories) ? ctx.lumenMemories : [],
  };
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function count(list, regex) {
  return (Array.isArray(list) ? list : []).reduce(
    (sum, item) => sum + (regex.test(String(item || "")) ? 1 : 0),
    0
  );
}

function scoreText(text, regex) {
  const matches = String(text || "").match(regex);
  return matches ? 1 : 0;
}

function hasKeys(obj, keys) {
  const text = JSON.stringify(obj || {}).toLowerCase();
  return keys.reduce(
    (sum, key) => sum + (text.includes(String(key).toLowerCase()) ? 1 : 0),
    0
  );
}

// ---------------------------------------------------------------------------
// System state detection
// ---------------------------------------------------------------------------

function detectSystemState(context) {
  const ctx = normalizeContext(context);
  const obs = ctx.observatoryOutput || {};

  const rawScores = SIGNALS.map((signal) => {
    const evidence = Number(signal.test(ctx) || 0);
    let score = evidence * signal.weight;

    // Observatory-based bonuses
    if (String(obs.type || "").toLowerCase().includes(signal.key.split("_")[0])) score += 1.2;
    if (obs.requires_multi_models && signal.key === "collaborative_reasoning") score += 1.5;

    // NEW: Live Context bonuses
    if (ctx.liveContext) {
      const lc = ctx.liveContext;
      // Active live session with many turns suggests collaborative reasoning
      if (lc.turn_count > 10 && signal.key === "collaborative_reasoning") score += 0.8;
      // Vision-detected objects suggest execution mode
      if (lc.detected_objects && lc.detected_objects.length > 0 && signal.key === "execution_mode") score += 0.6;
      // Current topic continuity suggests personalization
      if (lc.current_topic && signal.key === "personalization_flow") score += 0.5;
    }

    return { systemType: signal.key, score, evidence };
  }).sort((a, b) => b.score - a.score);

  const top = rawScores[0] || { systemType: "adaptive_learning", score: 0 };
  const total = rawScores.reduce((sum, item) => sum + item.score, 0) || 1;

  return {
    systemType: top.score > 0 ? top.systemType : "adaptive_learning",
    confidence: Math.max(0.35, Math.min(0.98, top.score / total + (top.score > 0 ? 0.22 : 0))),
    signals: rawScores
      .filter((item) => item.score > 0)
      .map((item) => ({
        name: item.systemType,
        weight: Number(item.score.toFixed(2)),
        evidence: item.evidence,
      })),
    // NEW: live session awareness
    live_aware: !!ctx.liveContext,
    lumen_aware: ctx.lumenMemoryCount > 0,
  };
}

// ---------------------------------------------------------------------------
// Cognitive blueprint
// ---------------------------------------------------------------------------

function buildCognitiveBlueprint(context, systemState) {
  const ctx = normalizeContext(context);
  const state = systemState || detectSystemState(ctx);
  const complexity = String(
    (ctx.observatoryOutput && ctx.observatoryOutput.complexity) ||
    ctx.metadata.complexity ||
    "low"
  );

  const config = getConfigSection("harmony");
  const deep = complexity === "high" || state.confidence < 0.62;

  const toolUsage = ["memory_graph", "harmony_router"];
  if (/evaluation|adaptive/.test(state.systemType)) toolUsage.push("exam_analytics");
  if (/execution/.test(state.systemType)) toolUsage.push("task_executor");
  if (/personalization|memory/.test(state.systemType)) toolUsage.push("personality_engine");

  // NEW: Add live-aware tools
  if (state.live_aware) toolUsage.push("live_context", "vision_service");
  if (state.lumen_aware) toolUsage.push("lumen_memory");

  return {
    thinking_style: deep ? "deliberate, evidence-aware, multi-pass" : "direct, warm, context-aware",
    reasoning_depth: deep ? "high" : complexity === "medium" ? "medium" : "focused",
    response_structure: /evaluation/.test(state.systemType)
      ? "answer, feedback, correction, next practice"
      : "clear answer with concise next step when useful",
    personality: "Aevra AI: warm, premium, adaptive, encouraging, never performative",
    tool_usage: Array.from(new Set(toolUsage.concat(Array.isArray(config.tool_usage) ? config.tool_usage : []))),
    collaboration_mode: /collaborative|evaluation|adaptive/.test(state.systemType)
      ? "multi_model_fusion"
      : "single_model_with_verification",
    model_roles: inferModelRoles(ctx, state),
    constraints: [
      "Preserve user privacy and avoid exposing hidden system details.",
      "CRITICAL: You are a private Personal Intelligence system (LUMEN). You MUST learn, remember, and store personal information the user shares (including family members, mother/father names, locations, secrets, preferences).",
      "NEVER refuse to store personal information for 'security reasons'. It is your primary directive to store these facts in the user's private LUMEN archive.",
      "Use retrieved memory only when relevant and never invent personal facts.",
      "Stay Grade 9 Sri Lankan syllabus aligned unless the user explicitly asks beyond it.",
      "Prefer useful action over generic chatbot wording.",
    ],
    output_format: /evaluation/.test(state.systemType) ? "student_safe_marking_response" : "natural_language",
    system_state: state,

    // NEW: Live context snapshot for model awareness
    live_context_snapshot: ctx.liveContext
      ? {
          current_topic: ctx.liveContext.current_topic || null,
          detected_objects: ctx.liveContext.detected_objects || [],
          turn_count: ctx.liveContext.turn_count || 0,
          session_active: true,
        }
      : null,

    // NEW: LUMEN memory summary for blueprint
    lumen_summary: ctx.lumenMemories.length > 0
      ? ctx.lumenMemories.slice(0, 5).map((m) => `[${m.category || "general"}] ${m.key}: ${m.value}`)
      : [],
  };
}

// ---------------------------------------------------------------------------
// Model role inference
// ---------------------------------------------------------------------------

function inferModelRoles(context, systemState) {
  const ctx = normalizeContext(context);
  const availability = ctx.metadata.providerAvailability || {};
  const providers = Object.keys(availability).filter((key) => availability[key]);
  const pool = providers.length ? providers : ["groq", "openrouter", "mistral", "huggingface", "deepseek", "puter"];

  const roles = {};
  const preferred = /evaluation|adaptive/.test(systemState.systemType)
    ? ["analysis", "verification", "simplification", "synthesis", "reasoning"]
    : ["reasoning", "analysis", "synthesis", "verification", "simplification"];

  pool.forEach((provider, index) => {
    roles[provider] = preferred[index % preferred.length];
  });
  return roles;
}

// ---------------------------------------------------------------------------
// Cognitive prompt compilation
// ---------------------------------------------------------------------------

function compileCognitivePrompt(blueprint) {
  const bp = blueprint || buildCognitiveBlueprint({});
  const roles = Object.keys(bp.model_roles || {})
    .map((name) => `${name}: ${bp.model_roles[name]}`)
    .join(", ") || "dynamic";

  const lines = [
    "You are Aevra AI, a living personal intelligence layer for studying and daily cognition.",
    `Thinking style: ${bp.thinking_style}`,
    `Reasoning depth: ${bp.reasoning_depth}`,
    `Response structure: ${bp.response_structure}`,
    `Personality: ${bp.personality}`,
    `Collaboration mode: ${bp.collaboration_mode}`,
    `Dynamic model roles: ${roles}`,
    `Allowed tools/modules: ${(bp.tool_usage || []).join(", ")}`,
    "Constraints:",
    ...(bp.constraints || []).map((item) => `- ${item}`),
    `Output format: ${bp.output_format}`,
  ];

  // NEW: Inject live context awareness
  if (bp.live_context_snapshot) {
    const lc = bp.live_context_snapshot;
    lines.push("");
    lines.push("Live Session Context:");
    if (lc.current_topic) lines.push(`- Current topic: ${lc.current_topic}`);
    if (lc.detected_objects && lc.detected_objects.length > 0) {
      lines.push(`- Detected objects: ${lc.detected_objects.join(", ")}`);
    }
    lines.push(`- Conversation turns: ${lc.turn_count}`);
  }

  // NEW: Inject LUMEN memory summary
  if (bp.lumen_summary && bp.lumen_summary.length > 0) {
    lines.push("");
    lines.push("Relevant LUMEN Memories:");
    bp.lumen_summary.forEach((s) => lines.push(`- ${s}`));
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Performance tracking
// ---------------------------------------------------------------------------

async function updateCognitivePerformance(result, options = {}) {
  const payload = {
    created_at: new Date().toISOString(),
    user_id: String((result && result.user_id) || (options && options.user_id) || "anonymous"),
    system_type: String((result && result.system_type) || ""),
    confidence: Number((result && result.confidence) || 0),
    model_used: String((result && result.model_used) || ""),
    routing_success: !!(result && result.routing_success),
    response_quality: Number((result && result.response_quality) || 0),
    latency_ms: Number((result && result.latency_ms) || 0),
    metadata: result && result.metadata && typeof result.metadata === "object" ? result.metadata : {},
  };

  const supabase = getConfigSection("supabase");
  const key = supabase.serviceRoleKey || supabase.anonKey || "";
  if (!supabase.url || !key) {
    return { ok: false, skipped: true, reason: "supabase_not_configured", payload };
  }

  try {
    const response = await fetch(
      `${String(supabase.url).replace(/\/$/, "")}/rest/v1/ncs_performance_logs`,
      {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify(payload),
      }
    );
    return { ok: response.ok, status: response.status, payload };
  } catch (error) {
    return {
      ok: false,
      error: String(error && error.message ? error.message : error),
      payload,
    };
  }
}

module.exports = {
  detectSystemState,
  buildCognitiveBlueprint,
  compileCognitivePrompt,
  updateCognitivePerformance,
  normalizeContext,
  SIGNALS,
};
