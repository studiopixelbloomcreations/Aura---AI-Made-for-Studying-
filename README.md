# Aevra AI — Personal Intelligence Platform for Students

> A voice-first, personalized AI study companion.

## What is Aevra AI?

Aevra AI is a study workspace for students, centered on personal identity, adaptive tutoring, exam practice, memory, and progress. It combines a vanilla HTML/CSS/JS frontend, Netlify Functions, a FastAPI backend, Supabase persistence, Firebase Authentication, and multi-model AI routing.

## Features

- Voice identity (VAIS) — Aevra recognizes users by their enrolled voice signature
- Personalized AI — adapts tone, verbosity, humor, subjects, and teaching style
- Exam Mode — Grade 9 past-paper style practice questions with explanations
- Memory Graph — stores studied concepts, sessions, questions, answers, and weak areas
- Gamification — points, streaks, badges, levels, and progress panels
- Multi-model AI — Groq primary with OpenRouter, Puter.js, and other fallbacks through Harmony
- Offline shell — service worker cache-first strategy for static assets

## Tech Stack

- Frontend: Vanilla HTML, CSS, JavaScript
- Hosting: Netlify
- Functions: Netlify Functions on Node.js
- Backend: FastAPI on Python
- Database: Supabase PostgreSQL with Row Level Security
- Auth: Firebase Authentication
- Primary AI: Groq `llama-3.1-70b-versatile`
- Voice: Web Audio API, Web Speech API, MFCC-style embeddings, ElevenLabs TTS
- Testing: Playwright visual test and Node hardening checks

## Environment Variables

- `GROQ_API_KEY` — Groq LLM API key (required)
- `ELEVENLABS_API_KEY` — ElevenLabs TTS API key (required for voice)
- `SUPABASE_URL` — Supabase project URL (required)
- `SUPABASE_ANON_KEY` — Supabase anonymous key (required)
- `SUPABASE_SERVICE_KEY` — Supabase service role key (required for admin ops)
- `ALLOWED_ORIGINS` — Comma-separated CORS origins
- `OPENROUTER_API_KEY` — OpenRouter key for Agent Harmony fallback
- `PUTER_API_KEY` — Puter.js key if needed
- `FASTAPI_BASE_URL` — Render/FastAPI base URL used by Netlify proxies

## Development Setup

1. Install dependencies with `npm install`.
2. Install Python dependencies with `pip install -r requirements.txt`.
3. Copy `.env.example` to your local environment manager and fill required keys.
4. Run the static app with `python -m http.server 5500`.
5. Run the FastAPI backend with `uvicorn main:app --reload`.

## Tests

- Visual Intelligence tests: `node tests/vis_playwright_test.js`
- Hardening checks: `npm run test:hardening`

## Deployment

Netlify builds from `netlify/build.mjs` and publishes `netlify/dist`. Netlify Functions live in `netlify/functions`. The FastAPI backend can be deployed on Render using `render.yaml`; set the same environment variables in Render and Netlify.

## Architecture

VAIS manages microphone capture, wake phrase detection, browser-side MFCC-style voice embeddings, Supabase-stored signatures, confidence scoring, onboarding, and secure session storage.

Harmony classifies each user message, selects the best model path, and falls back across configured providers when a model is unavailable or rate limited.

The Memory Graph stores concepts, sessions, questions, answers, and relationships in Supabase JSONB metadata so Aevra can summarize weak areas for future prompts.
