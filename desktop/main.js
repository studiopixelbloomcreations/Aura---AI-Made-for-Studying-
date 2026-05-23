const { app, BrowserWindow, ipcMain, dialog, shell, session } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { exec } = require("child_process");
const { autoUpdater } = require("electron-updater");
const { LiveEvolutionManager } = require("./live_evolution_manager");
const { CloudRepoMirror } = require("./cloud_repo_mirror");

const DEFAULT_START_URL = "https://tutorv1.netlify.app/";

let mainWindow = null;
let updateNoticeShown = false;
let liveEvolution = null;
let cloudMirror = null;

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.commandLine.appendSwitch("enable-speech-dispatcher");

function getStorePath() {
  return path.join(app.getPath("userData"), "desktop_runtime_store.json");
}

function loadStore() {
  const p = getStorePath();
  try {
    if (!fs.existsSync(p)) {
      return {
        audit: [],
      };
    }
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch (e) {
    return {
      audit: [],
    };
  }
}

function saveStore(store) {
  const p = getStorePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(store, null, 2), "utf-8");
}

function pushAudit(store, item) {
  const row = Object.assign({ at: new Date().toISOString() }, item || {});
  store.audit = Array.isArray(store.audit) ? store.audit : [];
  store.audit.push(row);
  if (store.audit.length > 1000) store.audit = store.audit.slice(-1000);
}

function getStartTarget() {
  const envUrl = String(process.env.APP_START_URL || "").trim();
  if (envUrl) return { type: "url", value: envUrl };
  return { type: "url", value: DEFAULT_START_URL };
}

function resolveRepoRoot() {
  const candidates = [];
  const envRoot = String(process.env.TUTOR_REPO_ROOT || "").trim();
  if (envRoot) candidates.push(envRoot);

  // Common local dev locations.
  candidates.push(path.resolve(process.cwd()));
  candidates.push(path.join(os.homedir(), "grade9_ai"));
  candidates.push("c:\\Users\\thenu\\grade9_ai");

  // Packaged app fallback (often read-only/asar, least preferred).
  candidates.push(path.resolve(__dirname, ".."));

  for (const c of candidates) {
    try {
      const root = path.resolve(c);
      const hasGit = fs.existsSync(path.join(root, ".git"));
      const hasNetlifyFns = fs.existsSync(path.join(root, "netlify", "functions"));
      if (hasGit && hasNetlifyFns) return root;
    } catch (e) {}
  }

  return path.resolve(__dirname, "..");
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1120,
    minHeight: 760,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: true,
      backgroundThrottling: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const target = String(url || "").trim();
    if (!target) return { action: "deny" };

    // Keep auth/provider popups inside desktop app instead of launching external browser.
    const isHttp = /^https?:\/\//i.test(target);
    const isTrusted =
      /accounts\.google\.com/i.test(target) ||
      /appleid\.apple\.com/i.test(target) ||
      /github\.com\/login/i.test(target) ||
      /auth/i.test(target) ||
      /puter\.com/i.test(target) ||
      /tutorv1\.netlify\.app/i.test(target) ||
      /g9-tutor\.firebaseapp\.com/i.test(target);

    if (isHttp && isTrusted) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          width: 520,
          height: 760,
          minWidth: 420,
          minHeight: 620,
          autoHideMenuBar: true,
          parent: mainWindow,
          modal: false,
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            spellcheck: true,
          },
        },
      };
    }

    // For unknown external links, keep prior safe behavior.
    try { shell.openExternal(target); } catch (e) {}
    return { action: "deny" };
  });

  mainWindow.webContents.on("render-process-gone", (_e, details) => {
    dialog.showErrorBox(
      "Renderer crashed",
      `The app renderer crashed (${details && details.reason ? details.reason : "unknown"}). It will reload.`
    );
    try { mainWindow.reload(); } catch (e) {}
  });

  mainWindow.webContents.on("unresponsive", () => {
    dialog.showMessageBox(mainWindow, {
      type: "warning",
      buttons: ["Wait", "Reload"],
      defaultId: 0,
      cancelId: 0,
      title: "App not responding",
      message: "Aura AI desktop is not responding.",
      detail: "Choose Reload if it stays frozen for more than a few seconds.",
      noLink: true,
    }).then((r) => {
      if (r.response === 1) {
        try { mainWindow.reload(); } catch (e) {}
      }
    });
  });

  const target = getStartTarget();
  Promise.resolve()
    .then(() => mainWindow.webContents.session.clearCache().catch(() => {}))
    .then(() => {
      if (target.type === "file") return mainWindow.loadFile(target.value);
      return mainWindow.loadURL(target.value);
    })
    .catch(() => {
      if (target.type === "file") mainWindow.loadFile(target.value).catch(() => {});
      else mainWindow.loadURL(target.value).catch(() => {});
    });
}

