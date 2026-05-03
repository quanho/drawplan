#!/usr/bin/env node
/**
 * build-pages.mjs
 * Assembles index.html (GitHub Pages standalone) from:
 *   web/index.html  — HTML + CSS shell
 *   web/engine.js   — compiler + renderer + UI logic (no server needed)
 */
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const html       = readFileSync(join(root, "web", "index.html"), "utf8");
const engineCore = readFileSync(join(root, "web", "engine-core.js"), "utf8");
const app        = readFileSync(join(root, "web", "app.js"), "utf8");

// Replace <script src="engine-core.js"> and <script src="app.js"> with single inlined block
const output = html
  .replace('<script src="engine-core.js"></script>\n', '')
  .replace(
    '<script src="app.js"></script>',
    `<script>\n${engineCore}\n${app}\n</script>`
  );

writeFileSync(join(root, "index.html"), output, "utf8");
console.log("✓ index.html built for GitHub Pages");

copyFileSync(join(root, "web", "example.json"), join(root, "example.json"));
console.log("✓ example.json copied to root");
