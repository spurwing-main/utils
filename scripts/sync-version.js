#!/usr/bin/env node
// Sync VERSION export in loader.js and pinned CDN versions in READMEs with package.json version
// Intent: avoid manual drift between docs and code without adding a build step.

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function replaceInFile(filePath, replacers) {
  const abs = path.resolve(root, filePath);
  if (!fs.existsSync(abs)) return false; // Skip silently if file is absent
  let src = fs.readFileSync(abs, "utf8");
  let changed = false;
  for (const [regex, replacement] of replacers) {
    const next = src.replace(regex, replacement);
    if (next !== src) {
      changed = true;
      src = next;
    }
  }
  if (changed) fs.writeFileSync(abs, src);
  return changed;
}

function main() {
  const pkg = readJSON(path.join(root, "package.json"));
  const v = String(pkg.version || "").trim();
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(v)) {
    console.error("Invalid version in package.json:", v);
    process.exit(1);
  }

  // 1) Sync VERSION export in loader.js
  replaceInFile("loader.js", [[/(export const VERSION\s*=\s*')[^']*(')/g, `$1${v}$2`]]);

  // 2) Update pinned CDN references in README files
  const pkgName = "@tim-spw/utils";
  const cdnPattern = new RegExp(`(${pkgName.replace("/", "\\/")}@)([0-9]+\.[0-9]+\.[0-9]+)`, "g");
  const replacements = [[cdnPattern, `$1${v}`]];
  replaceInFile("README.md", replacements);
  replaceInFile("features/video/README.md", replacements);
}

main();
