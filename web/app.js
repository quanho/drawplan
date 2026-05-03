// app.js — DrawPlan UI
// Render qua server API nếu có, fallback sang local engine nếu mở file trực tiếp

const input      = document.getElementById("input");
const runBtn     = document.getElementById("run");
const svgWrap    = document.getElementById("svg-wrap");
const errorBox   = document.getElementById("error-box");
const copySvg    = document.getElementById("copy-svg");
const exportHtml = document.getElementById("export-html");
const measureBtn = document.getElementById("measure");
const unitHint   = document.getElementById("unit-hint");
const zoomIn   = document.getElementById("zoom-in");
const zoomOut  = document.getElementById("zoom-out");
const zoomReset= document.getElementById("zoom-reset");
const rotateCcw= document.getElementById("rotate-ccw");

// ── Measure tool state ────────────────────────────────────────────────────────
let measureMode = false;
let measurePt1  = null;   // { mmX, mmY, svgX, svgY }
let currentDoc  = null;   // last successfully parsed & rendered doc

function getDocMapping(doc) {
  const CW = 1400, CH = 900, PAD = 80;
  const unit = doc.unit ?? "mm";
  const toMm = v => unit === "m" ? v * 1000 : unit === "cm" ? v * 10 : v;
  const plotW = toMm(doc.plot.width);
  const plotH = toMm(doc.plot.depth);
  const extra = (doc.dimensionOffset ?? 0) * 2 + PAD;
  const scale = Math.min((CW - extra * 2) / plotW, (CH - extra * 2) / plotH);
  const offX  = (CW - plotW * scale) / 2;
  const offY  = (CH - plotH * scale) / 2;
  return { scale, offX, offY, unit };
}

function screenToDoc(clientX, clientY) {
  const svg = getSvg();
  if (!svg || !viewBox || !currentDoc) return null;
  const rect = svg.getBoundingClientRect();
  const svgX = viewBox.x + (clientX - rect.left) / rect.width  * viewBox.w;
  const svgY = viewBox.y + (clientY - rect.top)  / rect.height * viewBox.h;
  const m    = getDocMapping(currentDoc);
  return { mmX: (svgX - m.offX) / m.scale, mmY: (svgY - m.offY) / m.scale, svgX, svgY };
}

function fmtDist(mm, unit) {
  if (unit === "m")  return `${(mm / 1000).toFixed(3)} m`;
  if (unit === "cm") return `${(mm / 10).toFixed(1)} cm`;
  return `${Math.round(mm)} mm`;
}

function getMeasureOverlay() {
  const svg = getSvg(); if (!svg) return null;
  let g = svg.querySelector("#measure-overlay");
  if (!g) {
    g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("id", "measure-overlay");
    g.style.pointerEvents = "none";
    svg.appendChild(g);
  }
  return g;
}

function clearMeasureOverlay() {
  const g = getSvg()?.querySelector("#measure-overlay");
  if (g) g.innerHTML = "";
  measurePt1 = null;
}

function drawMeasureOverlay(pt1, pt2, label) {
  const g = getMeasureOverlay(); if (!g) return;
  const dot = (cx, cy) =>
    `<circle cx="${cx}" cy="${cy}" r="5" fill="#f59e0b" stroke="#fff" stroke-width="1.5"/>`;
  const midX = (pt1.svgX + pt2.svgX) / 2;
  const midY = (pt1.svgY + pt2.svgY) / 2;
  const labelW = label ? Math.max(60, label.length * 7 + 16) : 0;
  g.innerHTML =
    dot(pt1.svgX, pt1.svgY) +
    `<line x1="${pt1.svgX}" y1="${pt1.svgY}" x2="${pt2.svgX}" y2="${pt2.svgY}"
       stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="6,3"/>` +
    dot(pt2.svgX, pt2.svgY) +
    (label
      ? `<rect x="${midX - labelW/2}" y="${midY - 13}" width="${labelW}" height="18"
           rx="3" fill="rgba(0,0,0,.72)"/>
         <text x="${midX}" y="${midY + 2}" text-anchor="middle" font-size="11"
           fill="#fff" font-family="monospace">${label}</text>`
      : "");
}

