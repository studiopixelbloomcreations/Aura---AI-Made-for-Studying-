# Aura AI - Local Test and Deployment

Aura AI is a glass UI study intelligence platform with Netlify functions, FastAPI support modules, Supabase-backed personalization, Harmony model routing, and the Neural Command System.

## Run Locally

```powershell
python -m http.server 5500
```

Open `http://127.0.0.1:5500/app.html`.

## Tests

```powershell
npm run test:hardening
node tests/vis_playwright_test.js
```

## Production Configuration

Use `AEVRA_MASTER_CONFIG` as the primary environment variable. It is a JSON object with sections for `firebase`, `supabase`, model providers, `security`, `features`, `limits`, `routing`, `harmony`, and `evolution`.

Legacy provider variables such as `GROQ_API_KEY`, `OPENROUTER_API_KEY`, and `SUPABASE_URL` are still read as fallbacks by `core/config_loader.js`.

## Core Systems

- NCS: `core/ncs_engine.js`
- Master config loader: `core/config_loader.js`
- Harmony router: `core/agent_harmony.js`
- Voice identity: `core/voice_identity.js` and `/voice/identity`
- Supabase production schema: `supabase/migrations/20260516_aevra_ncs_production_schema.sql`

## Deployment

Netlify uses `netlify.toml`, `netlify/build.mjs`, and `netlify/functions`. Render/FastAPI support remains available through `main.py` and `render.yaml`.
