/**
 * renderer.ts — RenderScene → SVG string
 *
 * SVG dùng hệ toạ độ screen (Y xuống).
 * Toạ độ mảnh đất bắt đầu từ (PADDING, PADDING).
 * Scale tự động để vừa canvas 1400×900.
 *
 * Dimension lines:
 *   - Nằm ngoài shape, offset 180px canvas.
 *   - Mũi tên 2 đầu, text nhãn giữa.
 *   - Hiển thị bằng đơn vị gốc (mm/cm/m).
 */

import type { RenderScene, RenderRect, RenderMeasure, RenderShape } from "./compiler.js";
import type { Unit } from "./schema.js";

const CANVAS_W = 1400;
const CANVAS_H = 900;
const PADDING  = 80;   // px quanh bìa SVG

// ── Label formatting ──────────────────────────────────────────────────────────

function fmtMm(mm: number, unit: Unit): string {
  switch (unit) {
    case "m":  return `${(mm / 1000).toLocaleString("en", { maximumFractionDigits: 3 })}`;
    case "cm": return `${(mm / 10).toLocaleString("en", { maximumFractionDigits: 1 })}`;
    case "mm": return `${Math.round(mm)}`;
  }
}

// ── SVG helpers ───────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Vẽ dimension line nằm ngang, phía trên hoặc phía dưới shape.
 * @param x1,x2  toạ độ canvas của hai đầu
 * @param y      toạ độ Y của đường dimension
 * @param label  văn bản hiển thị
 * @param above  đặt mũi tên ở phía trên hay dưới chữ
 */
function hDimLine(x1: number, x2: number, y: number, label: string, textBelow = false): string {
  if (Math.abs(x2 - x1) < 1) return "";
  const mid = (x1 + x2) / 2;
  const ty = textBelow ? y + 14 : y - 6;
  return `
  <g class="dim-line">
    <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="#888" stroke-width="1" marker-start="url(#arrow-start)" marker-end="url(#arrow-end)" />
    <line x1="${x1}" y1="${y - 8}" x2="${x1}" y2="${y + 8}" stroke="#888" stroke-width="1" />
    <line x1="${x2}" y1="${y - 8}" x2="${x2}" y2="${y + 8}" stroke="#888" stroke-width="1" />
    <text x="${mid}" y="${ty}" text-anchor="middle" font-size="11" fill="#555" font-family="monospace">${esc(label)}</text>
  </g>`;
}

/**
 * Vẽ dimension line thẳng đứng, bên trái hoặc phải shape.
 */
function vDimLine(y1: number, y2: number, x: number, label: string, textRight = false): string {
  if (Math.abs(y2 - y1) < 1) return "";
  const mid = (y1 + y2) / 2;
  const tx = textRight ? x + 14 : x - 6;
  return `
  <g class="dim-line">
    <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="#888" stroke-width="1" marker-start="url(#arrow-start)" marker-end="url(#arrow-end)" />
    <line x1="${x - 8}" y1="${y1}" x2="${x + 8}" y2="${y1}" stroke="#888" stroke-width="1" />
    <line x1="${x - 8}" y1="${y2}" x2="${x + 8}" y2="${y2}" stroke="#888" stroke-width="1" />
    <text x="${tx}" y="${mid}" text-anchor="middle" font-size="11" fill="#555" font-family="monospace" transform="rotate(-90,${tx},${mid})">${esc(label)}</text>
  </g>`;
}

// ── Shape renderers ───────────────────────────────────────────────────────────