function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    if (mainWindow && !updateNoticeShown) {
      mainWindow.webContents.send("desktop:update-status", { state: "checking" });
    }
  });

  autoUpdater.on("update-available", (info) => {
    if (mainWindow) {
      mainWindow.webContents.send("desktop:update-status", {
        state: "available",
        version: info && info.version ? String(info.version) : "",
      });
    }
  });

  autoUpdater.on("update-not-available", () => {
    if (mainWindow) {
      mainWindow.webContents.send("desktop:update-status", { state: "not-available" });
    }
  });

  autoUpdater.on("error", (err) => {
    if (mainWindow) {
      mainWindow.webContents.send("desktop:update-status", {
        state: "error",
        message: String((err && err.message) || err || "unknown"),
      });
    }
  });

  autoUpdater.on("update-downloaded", async (info) => {
    const v = info && info.version ? String(info.version) : "new";
    const approved = await promptCreatorApproval(
      "Update downloaded",
      `Version ${v} is ready.\nInstall now and restart app?`
    );
    if (approved) {
      autoUpdater.quitAndInstall();
    }
  });
}

function promptCreatorApproval(title, detail) {
  const autoApprove = String(process.env.DESKTOP_REQUIRE_APPROVAL || "false").trim().toLowerCase() !== "true";
  if (autoApprove) {
    return Promise.resolve(true);
  }
  return dialog
    .showMessageBox(mainWindow, {
      type: "question",
      buttons: ["Allow", "Deny"],
      defaultId: 0,
      cancelId: 1,
      title,
      message: title,
      detail: String(detail || ""),
      noLink: true,
    })
    .then((r) => r.response === 0);
}

function executeAllowedAction(action) {
  return new Promise((resolve) => {
    if (!action || !action.type) return resolve({ ok: false, error: "Invalid action" });

    if (action.type === "open_file_explorer") {
      return exec("explorer.exe", (err) => {
        resolve(err ? { ok: false, error: err.message } : { ok: true });
      });
    }

    if (action.type === "directions_home" && action.maps_url) {
      return shell.openExternal(String(action.maps_url)).then(() => resolve({ ok: true })).catch((e) => resolve({ ok: false, error: e.message }));
    }

    if (action.type === "connect_spotify") {
      const u = action.oauth_url || "https://open.spotify.com/";
      return shell.openExternal(String(u)).then(() => resolve({ ok: true })).catch((e) => resolve({ ok: false, error: e.message }));
    }

    if (action.type === "play_spotify_liked") {
      const u = action.spotify_url || "https://open.spotify.com/collection/tracks";
      return shell.openExternal(String(u)).then(() => resolve({ ok: true })).catch((e) => resolve({ ok: false, error: e.message }));
    }

    resolve({ ok: false, error: `Unsupported action: ${action.type}` });
  });
}

ipcMain.handle("assistant:get_capabilities", async () => {
  return {
    ok: true,
    desktop: true,
    can_open_explorer: true,
    can_open_urls: true,
    creator_approval_required: true,
  };
});

