import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const baseDir = process.cwd();
const repoRoot = path.resolve(baseDir, "..");
const distDir = path.join(baseDir, "dist");
const geminiDir = path.join(repoRoot, "gemini_clone_ui");

// ── Step 1: Build the Gemini UI (React + Vite) ──────────────────────
console.log("Building Gemini UI...");
try {
  execSync("npm run build", { cwd: geminiDir, stdio: "inherit" });
  console.log("Gemini UI built successfully.");
} catch (err) {
  console.error("Gemini UI build failed:", err.message);
  process.exit(1);
}

// ── Step 2: Prepare dist directory ───────────────────────────────────
function cleanDir(target) {
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
}

cleanDir(distDir);

// ── Step 3: Copy Gemini UI build output ─────────────────────────────
const geminiDist = path.join(geminiDir, "dist");
if (!fs.existsSync(geminiDist)) {
  console.error("Gemini UI dist/ not found at", geminiDist);
  process.exit(1);
}

// Copy all Gemini dist files
fs.cpSync(geminiDist, distDir, { recursive: true });

// Rename index.html → app.html (Gemini UI becomes the main app page)
const geminiIndex = path.join(distDir, "index.html");
const appHtml = path.join(distDir, "app.html");
if (fs.existsSync(geminiIndex)) {
  fs.renameSync(geminiIndex, appHtml);
  console.log("Renamed Gemini index.html → app.html");
}

// ── Step 4: Copy legacy files still needed ───────────────────────────
const legacyFiles = [
  // Firebase config (loaded dynamically by React app)
  "firebase_config.js",
  // Landing page
  "index.html",
  "landing.css",
  "landing.js",
  // Login / Signup / Auth pages
  "login.html",
  "login.js",
  "loginRedirect.js",
  "signup.html",
  "signup.js",
  "auth.js",
  // API helper (used by legacy auth pages)
  "api.js",
  // SEO & meta
  "robots.txt",
  "sitemap.xml",
  "googlef11f1400b8d2bbab.html",
  // Redirects
  "_redirects",
];

function copyFile(relativePath) {
  const source = path.join(repoRoot, relativePath);
  if (!fs.existsSync(source)) {
    console.warn("  (skip) not found:", relativePath);
    return;
  }
  const target = path.join(distDir, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

console.log("Copying legacy support files...");
for (const file of legacyFiles) copyFile(file);

// ── Step 5: Copy legacy directories still needed ────────────────────
const legacyDirs = [
  "public",   // harmony_system.js, vis/, vais/, etc.
];

function copyDir(relativePath) {
  const source = path.join(repoRoot, relativePath);
  if (!fs.existsSync(source)) {
    console.warn("  (skip dir) not found:", relativePath);
    return;
  }
  const target = path.join(distDir, relativePath);
  fs.cpSync(source, target, { recursive: true });
}

console.log("Copying legacy support directories...");
for (const dir of legacyDirs) copyDir(dir);

console.log("\n✅  Netlify frontend bundle ready at", distDir);
console.log("   app.html = New Gemini UI (React)");
console.log("   index.html = Landing page");
