const fs = require('fs');
const path = require('path');

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest) {
  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else if (entry.isFile()) copyFile(s, d);
  }
}

function main() {
  const root = process.cwd();
  const pkgDir = path.join(root, 'node_modules', '@vladmandic', 'human');
  const srcJs = path.join(pkgDir, 'dist', 'human.js');
  const srcModels = path.join(pkgDir, 'models');
  const outDirs = [
    path.join(root, 'vis_human'),
    path.join(root, 'public', 'vis_human'),
    path.join(root, 'dist', 'vis_human'),
  ];

  if (!fs.existsSync(pkgDir)) {
    console.log('[copy_human_assets] human package not installed');
    process.exit(0);
  }
  for (const outDir of outDirs) {
    const outJs = path.join(outDir, 'human.js');
    const outModels = path.join(outDir, 'models');
    if (fs.existsSync(srcJs)) copyFile(srcJs, outJs);
    if (fs.existsSync(srcModels)) copyDir(srcModels, outModels);
  }
  console.log('[copy_human_assets] done');
}

main();
