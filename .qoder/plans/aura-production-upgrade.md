# AURA AI Production Transformation Plan

## Context

AURA AI (Aevra AI) is a personal intelligence platform with 12+ systems spanning multi-model AI orchestration, cognitive command, long-term memory, self-improvement, voice, vision, task execution, and more. A full codebase audit revealed that while the architecture is ambitious, most systems are partially operational — using sequential execution, in-memory-only state, text-hash "voice identity," stub vision, and a chat frontend that bypasses the entire intelligence pipeline by calling Puter.js directly. This plan transforms every system to production-ready while preserving the existing architecture.

**Decisions made:**
- **Primary backend:** Netlify Functions (Node.js) — where Harmony/NCS/Evolution run
- **Vision:** Multimodal LLM API (Gemini/GPT-4V)
- **UI:** Polish existing vanilla HTML/CSS/JS (no framework migration)
- **Priority:** Core intelligence first, then secondary systems

---

## PHASE 1: Foundation (Schema + Security + Chat Unification)

### Task 1.1 — Supabase Schema Migration
Create all new tables needed by subsequent phases.

**New file:** `supabase/migrations/20260608_aura_production_upgrade.sql`

Tables to create:
- `lumen_memories` — structured per-user memory (category, key, value, importance, relevance_embedding, access_count)
- `evolution_experiences` — persistent interaction records (user_id, module_id, request, response, success, latency_ms)
- `evolution_score_cards` — reinforcement scores per module (user_id, module_id, score, success/failure/correction counts)
- `evolution_proposals` — improvement proposals with evaluation/promotion results
- `evolution_module_versions` — deployed module version tracking
- `model_performance` — per-model success rate, latency, confidence by query_type
- `rate_limit_buckets` — Supabase-backed rate limiting (survives cold starts)
- `user_notes` — note/document storage for task execution

Plus RLS policies (service role full access) and data migration from existing `lumen_archives.facts` into `lumen_memories`.

### Task 1.2 — Security Foundation
**New files:**
- `core/auth_middleware.js` — Firebase Auth token verification via `firebase-admin` (sub-imports only). Wrapper `requireAuth(handler)` for Netlify Functions. Graceful degradation for local dev.
- `core/cors.js` — Centralized CORS using `ALLOWED_ORIGINS` env var. Replaces all `"access-control-allow-origin": "*"` patterns.

**Modify:**
- `netlify/functions/ask.js` — Add auth verification, use `corsHeaders(event)`, pass verified uid/email to NCS
- `netlify/functions/personal_intelligence_ask.js` — Add auth, CORS, use verified identity
- `netlify/functions/personal_intelligence_evolution/security_ops.js` — Replace in-memory `rateBuckets` Map with Supabase-backed store (L1 cache + DB source of truth)
- `netlify/functions/package.json` — Add `firebase-admin`

### Task 1.3 — Chat.js Unification
**Modify:** `chat.js`
- Replace direct `window.puter.ai.chat()` call with POST to `/.netlify/functions/ask`
- Include Firebase Auth token in headers
- Parse full response (answer, ncs, observatory, learned_facts)
- Keep Puter.js as offline/timeout fallback only
- This ensures ALL conversations benefit from Harmony, NCS, LUMEN, and Evolution

---

## PHASE 2: Core Intelligence Upgrade

### Task 2.1 — LUMEN Memory Upgrade
**Rewrite:** `core/lumen_engine.js`
- New API: `saveMemory()`, `getMemories(userId, options)`, `searchMemories(queryText, limit)`, `buildLumenPrompt(memorySnapshot, currentMessage)`
- Structured categories: identity, preferences, relationships, learning_patterns, projects, behavior
- Importance scoring with decay/boost
- Semantic relevance: pgvector cosine similarity if available, keyword ILIKE fallback
- Context-aware prompt: selects top-N relevant memories instead of dumping all facts
- Backward compat: keep `readLumenFile`/`writeLumenFile` as wrappers

**Modify:** `netlify/functions/personal_intelligence_ask.js`
- Replace regex-only `detectMemoryUpdates` with two-phase: fast regex + NCS Brain `memory_commands`
- Use new `saveMemory()` with proper categories
- Use context-aware `buildLumenPrompt()` for memory injection

**Extract:** `core/memory_detector.js` — move `detectMemoryUpdates`, `extractHomeAddress`, `sanitizeFactValue`, `sanitizeKnownFacts`, etc.

### Task 2.2 — Harmony Engine Upgrade
**Modify:** `core/model_adapters.js`
- Add `latency_ms` tracking via `Date.now()` delta around fetch
- Add `confidence_score` heuristic (hedging language detection, length adequacy, coherence)
- Return `{ answer, raw, error, latency_ms, confidence_score }`

**Modify:** `core/agent_harmony.js`
- **Parallel execution:** For `requires_multi_models`, fire top-3 models via `Promise.allSettled` with 8s timeout per model
- **Confidence scoring:** Each response scored by adapter + secondary lightweight ranking
- **Quality ranking:** Sort by `confidence_score × model_performance_score`
- **Model performance memory:** Query `model_performance` table to dynamically reorder model priority
- **Intelligent fallback:** On all-fail, try historically best model for this query_type
- New functions: `recordModelPerformance()`, `getModelPerformanceScores()`

