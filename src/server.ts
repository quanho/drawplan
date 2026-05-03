/**
 * server.ts — DrawPlan HTTP server
 * Port 3002
 *
 * Routes:
 *   GET  /           → web/index.html
 *   GET  /app.js     → web/app.js
 *   POST /api/render → PlanDocument JSON → { svg, error? }
 */

import http from "node:http";
import fs   from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { compile }   from "./compiler.js";
import { renderSvg } from "./renderer.js";
import type { PlanDocument } from "./schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR   = path.join(__dirname, "..", "web");
const PORT      = 3002;

function serveFile(res: http.ServerResponse, filePath: string, mime: string) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    res.writeHead(200, { "Content-Type": mime });
    res.end(content);
  } catch {
    res.writeHead(404); res.end("Not found");
  }
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => { data += chunk; });
    req.on("end",  () => resolve(data));
    req.on("error", reject);
  });
}

function jsonResponse(res: http.ServerResponse, status: number, body: unknown) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(json);
}

const server = http.createServer(async (req, res) => {
  const url = req.url ?? "/";

  // ── Static files ──────────────────────────────────────────────────────────
  if (req.method === "GET" && url === "/") {
    return serveFile(res, path.join(WEB_DIR, "index.html"), "text/html");
  }
  if (req.method === "GET" && url === "/app.js") {
    return serveFile(res, path.join(WEB_DIR, "app.js"), "text/javascript");
  }
  if (req.method === "GET" && url === "/example.json") {
    return serveFile(res, path.join(WEB_DIR, "example.json"), "application/json");
  }
  if (req.method === "GET" && url === "/help") {
    return serveFile(res, path.join(WEB_DIR, "help.html"), "text/html");
  }
  if (req.method === "GET" && url === "/geo-interact.js") {
    // reuse GeoRender's pan/zoom lib
    return serveFile(res, path.join(__dirname, "..", "..", "MCP", "GeoRender", "web", "geo-interact.js"), "text/javascript");
  }

  // ── API ───────────────────────────────────────────────────────────────────
  if (req.method === "OPTIONS") {
    res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type" });
    return res.end();
  }

  if (req.method === "POST" && url === "/api/render") {
    try {
      const raw  = await readBody(req);
      const doc  = JSON.parse(raw) as PlanDocument;
      const scene = compile(doc);
      const svg   = renderSvg(scene);
      return jsonResponse(res, 200, { svg });
    } catch (err) {
      return jsonResponse(res, 400, { error: String(err) });
    }
  }

  res.writeHead(404); res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`DrawPlan server running at http://localhost:${PORT}/`);
});
