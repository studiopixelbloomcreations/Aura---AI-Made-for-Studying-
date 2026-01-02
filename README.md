# Grade 9 AI Tutor — Local Test & Deployment

This repository contains the frontend and a minimal FastAPI backend used by the Grade 9 AI Tutor UI.

## Exam Mode (new)

Frontend usage:
- Toggle **Exam Mode** from the header switch (default is OFF).
- When ON, the app shows the Exam Mode placeholder UI with 3 setup questions.
- When OFF, the normal TutorAI chat UI returns.

Automatic trigger (from the chat input):
- If you type phrases like `Prepare me for my exam` or `Enable exam mode`, the app automatically switches Exam Mode ON.

Setup questions shown in Exam Mode:
- Are you preparing for a real exam or just practicing?
- Which term test are you getting ready for? (First, Second, Third)
- Which subject are you planning to study? (Maths, Science, English, etc.)

Backend endpoints (FastAPI) planned for wiring later:
- POST /exam-mode/start
- POST /exam-mode/fetch-papers
- POST /exam-mode/ask-question
- POST /exam-mode/evaluate

Folder structure additions:
- exam_mode/
  - exam_routes.py (API routes)
  - exam_service.py (in-memory session + logic)
  - exam_models.py (Pydantic models)
  - exam_utils.py (scraper mock, helpers)
- ExamModeToggle/
  - ExamModeContext.js (stores Exam Mode on/off)
  - ExamModeToggle.js (header switch component)
  - ExamModeUI.js (Exam Mode placeholder UI)

Notes:
- Scraper is mocked (papers.wiki.com) in exam_utils.scrape_papers; replace with real scraper if available.
- State is kept in-memory per process; for production, back with Redis or a DB and auth tokens.
- Gamification: points, streak, badges, readiness % are returned in responses to support UI.

This README describes how to run the interface locally for testing (including a demo/mock mode) and how to share it with family/teachers for evaluation without changing any AI model code.

## ElevenLabs Text-to-Speech (TTS)

The app can read AI answers aloud using ElevenLabs.

Configuration:
- Set Netlify environment variable `ELEVENLABS_API_KEY`.
- The frontend calls `/tts/elevenlabs`, which is proxied to a Netlify Function (`netlify/functions/elevenlabs_tts.js`) so the API key is not exposed in the browser.

Local testing:
- If you are running locally via Netlify CLI, add `ELEVENLABS_API_KEY` in your local env (or `.env` supported by your tooling).
- If you are not using Netlify Functions locally, TTS will fall back to browser `speechSynthesis`.

## Quick local smoke test (frontend + mock backend)

1. Create a Python virtual environment and install dependencies:

```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

2. Start the backend locally:

```powershell
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

3. Serve the frontend (open `index.html` via Live Server in VS Code or a simple HTTP server):

```powershell
# from repo root
python -m http.server 5500
# open http://127.0.0.1:5500 in browser
```

This repository is now prepared for production deployments. Ensure you configure `GROQ_API_KEY` and `ALLOWED_ORIGINS` in your server environment before going public.

## Using the real backend

- To use the real AI endpoints, set environment variable `GROQ_API_KEY` (or your provider key) in the backend environment and ensure `ALLOWED_ORIGINS` contains the domain(s) you will serve the frontend from.

Example `ALLOWED_ORIGINS` (comma-separated):

```
ALLOWED_ORIGINS=http://127.0.0.1:5500,https://your-production-domain.com
```

## Deploying frontend for testers

- You can use Netlify, Vercel, GitHub Pages, Firebase Hosting, or any static host. `netlify.toml` and `render.yaml` are already present for guidance.

## Notes on privacy & auth

- The login and signup pages use Firebase (compat) — make sure you add the host domains to Firebase Authentication authorized domains.
- For privacy when testing with users, consider enabling Firebase Authentication and protecting the `ask` endpoint behind authentication if you plan to expose the real AI.

## Next steps I can help with
- Add a hosted demo (Netlify) and wire a serverless proxy if you need to hide API keys.
- Add Playwright end-to-end tests to exercise UI and dropdown keyboard navigation automatically.
- Tune visual tints and generate design tokens for production.

If you'd like, I will now (pick one):
- Deploy the static site to Netlify with a public preview link.
- Add a UI switch to permanently route all testers to the mock endpoint (already present as Demo toggle).
- Add Playwright tests and run them locally."# The-Tutor-AI-Agent-Created-For-Students" 
"# The-Tutor-AI-Agent-Created-For-Students" 
"# Tutor---AI-Made-for-Studying-" 
"# Tutor---AI-Made-for-Studying-" 
"# Tutor---AI-Made-for-Studying-" 
"# Tutor---AI-Made-for-Studying-" 