function setMeasureMode(on) {
  measureMode = on;
  if (on) {
    measureBtn.classList.add("active");
    svgWrap.style.cursor = "crosshair";
    errorBox.textContent = "📏 Click điểm thứ nhất để bắt đầu đo...";
  } else {
    measureBtn.classList.remove("active");
    svgWrap.style.cursor = "";
    errorBox.textContent = "";
    clearMeasureOverlay();
  }
}

measureBtn.addEventListener("click", () => setMeasureMode(!measureMode));

document.addEventListener("keydown", e => {
  if (e.key === "Escape" && measureMode) setMeasureMode(false);
});

// ── Load example từ web/example.json ──────────────────────────────────────────
window.addEventListener("load", async () => {
  try {
    const resp = await fetch("/example.json");
    input.value = await resp.text();
  } catch {
    input.value = "{\n  \"version\": \"drawplan/v1\",\n  \"unit\": \"mm\",\n  \"plot\": {\n    \"width\": 21940,\n    \"depth\": 59360,\n    \"label\": \"Mảnh đất\"\n  },\n  \"items\": [\n    {\n      \"id\": \"house\",\n      \"label\": \"Nhà\",\n      \"labelRotation\": 0,\n      \"showDimensions\": {\n        \"top\": { \"labelPos\": \"inner\" },\n        \"right\": { \"labelPos\": \"inner\" }\n      },\n      \"type\": \"rect\",\n      \"x\": 8710,\n      \"y\": 31465,\n      \"width\": 8730,\n      \"height\": 21000,\n      \"style\": \"solid\",\n      \"strokeWidth\": 150\n    },\n    {\n      \"id\": \"main-entrance\",\n      \"label\": \"\",\n      \"type\": \"rect\",\n      \"x\": 17440,\n      \"y\": 31465,\n      \"width\": 4500,\n      \"height\": 21000,\n      \"style\": \"dashed\",\n      \"showDimensions\": {\n        \"right\": false\n      }\n    },\n    {\n      \"id\": \"parking\",\n      \"label\": \"Sân đỗ xe\",\n      \"type\": \"rect\",\n      \"x\": 8710,\n      \"y\": 52465,\n      \"width\": 8730,\n      \"height\": 6895,\n      \"style\": \"dashed\"\n    },\n    {\n      \"id\": \"terrace\",\n      \"label\": \"Ban công\",\n      \"type\": \"rect\",\n      \"x\": 8680,\n      \"y\": 27665,\n      \"width\": 5030,\n      \"height\": 3800,\n      \"style\": \"dashed\"\n    },\n    {\n      \"id\": \"west-garden\",\n      \"label\": \"Sân phía tây\",\n      \"type\": \"rect\",\n      \"x\": 5510,\n      \"y\": 27665,\n      \"width\": 3200,\n      \"height\": 16680,\n      \"style\": \"dashed\",\n      \"showDimensions\": {\n        \"left\": { \"labelPos\": \"outer\" }\n      }\n    },\n    {\n      \"id\": \"garage\",\n      \"label\": \"Nhà kho\",\n      \"type\": \"rect\",\n      \"x\": 13415,\n      \"y\": 1125,\n      \"width\": 7400,\n      \"height\": 21947,\n      \"style\": \"solid\",\n      \"showDimensions\": {\n        \"top\": false,\n        \"bottom\": { \"labelPos\": \"outer\" },\n        \"right\": { \"labelPos\": \"inner\" }\n      }\n    },\n    {\n      \"id\": \"doors\",\n      \"label\": \"Cửa chính\",\n      \"type\": \"rect\",\n      \"x\": 17400,\n      \"y\": 39988,\n      \"width\": 2500,\n      \"height\": 2700,\n      \"style\": \"dashed\",\n      \"stroke\": \"none\",\n      \"showDimensions\": {\n        \"top\": false\n      }\n    },\n    {\n      \"id\": \"garage-path\",\n      \"label\": \"Lối nhà kho\",\n      \"type\": \"rect\",\n      \"x\": 11415,\n      \"y\": 1125,\n      \"width\": 2000,\n      \"height\": 21947,\n      \"style\": \"dashed\",\n      \"showDimensions\": {\n        \"top\": false,\n        \"right\": false,\n        \"left\": { \"labelPos\": \"outer\" },\n        \"bottom\": { \"labelPos\": \"outer\" }\n      }\n    },\n    {\n      \"id\": \"measure-main-door-pos\",\n      \"type\": \"measure\",\n      \"from\": [17400, 42688],\n      \"to\": [17400, 52465],\n      \"label\": \"9777\",\n      \"labelPos\": \"outer\"\n    },\n    {\n      \"id\": \"measure-house-store\",\n      \"type\": \"measure\",\n      \"from\": [21940, 23023],\n      \"to\": [21940, 31465],\n      \"label\": \"8442\",\n      \"labelPos\": \"outer\"\n    },\n    {\n      \"id\": \"measure-garage-right\",\n      \"type\": \"measure\",\n      \"from\": [21940, 23023],\n      \"to\": [20815, 23023],\n      \"label\": \"1125\",\n      \"labelPos\": \"inner\"\n    },\n    {\n      \"id\": \"measure-garage-top\",\n      \"type\": \"measure\",\n      \"from\": [16815, 0],\n      \"to\": [16815, 1125],\n      \"label\": \"1125\"\n    }\n  ]\n}";
  }
  runBtn.click();
});
// ── Pan/zoom state ─────────────────────────────────────────────────────────────
let viewBox = null; // { x, y, w, h }
let lastSvgW = 1400, lastSvgH = 900;

