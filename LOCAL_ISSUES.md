# Aevra AI Local Issues Report

This file is local only and must not be committed.

## Fixed In This Pass

- Hosted Netlify frontend was routing API calls to removed Railway backend, causing CORS failures for `/progress`, `/gamification/get_badges`, `/personal-intelligence/ask`, and `/generate_title`.
- `api.js` now routes hosted Netlify traffic to same-origin Netlify functions.
- Removed stale Railway backend from stored API base handling.
- `showVisPersonalWelcomeCard()` crashed because `escapeHtml()` was missing.
- `/personal-intelligence/config` was incompatible with the Personal Intelligence UI and did not return the expected profile/unique ID shape.
- `core/env.js` did not read normal Netlify `process.env` values or `AEVRA_MASTER_CONFIG` provider sections.
- Puter banner logging is silenced with `puter.quiet = true`.
- Personal Intelligence camera-disabled log was removed because VAIS/auth identity is the expected runtime path.
- Harmony debug events now include NCS and memory metadata so retrieved memory is visible in the live panel.
- Added stateless Netlify compatibility endpoint for `/gamification/add_points`.
- Bumped script query strings in `app.html` so deployed browsers fetch the fixed `api.js` and `personal_intelligence_ui.js`.
- Fixed `20260503_aevra_production_schema.sql` foreign-key failure by backfilling `user_profiles.id`, making it non-null, and adding a real unique constraint usable by referenced tables.

## Working

- Frontend can call same-origin Netlify function routes without browser CORS.
- Progress compatibility route exists.
- Badge compatibility route exists.
- Add-points compatibility route exists.
- Personal Intelligence ask route exists.
- Personal Intelligence config route now creates and returns `unique_id` / `unique_identifier`.
- Voice identity route exists.
- Visual Playwright no-camera flow passes locally.
- Hardening syntax checks pass locally.
- `20260503_aevra_production_schema.sql` is compatible with older `user_profiles(user_id text primary key)` installs.

## Remaining / Needs Production Configuration

- Supabase persistence requires production `SUPABASE_URL` and service/anon keys.
- AI answer generation requires provider keys through `AEVRA_MASTER_CONFIG` or legacy env vars.
- Netlify deploy must include the latest commit and clear old immutable JS cache via the bumped query strings.
- Puter WebSocket noise may still occur if Puter is loaded and its external service refuses a socket, but the large Puter console banner is silenced.
