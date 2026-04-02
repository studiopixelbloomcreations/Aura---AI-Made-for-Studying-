import fs from "node:fs";
import path from "node:path";

const baseDir = process.cwd();
const repoRoot = path.resolve(baseDir, "..");
const distDir = path.join(baseDir, "dist");

const rootFilesToCopy = [
  "account.js",
  "api.js",
  "app.html",
  "auth.js",
  "badges.js",
  "chat.js",
  "firebase_runtime_config.js",
  "gamification.js",
  "gamification_sync.js",
  "googleSync.js",
  "googlef11f1400b8d2bbab.html",
  "index.html",
  "index_v2.html",
  "landing.css",
  "landing.html",
  "landing.js",
  "login.css",
  "login.html",
  "login.js",
  "loginRedirect.js",
  "mic.js",
  "personal_intelligence_ui.js",
  "personalization_sync.js",
  "points.js",
  "profile.js",
  "progress.js",
  "puter_voice_catalog.js",
  "reset.js",
  "robots.txt",
  "script.js",
  "settings.js",
  "signup.html",
  "signup.js",
  "sitemap.xml",
  "styles.css",
  "timer.js",
  "upload.js",
  "vis_preview.html",
  "voice_multimodal_ui.js",
];

const rootDirsToCopy = [
  "ExamModeToggle",
  "public",
  "vis",
  "vis_identity_profiles",
];

function cleanDir(target) {
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
}

function copyFileRelative(relativePath) {
  const source = path.join(repoRoot, relativePath);
  if (!fs.existsSync(source)) return;
  const target = path.join(distDir, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function copyDirRelative(relativePath) {
  const source = path.join(repoRoot, relativePath);
  if (!fs.existsSync(source)) return;
  const target = path.join(distDir, relativePath);
  fs.cpSync(source, target, { recursive: true });
}

cleanDir(distDir);

for (const file of rootFilesToCopy) copyFileRelative(file);
for (const dir of rootDirsToCopy) copyDirRelative(dir);

console.log("Netlify frontend bundle prepared at", distDir);