function getSvg() { return svgWrap.querySelector("svg"); }

function applyViewBox(vb) {
  const svg = getSvg();
  if (!svg) return;
  svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  viewBox = vb;
}

function resetView() {
  applyViewBox({ x: 0, y: 0, w: lastSvgW, h: lastSvgH });
}

// Wheel zoom
svgWrap.addEventListener("wheel", (e) => {
  e.preventDefault();
  const svg = getSvg();
  if (!svg || !viewBox) return;

  const rect = svg.getBoundingClientRect();
  const mx   = (e.clientX - rect.left) / rect.width;
  const my   = (e.clientY - rect.top)  / rect.height;

  const factor = e.deltaY > 0 ? 1.1 : 0.9;
  const nw = viewBox.w * factor;
  const nh = viewBox.h * factor;
  const nx = viewBox.x + (viewBox.w - nw) * mx;
  const ny = viewBox.y + (viewBox.h - nh) * my;

  applyViewBox({ x: nx, y: ny, w: nw, h: nh });
}, { passive: false });

// Pan drag
let panStart = null;
svgWrap.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  if (measureMode) return;   // measure mode handles clicks separately
  panStart = { clientX: e.clientX, clientY: e.clientY, vb: { ...viewBox } };
  svgWrap.setPointerCapture(e.pointerId);
});
svgWrap.addEventListener("pointermove", (e) => {
  // rubber-band line in measure mode
  if (measureMode && measurePt1) {
    const pt = screenToDoc(e.clientX, e.clientY);
    if (pt) drawMeasureOverlay(measurePt1, pt, null);
    return;
  }
  if (!panStart || !viewBox) return;
  const svg = getSvg();
  if (!svg) return;
  const rect = svg.getBoundingClientRect();
  const dx = -(e.clientX - panStart.clientX) / rect.width  * panStart.vb.w;
  const dy = -(e.clientY - panStart.clientY) / rect.height * panStart.vb.h;
  applyViewBox({ ...panStart.vb, x: panStart.vb.x + dx, y: panStart.vb.y + dy });
});
svgWrap.addEventListener("pointerup", () => { panStart = null; });