### Task 2.3 — NCS Engine Upgrade
**Modify:** `core/ncs_engine.js`
- Add `conversationHistory`, `userProfile`, `lumenMemories`, `modelPerformance` to normalized context
- New signal sources: conversation history analysis, user profile signals, LUMEN memory context, model performance data
- Keep regex signals as baseline fallback
- Dynamic `tool_usage` from LUMEN memories instead of hardcoded list
- `reasoning_depth` from conversation history depth, not just complexity string

**Modify:** `core/ncs_brain.js`
- Add conversation history summary, learning profile, model performance to brain prompt
- Expand decision schema: `suggested_models` array, `memory_importance_scores`
- Add 5s timeout with fallback to rule-based NCS
- Log brain latency and success

**Modify:** `core/observatory.js`
- Accept optional `context` parameter with conversation history
- Multi-turn detection: maintain classification across follow-up questions

### Task 2.4 — Self-Improvement Engine Persistence
**New file:** `netlify/functions/personal_intelligence_evolution/persistent_state.js`
- Supabase-backed state store: `loadState(userId)`, `saveExperience()`, `updateScoreCard()`, `saveProposal()`, `reconstructRuntimeState()`
- L1 in-memory cache for function instance lifetime; load from DB on cold start

**Modify:** `netlify/functions/personal_intelligence_evolution/evolution_engine.js`
- Replace static `runtimeState` with `reconstructRuntimeState(userId)` at top of `processInteraction`
- Persist every mutation (experience, score card, proposal) to Supabase
- Change mode from `"netlify_simulated_runtime"` to `"persistent_supabase_runtime"`

**Modify:** `netlify/functions/personal_intelligence_evolution/memory_facade.js` — Accept pre-loaded state from Supabase

### Task 2.5 — Monolith Refactor
**Extract from** `netlify/functions/personal_intelligence_ask.js` (636 lines):
- `core/memory_detector.js` — memory extraction functions
- `core/action_detector.js` — `detectAction()` function
- Slim orchestrator (~150 lines) that wires all upgraded systems in clean pipeline:
  1. Parse + auth → 2. Load profile + LUMEN → 3. Observatory → 4. NCS → 5. Brain → 6. Harmony → 7. Memory update → 8. Evolution → 9. Response

---

## PHASE 3: Secondary Systems

### Task 3.1 — Voice System Upgrade
- **Replace text-hash embeddings** with real audio: New `netlify/functions/voice_embed.js` calling HuggingFace SpeechBrain ECAPA-TDNN model. Modify `core/voice_identity.js` to use real audio embeddings. New Supabase columns: `audio_embedding float8[]`, `embedding_model`.
- **Interruption handling:** New `public/vais/interruption_engine.js` — VAD via Web Audio AnalyserNode, stops TTS on user speech, 300ms debounce.
- **Streaming STT:** Modify `wakeword_engine.js` to expose interim/final results. Wire to chat input for real-time transcript display.
- **Enrollment upgrade:** Modify `onboarding_engine.js` to send each phrase blob individually for embedding extraction, compute mean embedding as voiceprint.

### Task 3.2 — Vision System
- **Camera access:** Rewrite `public/vis/vis_controller.js` (~150 lines) — getUserMedia, frame capture via canvas, configurable frame loop.
- **Multimodal LLM:** New `netlify/functions/vision_analyze.js` — sends base64 image to Gemini Flash / GPT-4V with mode-specific prompts (scene, OCR, describe, question).
- **Vision-augmented chat:** Add "Show me" button in chat UI. Capture frame, attach to message payload. Route through vision_analyze, inject description into NCS context.
- **Enable camera:** Change `VIS_CAMERA_DISABLED` from hardcoded `true` to user-controlled setting.

### Task 3.3 — Task Execution Engine
- **Note CRUD:** New `netlify/functions/notes_crud.js` (POST/GET/PUT/DELETE) + `user_notes` Supabase table.
- **Expanded actions:** Add to `detectAction()`: create_note, list_notes, generate_plan, generate_document, set_reminder.
- **Plan generation:** New `core/plan_generator.js` — generates structured study plans using LLM + LUMEN facts.
- **Reminders:** New `public/reminder_engine.js` — setTimeout + browser Notification API.

### Task 3.4 — Preview Engine
- **New file:** `public/preview_engine.js` (~200 lines) — modal overlay supporting markdown (marked + DOMPurify CDN), code (Prism.js CDN), diagrams (Mermaid.js CDN), JSON tree, HTML iframe sandbox.
- **Integration:** Detect code blocks and mermaid blocks in AI responses. Add Preview/Copy buttons. Render mermaid inline.
- **CDN deps:** Add script tags to `app.html` (lazy-loaded).

