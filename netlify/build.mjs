import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const baseDir = process.cwd();
const repoRoot = path.resolve(baseDir, "..");
const distDir = path.join(baseDir, "dist");
const auraUiDir = path.join(repoRoot, "gemini_clone_ui");
const auraDistDir = path.join(auraUiDir, "dist");

function cleanDir(target) {
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
}

cleanDir(distDir);

if (process.platform === "win32") {
  execFileSync("cmd.exe", ["/d", "/s", "/c", "npm run build"], {
    cwd: auraUiDir,
    stdio: "inherit",
  });
} else {
  execFileSync("npm", ["run", "build"], {
    cwd: auraUiDir,
    stdio: "inherit",
  });
}

fs.cpSync(auraDistDir, distDir, { recursive: true });

console.log("Netlify Aura UI bundle prepared at", distDir);
