# Windows Test Build Guide (Beginner)

This guide turns your AI project into a desktop Windows test app using Electron.

## 1) Install requirements

1. Install Node.js LTS from `https://nodejs.org`.
2. Open PowerShell in your project folder.
3. Install dependencies:

```powershell
npm install
```

## 2) Run the desktop test app

From project root:

```powershell
npm run desktop
```

By default, it loads local `index.html` from this repository.

If you want to load your deployed site instead:

```powershell
$env:APP_START_URL="https://tutoraiv3.netlify.app/"; npm run desktop
```

## 3) What desktop mode adds

Desktop mode exposes secure APIs to the web UI through `window.DesktopAssistant`:

- creator-approved system actions
- creator-approved evolution proposal flow
- local audit logging

All actions still require explicit approvals.

## 4) Supported assistant actions now

- Open File Explorer (`open_file_explorer`)
- Open Maps link (`directions_home`)
- Connect Spotify link (`connect_spotify`)
- Open Spotify Liked Songs (`play_spotify_liked`)

When requested, desktop app shows a creator approval dialog.

## 5) Evolution manager (creator gate)

The desktop runtime tracks interaction deltas.  
Every threshold (default: 100 lines equivalent), it creates a pending evolution proposal.

You can inspect proposals through the preload API:

- `DesktopAssistant.listEvolution()`
- `DesktopAssistant.approveEvolution(proposalId)`

This is a controlled scaffold for your test workflow (proposal -> approval -> external patch pipeline).

## 6) Runtime storage location

Desktop runtime store is saved in Electron user data folder:

- `desktop_runtime_store.json`

It contains:

- line counter
- proposal list
- audit log

## 7) Security model used

- Browser renderer is sandboxed
- `contextIsolation: true`
- No `nodeIntegration` in renderer
- Native actions only through allowlisted IPC handlers
- Creator confirmation dialog before action execution

## 8) Next recommended steps

1. Add a dedicated Creator panel in UI to view/approve proposals.
2. Add cryptographic signing for action payloads.
3. Add action scopes (filesystem/apps/network/media) with toggles.
4. Add automated test runner before marking proposals "ready to apply".

## 9) Live self-writing pipeline (local/cloud repo)

Desktop runtime now exposes a live code evolution pipeline through `window.DesktopAssistant`:

- `getEvolutionCapabilities()`
- `startEvolution({ file_path, instruction, deploy_local, deploy_cloud })`
- `listEvolution()`
- `getEvolution(proposalId)`
- `deployEvolution({ proposal_id, deploy_local, deploy_cloud })`
- `onEvolutionEvent((evt) => { ... })`

Stages run in order: `generate -> inspect -> security_check -> deploy`.

Example from renderer DevTools:

```js
const stop = window.DesktopAssistant.onEvolutionEvent(console.log);
const res = await window.DesktopAssistant.startEvolution({
  file_path: "netlify/functions/personal_intelligence_evolution/generated/sample_plugin.js",
  instruction: "Create a safe weather helper plugin with clear input validation.",
  deploy_local: true,
  deploy_cloud: false,
});
console.log(res);
```

Set `deploy_cloud: true` to run `git add`, `git commit`, and `git push` after local deploy.

## 10) Cloud auto-evolution from live Netlify traffic

Your live Netlify PI endpoint can now auto-generate code from user data and deploy directly to GitHub.

Set these Netlify environment variables:

- `PI_CLOUD_AUTO_EVOLVE=true`
- `GEMINI_API_KEY=...`
- `PI_PROPOSAL_BRAIN_MODEL=gemini-3-pro-preview` (optional; defaults already set)
- `GITHUB_TOKEN=...` (repo write scope)
- `GITHUB_REPO_OWNER=your_owner`
- `GITHUB_REPO_NAME=your_repo`
- `GITHUB_REPO_BRANCH=main` (or your branch)

When users provide personal data signals (for example profile/location updates), the function runs:

`generate -> inspect -> security_check -> deploy`

and returns `cloud_evolution` metadata in `/personal_intelligence_ask` response, including commit URL when successful.

## 11) Watch cloud commits appear locally (with your own eyes)

From desktop DevTools:

```js
const stopEvt = window.DesktopAssistant.onEvolutionEvent(console.log);
await window.DesktopAssistant.startCloudRepoSync(7000); // pull every 7s
```

Manual one-shot sync:

```js
await window.DesktopAssistant.syncCloudRepoNow();
```

Stop sync:

```js
await window.DesktopAssistant.stopCloudRepoSync();
```
