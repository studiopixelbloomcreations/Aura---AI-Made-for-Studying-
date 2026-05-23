import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const baseDir = process.cwd();
const repoRoot = path.resolve(baseDir, "..");
const distDir = path.join(baseDir, "dist");
const auraUiDir = path.join(repoRoot, "gemini_clone_ui");
const auraDistDir = path.join(auraUiDir, "dist");

function runNpm(args) {
  if (process.platform === "win32") {
    execFileSync("cmd.exe", ["/d", "/s", "/c", `npm ${args.join(" ")}`], {
      cwd: auraUiDir,
      stdio: "inherit",
    });
    return;
  }

  execFileSync("npm", args, {
    cwd: auraUiDir,
    stdio: "inherit",
  });
}

function cleanDir(target) {
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
}

cleanDir(distDir);

if (!fs.existsSync(path.join(auraUiDir, "node_modules", ".bin", process.platform === "win32" ? "tsc.cmd" : "tsc"))) {
  runNpm(["ci", "--include=dev"]);
}

runNpm(["run", "build"]);

fs.cpSync(auraDistDir, distDir, { recursive: true });

console.log("Netlify Aura UI bundle prepared at", distDir);
