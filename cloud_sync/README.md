# Cloud Repo Monitor

Runs independently from the desktop app and continuously syncs local repo changes from GitHub.

## Start

```bash
npm run cloud-sync:watch
```

Fast polling mode (500ms):

```bash
npm run cloud-sync:watch:fast
```

## Environment variables

- `TUTOR_REPO_ROOT` (optional): absolute repo path; default is current project root.
- `CLOUD_SYNC_BRANCH` (optional): branch to track; default `main`.
- `CLOUD_SYNC_POLL_MS` (optional): polling interval in ms; default `1000`.
- `CLOUD_SYNC_STARTUP_PULL` (optional): `true/false`; default `true`.
- `CLOUD_SYNC_VERBOSE` (optional): `true/false`; default `true`.

## Notes

- Pull strategy: `git pull --rebase --autostash origin <branch>`.
- If there are hard merge conflicts, sync will log failure until conflicts are resolved.

## Windows startup (optional)

Install auto-start task:

```powershell
powershell -ExecutionPolicy Bypass -File .\cloud_sync\install_windows_startup.ps1
```

Remove auto-start task:

```powershell
powershell -ExecutionPolicy Bypass -File .\cloud_sync\uninstall_windows_startup.ps1
```

If Task Scheduler is blocked by policy, use Startup-folder mode (no admin):

```powershell
powershell -ExecutionPolicy Bypass -File .\cloud_sync\install_user_startup.ps1
```

Remove Startup-folder mode:

```powershell
powershell -ExecutionPolicy Bypass -File .\cloud_sync\uninstall_user_startup.ps1
```