### Task 3.5 — Live Context Engine
- **New file:** `core/activity_detector.js` (~150 lines) — tracks currentPage, currentWorkflow, timeOnPage, typingPattern (WPM, pause freq), interactionFrequency. Exposes `getActivitySnapshot()`.
- **New file:** `core/workflow_tracker.js` (~100 lines) — rolling window of activity snapshots, workflow transition detection, session metrics.
- **NCS injection:** Send `activity_context` in request payload. Include in NCS Brain prompt for response style adjustment.

### Task 3.6 — Personality Engine Upgrade
- **Dynamic adaptation:** Modify `core/personalization_engine.js` — add `ingestInteraction()` with EMA-based adaptation (response length from message length, tone from formality, teaching style from "why" frequency, pacing from response time).
- **New file:** `core/personality_signals.js` (~80 lines) — `analyzeMessageTone()`, `analyzeResponsePattern()`.
- **Explicit feedback:** Add thumbs up/down buttons in UI. New `netlify/functions/feedback_collect.js`. Thumbs-down triggers stronger personality adjustment.
- **Evolution storage:** Write personality deltas to LUMEN `facts->personality_evolution` timeline.

---

## PHASE 4: UI Polish

### Task 4.1 — Design Token System
Add CSS custom properties to `styles.css` `:root`: spacing scale (4/8/16/24/32/48px), type scale, font family (Inter + system stack), radius scale. Systematic replacement of hardcoded values.

### Task 4.2 — Dark Mode
Add dark palette CSS variables with `prefers-color-scheme` media query + `[data-theme="dark"]` selector. New `public/theme_manager.js` for toggle + persistence. Audit all hardcoded colors in styles.css.

### Task 4.3 — Animations
Tab transitions (fade+slide), chat message entrance (slideIn), button hover states, loading skeletons. Respect `prefers-reduced-motion`.

### Task 4.4 — Responsive Polish
Add 480px breakpoint. Bottom nav at 900px. Safe area insets for iOS. Touch targets ≥ 44×44px. Swipe gesture for sidebar on mobile.

---

## Dependency Graph

```
Task 1.1 (Schema) ──┬──> Task 1.2 (Security) ──> Task 1.3 (Chat Unification)
                    ├──> Task 2.1 (LUMEN)
                    ├──> Task 2.2 (Harmony) ── needs 1.1 + 1.2
                    └──> Task 2.4 (Evolution)
                    
Task 2.1 + 2.2 ──> Task 2.3 (NCS) ── needs LUMEN + Harmony + perf data
All Phase 2 ──> Task 2.5 (Monolith Refactor) ── final integration

Phase 3 tasks: Can mostly parallelize after Phase 2
Phase 4 (UI): Can run in parallel with Phase 3
```

## Execution Order

1. **Task 1.1** → 2. **Task 1.2** → 3. **Tasks 1.3 + 2.1 + 2.4** (parallel) → 4. **Task 2.2** → 5. **Task 2.3** → 6. **Task 2.5** → 7. **Phase 3** (parallel tracks) → 8. **Phase 4** (parallel with Phase 3)

## Verification Plan

After each task:
- Send test messages through the full pipeline
- Verify Supabase tables contain expected data
- Check browser Network tab for correct API routing
- Verify no regressions in existing chat/exam/gamification flows
- Run `npm run test:hardening` (existing lint check)
- Run `node tests/vis_playwright_test.js` after UI changes

## Key Files Modified (Summary)

| File | Change Type |
|------|------------|
| `supabase/migrations/20260608_aura_production_upgrade.sql` | New |
| `core/auth_middleware.js` | New |
| `core/cors.js` | New |
| `core/lumen_engine.js` | Rewrite |
| `core/agent_harmony.js` | Major modify |
| `core/model_adapters.js` | Modify |
| `core/ncs_engine.js` | Major modify |
| `core/ncs_brain.js` | Modify |
| `core/observatory.js` | Modify |
| `core/personalization_engine.js` | Major modify |
| `core/memory_detector.js` | New (extracted) |
| `core/action_detector.js` | New (extracted) |
| `core/activity_detector.js` | New |
| `core/personality_signals.js` | New |
| `netlify/functions/ask.js` | Modify |
| `netlify/functions/personal_intelligence_ask.js` | Refactor |
| `netlify/functions/personal_intelligence_evolution/evolution_engine.js` | Major modify |
| `netlify/functions/personal_intelligence_evolution/persistent_state.js` | New |
| `netlify/functions/personal_intelligence_evolution/security_ops.js` | Modify |
| `netlify/functions/vision_analyze.js` | New |
| `netlify/functions/voice_embed.js` | New |
| `netlify/functions/notes_crud.js` | New |
| `netlify/functions/feedback_collect.js` | New |
| `chat.js` | Major modify |
| `public/vis/vis_controller.js` | Rewrite |
| `public/vais/interruption_engine.js` | New |
| `public/preview_engine.js` | New |
| `public/theme_manager.js` | New |
| `public/reminder_engine.js` | New |
| `styles.css` | Modify (tokens, dark mode, animations) |
| `app.html` | Modify (CDN scripts, preview root) |
| `personal_intelligence_ui.js` | Modify (feedback buttons, vision UI, animations) |