// Measure clicks (on the svg-wrap, not the SVG element, so coordinates are consistent)
svgWrap.addEventListener("click", (e) => {
  if (!measureMode) return;
  const pt = screenToDoc(e.clientX, e.clientY);
  if (!pt) return;
  if (!measurePt1) {
    clearMeasureOverlay();
    measurePt1 = pt;
    drawMeasureOverlay(pt, pt, null);
    errorBox.textContent = "📏 Click điểm thứ hai...";
  } else {
    const dx   = pt.mmX - measurePt1.mmX;
    const dy   = pt.mmY - measurePt1.mmY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const unit = getDocMapping(currentDoc).unit;
    const label = fmtDist(dist, unit);
    drawMeasureOverlay(measurePt1, pt, label);
    errorBox.textContent = `📏 Khoảng cách: ${label} — Click tiếp để đo lại, Esc để thoát`;
    measurePt1 = null;
  }
});

// Zoom buttons
zoomIn.addEventListener("click", () => {
  if (!viewBox) return;
  const cx = viewBox.x + viewBox.w / 2, cy = viewBox.y + viewBox.h / 2;
  const nw = viewBox.w * 0.8, nh = viewBox.h * 0.8;
  applyViewBox({ x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh });
});
zoomOut.addEventListener("click", () => {
  if (!viewBox) return;
  const cx = viewBox.x + viewBox.w / 2, cy = viewBox.y + viewBox.h / 2;
  const nw = viewBox.w * 1.25, nh = viewBox.h * 1.25;
  applyViewBox({ x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh });
});
zoomReset.addEventListener("click", resetView);

// ── Rotate CCW ────────────────────────────────────────────────────────────────
let svgRotation = 0;

function wrapSvgContent() {
  const svg = getSvg();
  if (!svg) return;
  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  g.id = "rotation-group";
  while (svg.firstChild) g.appendChild(svg.firstChild);
  svg.appendChild(g);
}

function applySvgRotation() {
  const svg = getSvg();
  if (!svg) return;
  const g = svg.querySelector("#rotation-group");
  if (!g) return;
  const cx = lastSvgW / 2, cy = lastSvgH / 2;
  g.setAttribute("transform", `rotate(${svgRotation}, ${cx}, ${cy})`);
}

rotateCcw.addEventListener("click", () => {
  svgRotation = (svgRotation - 90 + 360) % 360;
  applySvgRotation();
});

// ── Render ─────────────────────────────────────────────────────────────────────
function renderLocal(doc) {
  // Dùng compile/renderSvg từ engine-core.js (nếu có) hoặc engine.js
  if (typeof compile === "undefined" || typeof renderSvg === "undefined") {
    throw new Error("Engine chưa được load — mở qua server hoặc dùng index.html standalone");
  }
  const scene = compile(doc);
  return renderSvg(scene);
}

runBtn.addEventListener("click", async () => {
  errorBox.textContent = "";

  let doc;
  try {
    doc = JSON.parse(input.value);
  } catch (e) {
    errorBox.textContent = "Lỗi JSON: " + e.message;
    return;
  }

  let svgStr;
  try {
    const resp = await fetch("/api/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(doc),
    });
    const data = await resp.json();
    if (data.error) { errorBox.textContent = "Lỗi: " + data.error; return; }
    svgStr = data.svg;
  } catch {
    // Không có server — render local
    try { svgStr = renderLocal(doc); } catch (err) { errorBox.textContent = String(err); return; }
  }

  svgWrap.innerHTML = svgStr;
  currentDoc = doc;
  svgRotation = 0;
  wrapSvgContent();
  clearMeasureOverlay();

  const svg = getSvg();
  if (svg) {
    lastSvgW = parseFloat(svg.getAttribute("width")  ?? "1400");
    lastSvgH = parseFloat(svg.getAttribute("height") ?? "900");
    viewBox   = { x: 0, y: 0, w: lastSvgW, h: lastSvgH };
  }
  unitHint.textContent = `Đơn vị: ${doc.unit ?? "mm"}`;
});

// Copy SVG
copySvg.addEventListener("click", () => {
  const svg = getSvg();
  if (!svg) return;
  navigator.clipboard.writeText(svg.outerHTML).then(() => {
    copySvg.textContent = "Đã copy!";
    copySvg.classList.add("copied");
    setTimeout(() => {
      copySvg.textContent = copySvg.dataset.label;
      copySvg.classList.remove("copied");
    }, 1500);
  });
});

