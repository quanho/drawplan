#!/usr/bin/env node
/**
 * build-pages.mjs
 * Assembles index.html (GitHub Pages standalone) from:
 *   web/index.html  — HTML + CSS shell
 *   web/engine.js   — compiler + renderer + UI logic (no server needed)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const html       = readFileSync(join(root, "web", "index.html"), "utf8");
const engineCore = readFileSync(join(root, "web", "engine-core.js"), "utf8");
const app        = readFileSync(join(root, "web", "app.js"), "utf8");

// Strip the inline engine-core block (between first <script> and </script>)
// then replace <script src="app.js"> with combined engine-core + app
const stripped = html.replace(/<script>\n[\s\S]*?<\/script>\n/, '');
const output = stripped.replace(
  '<script src="app.js"></script>',
  `<script>\n${engineCore}\n${app}\n</script>`
);

writeFileSync(join(root, "index.html"), output, "utf8");
console.log("✓ index.html built for GitHub Pages");