function renderRect(
  r: RenderRect,
  scale: number,
  offX: number,
  offY: number,
  unit: Unit,
  dimOffset: number,
): string {
  const cx = offX + r.x * scale;
  const cy = offY + r.y * scale;
  const cw = r.w * scale;
  const ch = r.h * scale;

  // strokeWidth: -1 = dùng default 1.5px; >0 = giá trị mm → đổi sang canvas px
  const sw = r.strokeWidth > 0 ? r.strokeWidth * scale : 1.5;
  const strokeAttr = `stroke="${esc(r.stroke)}" stroke-width="${sw}" fill="${esc(r.fill)}"`;
  const dashAttr   = r.strokeDash ? ` stroke-dasharray="${r.strokeDash}"` : "";

  let out = `<rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" ${strokeAttr}${dashAttr} />`;

  if (r.label) {
    const lx = cx + cw / 2, ly = cy + ch / 2;
    // auto-rotate label to follow the longer side; explicit labelRotation overrides
    const autoRot = r.labelRotation !== undefined ? r.labelRotation : (ch > cw ? 90 : 0);
    const rot = autoRot !== 0 ? ` transform="rotate(${autoRot},${lx},${ly})"` : "";
    out += `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" font-size="13" fill="#1a3a2a" font-family="sans-serif"${rot}>${esc(r.label)}</text>`;
  }

  const sides = r.dimSides;
  if (sides.length > 0) {
    const wLabel = fmtMm(r.w, unit);
    const hLabel = fmtMm(r.h, unit);
    for (const { side, labelPos } of sides) {
      const outer = labelPos === "outer";
      if (side === "top")    out += hDimLine(cx, cx + cw, cy - dimOffset, wLabel, !outer);
      if (side === "bottom") out += hDimLine(cx, cx + cw, cy + ch + dimOffset, wLabel, outer);
      if (side === "right")  out += vDimLine(cy, cy + ch, cx + cw + dimOffset, hLabel, outer);
      if (side === "left")   out += vDimLine(cy, cy + ch, cx - dimOffset, hLabel, !outer);
    }
  }

  return `<g data-id="${esc(r.id)}" class="plan-item">${out}</g>`;
}

function renderMeasure(m: RenderMeasure, scale: number, offX: number, offY: number): string {
  const x1 = offX + m.from[0] * scale, y1 = offY + m.from[1] * scale;
  const x2 = offX + m.to[0]   * scale, y2 = offY + m.to[1]   * scale;

  // Vector đường đo & vector vuông góc
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx*dx + dy*dy);
  if (len < 1) return "";
  const nx = -dy / len, ny = dx / len; // vuông góc, độ dài 1

  // Dịch chuyển theo offset
  const ox = nx * m.offset, oy = ny * m.offset;
  const ax = x1 + ox, ay = y1 + oy;
  const bx = x2 + ox, by = y2 + oy;
  const mid = [(ax + bx) / 2, (ay + by) / 2];

  const label = m.label ?? m.autoLabel;
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  // Giữ chữ luôn đọc được (không ngược)
  const textAngle = (angle > 90 || angle < -90) ? angle + 180 : angle;
  const textX = mid[0], textY = mid[1];
  // outer = phía trên đường (dy âm trong frame xoay), inner = phía dưới
  const labelDy = m.labelPos === "inner" ? "12" : "-5";

  const tickLen = 6;
  const tick1 = `<line x1="${ax - nx*tickLen}" y1="${ay - ny*tickLen}" x2="${ax + nx*tickLen}" y2="${ay + ny*tickLen}" stroke="${esc(m.stroke)}" stroke-width="1"/>`;
  const tick2 = `<line x1="${bx - nx*tickLen}" y1="${by - ny*tickLen}" x2="${bx + nx*tickLen}" y2="${by + ny*tickLen}" stroke="${esc(m.stroke)}" stroke-width="1"/>`;

  return `<g data-id="${esc(m.id)}" class="measure-item">
    <line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="${esc(m.stroke)}" stroke-width="1" marker-start="url(#arrow-start)" marker-end="url(#arrow-end)"/>
    ${tick1}${tick2}
    <text x="${textX}" y="${textY}" text-anchor="middle" dominant-baseline="middle" font-size="11" fill="${esc(m.stroke)}" font-family="monospace"
      transform="rotate(${textAngle},${textX},${textY})"
      dy="${labelDy}">${esc(label)}</text>
  </g>`;
}