// Export HTML
exportHtml.addEventListener("click", () => {
  const svg = getSvg();
  if (!svg) return;

  // Lấy tên từ label của plot trong JSON (nếu có)
  let title = "DrawPlan";
  try {
    const doc = JSON.parse(input.value);
    if (doc?.plot?.label) title = doc.plot.label;
  } catch {}

  const svgStr = svg.outerHTML;
  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    body { margin: 0; background: #fff; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    svg { max-width: 100%; height: auto; display: block; cursor: grab; }
    svg:active { cursor: grabbing; }
  </style>
</head>
<body>
${svgStr}
<script>
  // Pan & zoom cho file xuất ra
  const svg = document.querySelector("svg");
  let vb = { x: 0, y: 0, w: parseFloat(svg.getAttribute("width") || 1400), h: parseFloat(svg.getAttribute("height") || 900) };
  function applyVb() { svg.setAttribute("viewBox", vb.x+" "+vb.y+" "+vb.w+" "+vb.h); }
  svg.addEventListener("wheel", e => {
    e.preventDefault();
    const r = svg.getBoundingClientRect();
    const mx = (e.clientX - r.left) / r.width, my = (e.clientY - r.top) / r.height;
    const f = e.deltaY > 0 ? 1.1 : 0.9;
    const nw = vb.w * f, nh = vb.h * f;
    vb = { x: vb.x + (vb.w - nw) * mx, y: vb.y + (vb.h - nh) * my, w: nw, h: nh };
    applyVb();
  }, { passive: false });
  let pan = null;
  svg.addEventListener("pointerdown", e => { pan = { cx: e.clientX, cy: e.clientY, vb: {...vb} }; svg.setPointerCapture(e.pointerId); });
  svg.addEventListener("pointermove", e => {
    if (!pan) return;
    const r = svg.getBoundingClientRect();
    vb = { ...pan.vb, x: pan.vb.x - (e.clientX - pan.cx) / r.width * pan.vb.w, y: pan.vb.y - (e.clientY - pan.cy) / r.height * pan.vb.h };
    applyVb();
  });
  svg.addEventListener("pointerup", () => pan = null);
<\/script>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = title.replace(/\s+/g, "_") + ".html";
  a.click();
  URL.revokeObjectURL(url);

  exportHtml.textContent = "Đã xuất!";
  exportHtml.classList.add("done");
  setTimeout(() => {
    exportHtml.textContent = exportHtml.dataset.label;
    exportHtml.classList.remove("done");
  }, 1500);
});

// ── Panel toggle ────────────────────────────────────────────────────────────
const ICON_PANEL_SHOW = `<svg width="20" height="16" viewBox="0 0 20 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="1" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M7 1V15" stroke="currentColor" stroke-width="1.5"/><path d="M11 5.5L14 8L11 10.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_PANEL_HIDE = `<svg width="20" height="16" viewBox="0 0 20 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="1" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/><rect x="1" y="1" width="7" height="14" rx="2" fill="currentColor" opacity="0.45"/><path d="M7 1V15" stroke="currentColor" stroke-width="1.5"/><path d="M14 5.5L11 8L14 10.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// Đồng bộ icon với trạng thái CSS (mobile ẩn panel mặc định)
(function syncPanelIcon() {
  const main = document.querySelector("main");
  const btn  = document.getElementById("panel-toggle");
  const hidden = window.getComputedStyle(main).gridTemplateColumns.startsWith("0");
  if (hidden) {
    main.classList.add("panel-hidden");
    btn.innerHTML = ICON_PANEL_SHOW;
  }
})();

document.getElementById("panel-toggle").addEventListener("click", () => {
  const main = document.querySelector("main");
  const btn  = document.getElementById("panel-toggle");
  const hidden = main.classList.toggle("panel-hidden");
  btn.innerHTML = hidden ? ICON_PANEL_SHOW : ICON_PANEL_HIDE;
});

// Auto-render on load — handled by the load listener above
