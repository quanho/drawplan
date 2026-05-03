// ── Compiler (ported from compiler.ts) ────────────────────────────────────────
function toMm(value, unit) {
  if (unit === "m")  return value * 1000;
  if (unit === "cm") return value * 10;
  return value; // mm
}

function resolveDimSides(spec) {
  const defaults = [
    { side: "top", labelPos: "outer" },
    { side: "right", labelPos: "outer" },
  ];
  if (spec === false) return [];
  if (spec === true || spec === undefined)
    return defaults.map(e => ({ ...e }));
  if (Array.isArray(spec))
    return spec.map(s => ({ side: s, labelPos: "outer" }));
  // Record form: merge vào default (top+right). false = ẩn, true/config = thêm/override
  const map = new Map(defaults.map(e => [e.side, { ...e }]));
  for (const [side, cfg] of Object.entries(spec)) {
    if (cfg === false) { map.delete(side); }
    else {
      map.set(side, {
        side,
        labelPos: (cfg === true || !cfg.labelPos) ? "outer" : cfg.labelPos,
      });
    }
  }
  return Array.from(map.values());
}

function compileRect(item, unit) {
  return {
    kind: "rect", id: item.id, label: item.label,
    x: toMm(item.x, unit), y: toMm(item.y, unit),
    w: toMm(item.width, unit), h: toMm(item.height, unit),
    stroke: item.stroke ?? "#1a7a3e",
    strokeWidth: item.strokeWidth != null ? toMm(item.strokeWidth, unit) : -1,
    strokeDash: item.style === "dashed" ? "8,5" : undefined,
    fill: item.fill ?? "none",
    labelRotation: item.labelRotation,
    dimSides: resolveDimSides(item.showDimensions),
  };
}

function compilePath(item, unit) {
  return {
    kind: "path", id: item.id, label: item.label,
    points: item.points.map(([x, y]) => [toMm(x, unit), toMm(y, unit)]),
    stroke: item.stroke ?? "#555",
    strokeDash: item.style === "dashed" ? "8,5" : undefined,
    strokeWidth: toMm(item.strokeWidth ?? 200, unit),
  };
}

function compileMeasure(item, unit) {
  const [x1,y1] = [toMm(item.from[0],unit), toMm(item.from[1],unit)];
  const [x2,y2] = [toMm(item.to[0],unit),   toMm(item.to[1],unit)];
  const dist = Math.round(Math.sqrt((x2-x1)**2+(y2-y1)**2));
  return {
    kind: "measure", id: item.id,
    from: [x1,y1], to: [x2,y2],
    label: item.label, autoLabel: String(dist),
    offset: item.offset ?? 0,
    stroke: item.stroke ?? "#888",
    labelPos: item.labelPos ?? "outer",
  };
}

function compile(doc) {
  const unit = doc.unit ?? "mm";
  const shapes = (doc.items ?? []).map(item => {
    if (item.type === "rect") return compileRect(item, unit);
    if (item.type === "path") return compilePath(item, unit);
    if (item.type === "measure") return compileMeasure(item, unit);
    throw new Error("Unknown type: " + item.type);
  });
  return {
    plotW: toMm(doc.plot.width, unit),
    plotH: toMm(doc.plot.depth, unit),
    plotLabel: doc.plot.label,
    plotShowDimensions: doc.plot.showDimensions !== false,
    shapes, unit,
    dimensionOffset: doc.dimensionOffset ?? 0,
  };
}

// ── Renderer (ported from renderer.ts) ────────────────────────────────────────
const CANVAS_W = 1400, CANVAS_H = 900, PADDING = 80;