function renderShape(shape: RenderShape, scale: number, offX: number, offY: number, unit: Unit, dimOffset: number): string {
  if (shape.kind === "rect") return renderRect(shape, scale, offX, offY, unit, dimOffset);

  if (shape.kind === "path") {
    const pts = shape.points.map(([x, y]) => `${offX + x * scale},${offY + y * scale}`).join(" ");
    const dashAttr = shape.strokeDash ? ` stroke-dasharray="${shape.strokeDash}"` : "";
    return `<polyline points="${pts}" stroke="${esc(shape.stroke)}" stroke-width="${shape.strokeWidth * scale}" fill="none"${dashAttr} />`;
  }

  if (shape.kind === "measure") return renderMeasure(shape, scale, offX, offY);

  return "";
}

// ── Arrow marker defs ─────────────────────────────────────────────────────────

const DEFS = `
<defs>
  <marker id="arrow-start" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto" markerUnits="userSpaceOnUse">
    <path d="M6,0 L0,3 L6,6" fill="none" stroke="#888" stroke-width="1"/>
  </marker>
  <marker id="arrow-end" markerWidth="6" markerHeight="6" refX="0" refY="3" orient="auto" markerUnits="userSpaceOnUse">
    <path d="M0,0 L6,3 L0,6" fill="none" stroke="#888" stroke-width="1"/>
  </marker>
</defs>`;

// ── Main renderer ─────────────────────────────────────────────────────────────

export function renderSvg(scene: RenderScene): string {
  const dimOffset = scene.dimensionOffset;
  // Scale để vừa canvas, tính thêm padding cho dimension lines
  const extra = dimOffset * 2 + PADDING;
  const scaleX = (CANVAS_W - extra * 2) / scene.plotW;
  const scaleY = (CANVAS_H - extra * 2) / scene.plotH;
  const scale  = Math.min(scaleX, scaleY);

  // Căn giữa
  const totalW = scene.plotW * scale;
  const totalH = scene.plotH * scale;
  const offX   = (CANVAS_W - totalW) / 2;
  const offY   = (CANVAS_H - totalH) / 2;

  let body = "";

  // ── Plot border ───────────────────────────────────────────────────────────
  body += `<rect x="${offX}" y="${offY}" width="${totalW}" height="${totalH}" stroke="#333" stroke-width="1.5" fill="none" />`;

  if (scene.plotShowDimensions) {
    const wLabel = fmtMm(scene.plotW, scene.unit);
    const hLabel = fmtMm(scene.plotH, scene.unit);
    body += hDimLine(offX, offX + totalW, offY - dimOffset, wLabel);
    body += vDimLine(offY, offY + totalH, offX - dimOffset, hLabel);
  }

  if (scene.plotLabel) {
    body += `<text x="${offX + totalW / 2}" y="${offY + totalH + 20}" text-anchor="middle" font-size="12" fill="#666" font-family="sans-serif">${esc(scene.plotLabel)}</text>`;
  }

  // ── Shapes ────────────────────────────────────────────────────────────────
  for (const shape of scene.shapes) {
    body += renderShape(shape, scale, offX, offY, scene.unit, dimOffset);
  }

  // ── Compass labels ────────────────────────────────────────────────────────
  const compassGap = dimOffset + 36;
  const compassStyle = `font-size="13" fill="#888" font-family="sans-serif" font-weight="600" letter-spacing="1"`;
  const midX = offX + totalW / 2;
  const midY = offY + totalH / 2;
  body += `<text x="${midX}" y="${offY - compassGap}" text-anchor="middle" dominant-baseline="auto" ${compassStyle}>N</text>`;
  body += `<text x="${midX}" y="${offY + totalH + compassGap}" text-anchor="middle" dominant-baseline="hanging" ${compassStyle}>S</text>`;
  body += `<text x="${offX - compassGap}" y="${midY}" text-anchor="end" dominant-baseline="middle" ${compassStyle}>W</text>`;
  body += `<text x="${offX + totalW + compassGap}" y="${midY}" text-anchor="start" dominant-baseline="middle" ${compassStyle}>E</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_W}" height="${CANVAS_H}" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}">${DEFS}${body}</svg>`;
}