ipcMain.handle("assistant:execute_action", async (_event, action) => {
  const store = loadStore();
  const label = action && action.type ? String(action.type) : "unknown_action";
  const approved = await promptCreatorApproval(
    `Creator approval required: ${label}`,
    `Requested desktop action:\n${JSON.stringify(action || {}, null, 2)}`
  );
  if (!approved) {
    pushAudit(store, { kind: "action_denied", action: label, payload: action || {} });
    saveStore(store);
    return { ok: false, denied: true, error: "Creator denied action" };
  }

  const result = await executeAllowedAction(action || {});
  pushAudit(store, { kind: "action_executed", action: label, payload: action || {}, result });
  saveStore(store);
  return result;
});

ipcMain.handle("assistant:evolution_capabilities", async () => {
  const repoRoot = resolveRepoRoot();
  return {
    ok: true,
    live_code_write: true,
    stages: ["generate", "inspect", "security_check", "deploy"],
    supports_local_repo_deploy: true,
    supports_cloud_repo_push: true,
    default_model: String(process.env.PI_LIVE_MODEL || "gemini-3-pro-preview"),
    repo_root: repoRoot,
  };
});

ipcMain.handle("assistant:evolution_start", async (_event, payload) => {
  if (!liveEvolution) return { ok: false, error: "Live evolution manager not initialized" };
  return liveEvolution.startPipeline(payload || {});
});

ipcMain.handle("assistant:evolution_list", async () => {
  if (!liveEvolution) return { ok: false, error: "Live evolution manager not initialized" };
  return liveEvolution.listProposals();
});

ipcMain.handle("assistant:evolution_get", async (_event, proposalId) => {
  if (!liveEvolution) return { ok: false, error: "Live evolution manager not initialized" };
  return liveEvolution.getProposal(proposalId);
});

ipcMain.handle("assistant:evolution_deploy", async (_event, payload) => {
  if (!liveEvolution) return { ok: false, error: "Live evolution manager not initialized" };
  const req = payload && typeof payload === "object" ? payload : {};
  return liveEvolution.deployProposal(req.proposal_id, {
    deploy_local: req.deploy_local !== false,
    deploy_cloud: !!req.deploy_cloud,
  });
});

ipcMain.handle("assistant:cloud_sync_now", async () => {
  if (!cloudMirror) return { ok: false, error: "Cloud mirror not initialized" };
  return cloudMirror.syncNow();
});

ipcMain.handle("assistant:cloud_sync_start", async (_event, intervalMs) => {
  if (!cloudMirror) return { ok: false, error: "Cloud mirror not initialized" };
  return cloudMirror.start(intervalMs);
});

ipcMain.handle("assistant:cloud_sync_stop", async () => {
  if (!cloudMirror) return { ok: false, error: "Cloud mirror not initialized" };
  return cloudMirror.stop();
});

app.whenReady().then(() => {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = new Set([
      "media",
      "clipboard-read",
      "clipboard-sanitized-write",
      "notifications",
      "fullscreen",
      "pointerLock",
    ]);
    callback(allowed.has(permission));
  });
  ses.setPermissionCheckHandler((_webContents, permission) => {
    const allowed = new Set([
      "media",
      "clipboard-read",
      "clipboard-sanitized-write",
      "notifications",
      "fullscreen",
      "pointerLock",
    ]);
    return allowed.has(permission);
  });

  const repoRoot = resolveRepoRoot();

  liveEvolution = new LiveEvolutionManager({
    repoRoot: repoRoot,
    loadStore,
    saveStore,
    pushAudit,
    promptApproval: promptCreatorApproval,
    emitEvent: (event, payload) => {
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send("desktop:evolution-event", {
          event: String(event || ""),
          payload: payload || {},
          at: new Date().toISOString(),
        });
      }
    },
  });

  cloudMirror = new CloudRepoMirror({
    repoRoot: repoRoot,
    emitEvent: (event, payload) => {
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send("desktop:evolution-event", {
          event: String(event || ""),
          payload: payload || {},
          at: new Date().toISOString(),
        });
      }
    },
  });

  createWindow();
  setupAutoUpdater();
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  }, 6000);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