function esc(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function fmtMm(mm, unit) {
  if (unit === "m")  return (mm / 1000).toLocaleString("en", { maximumFractionDigits: 3 });
  if (unit === "cm") return (mm / 10).toLocaleString("en", { maximumFractionDigits: 1 });
  return String(Math.round(mm));
}

function hDimLine(x1, x2, y, label, textBelow = false) {
  if (Math.abs(x2 - x1) < 1) return "";
  const mid = (x1 + x2) / 2;
  const ty = textBelow ? y + 14 : y - 6;
  return `<g class="dim-line">
    <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="#888" stroke-width="1" marker-start="url(#arrow-start)" marker-end="url(#arrow-end)"/>
    <line x1="${x1}" y1="${y-8}" x2="${x1}" y2="${y+8}" stroke="#888" stroke-width="1"/>
    <line x1="${x2}" y1="${y-8}" x2="${x2}" y2="${y+8}" stroke="#888" stroke-width="1"/>
    <text x="${mid}" y="${ty}" text-anchor="middle" font-size="11" fill="#555" font-family="monospace">${esc(label)}</text>
  </g>`;
}

function vDimLine(y1, y2, x, label, textRight = false) {
  if (Math.abs(y2 - y1) < 1) return "";
  const mid = (y1 + y2) / 2;
  const tx = textRight ? x + 14 : x - 6;
  return `<g class="dim-line">
    <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="#888" stroke-width="1" marker-start="url(#arrow-start)" marker-end="url(#arrow-end)"/>
    <line x1="${x-8}" y1="${y1}" x2="${x+8}" y2="${y1}" stroke="#888" stroke-width="1"/>
    <line x1="${x-8}" y1="${y2}" x2="${x+8}" y2="${y2}" stroke="#888" stroke-width="1"/>
    <text x="${tx}" y="${mid}" text-anchor="middle" font-size="11" fill="#555" font-family="monospace" transform="rotate(-90,${tx},${mid})">${esc(label)}</text>
  </g>`;
}

function renderRectShape(r, scale, offX, offY, unit, dimOffset) {
  const cx = offX + r.x * scale, cy = offY + r.y * scale;
  const cw = r.w * scale, ch = r.h * scale;
  const sw = r.strokeWidth > 0 ? r.strokeWidth * scale : 1.5;
  const dash = r.strokeDash ? ` stroke-dasharray="${r.strokeDash}"` : "";
  let out = `<rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" stroke="${esc(r.stroke)}" stroke-width="${sw}" fill="${esc(r.fill)}"${dash}/>`;
  if (r.label) {
    const lx = cx+cw/2, ly = cy+ch/2;
    const autoRot = r.labelRotation !== undefined ? r.labelRotation : (ch > cw ? 90 : 0);
    const rot = autoRot !== 0 ? ` transform="rotate(${autoRot},${lx},${ly})"` : "";
    out += `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" font-size="13" fill="#1a3a2a" font-family="sans-serif"${rot}>${esc(r.label)}</text>`;
  }
  if (r.dimSides.length > 0) {
    const wLabel = fmtMm(r.w, unit), hLabel = fmtMm(r.h, unit);
    for (const { side, labelPos } of r.dimSides) {
      const outer = labelPos === "outer";
      if (side === "top")    out += hDimLine(cx, cx+cw, cy-dimOffset, wLabel, !outer);
      if (side === "bottom") out += hDimLine(cx, cx+cw, cy+ch+dimOffset, wLabel, outer);
      if (side === "right")  out += vDimLine(cy, cy+ch, cx+cw+dimOffset, hLabel, outer);
      if (side === "left")   out += vDimLine(cy, cy+ch, cx-dimOffset, hLabel, !outer);
    }
  }
  return `<g data-id="${esc(r.id)}" class="plan-item">${out}</g>`;
}

function renderMeasure(m, scale, offX, offY) {
  const x1=offX+m.from[0]*scale, y1=offY+m.from[1]*scale;
  const x2=offX+m.to[0]*scale,   y2=offY+m.to[1]*scale;
  const dx=x2-x1, dy=y2-y1, len=Math.sqrt(dx*dx+dy*dy);
  if (len<1) return "";
  const nx=-dy/len, ny=dx/len;
  const ox=nx*m.offset, oy=ny*m.offset;
  const ax=x1+ox, ay=y1+oy, bx=x2+ox, by=y2+oy;
  const mx2=(ax+bx)/2, my2=(ay+by)/2;
  const label = m.label ?? m.autoLabel;
  const angle = Math.atan2(dy,dx)*180/Math.PI;
  const ta = (angle>90||angle<-90) ? angle+180 : angle;
  const labelDy = m.labelPos === "inner" ? "12" : "-5";
  const tl=6;
  return `<g data-id="${esc(m.id)}" class="measure-item">
    <line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="${esc(m.stroke)}" stroke-width="1" marker-start="url(#arrow-start)" marker-end="url(#arrow-end)"/>
    <line x1="${ax-nx*tl}" y1="${ay-ny*tl}" x2="${ax+nx*tl}" y2="${ay+ny*tl}" stroke="${esc(m.stroke)}" stroke-width="1"/>
    <line x1="${bx-nx*tl}" y1="${by-ny*tl}" x2="${bx+nx*tl}" y2="${by+ny*tl}" stroke="${esc(m.stroke)}" stroke-width="1"/>
    <text x="${mx2}" y="${my2}" text-anchor="middle" dominant-baseline="middle" font-size="11" fill="${esc(m.stroke)}" font-family="monospace" transform="rotate(${ta},${mx2},${my2})" dy="${labelDy}">${esc(label)}</text>
  </g>`;
}

function renderShape(shape, scale, offX, offY, unit, dimOffset) {
  if (shape.kind === "rect") return renderRectShape(shape, scale, offX, offY, unit, dimOffset);
  if (shape.kind === "path") {
    const pts = shape.points.map(([x,y]) => `${offX+x*scale},${offY+y*scale}`).join(" ");
    const dash = shape.strokeDash ? ` stroke-dasharray="${shape.strokeDash}"` : "";
    return `<polyline points="${pts}" stroke="${esc(shape.stroke)}" stroke-width="${shape.strokeWidth*scale}" fill="none"${dash}/>`;
  }
  if (shape.kind === "measure") return renderMeasure(shape, scale, offX, offY);
  return "";
}

const DEFS = `<defs>
  <marker id="arrow-start" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto" markerUnits="userSpaceOnUse">
    <path d="M6,0 L0,3 L6,6" fill="none" stroke="#888" stroke-width="1"/>
  </marker>
  <marker id="arrow-end" markerWidth="6" markerHeight="6" refX="0" refY="3" orient="auto" markerUnits="userSpaceOnUse">
    <path d="M0,0 L6,3 L0,6" fill="none" stroke="#888" stroke-width="1"/>
  </marker>
</defs>`;

function renderSvg(scene) {
  const dimOffset = scene.dimensionOffset;
  const extra = dimOffset * 2 + PADDING;
  const scale = Math.min((CANVAS_W - extra*2) / scene.plotW, (CANVAS_H - extra*2) / scene.plotH);
  const totalW = scene.plotW * scale, totalH = scene.plotH * scale;
  const offX = (CANVAS_W - totalW) / 2, offY = (CANVAS_H - totalH) / 2;

  let body = `<rect x="${offX}" y="${offY}" width="${totalW}" height="${totalH}" stroke="#333" stroke-width="1.5" fill="none"/>`;
  if (scene.plotShowDimensions) {
    body += hDimLine(offX, offX+totalW, offY-dimOffset, fmtMm(scene.plotW, scene.unit));
    body += vDimLine(offY, offY+totalH, offX-dimOffset, fmtMm(scene.plotH, scene.unit));
  }
  if (scene.plotLabel) body += `<text x="${offX+totalW/2}" y="${offY+totalH+20}" text-anchor="middle" font-size="12" fill="#666" font-family="sans-serif">${esc(scene.plotLabel)}</text>`;
  for (const shape of scene.shapes) body += renderShape(shape, scale, offX, offY, scene.unit, dimOffset);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_W}" height="${CANVAS_H}" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}">${DEFS}${body}</svg>`;
}

// ── UI ─────────────────────────────────────────────────────────────────────────
const input      = document.getElementById("input");
