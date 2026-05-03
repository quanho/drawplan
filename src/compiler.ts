/**
 * compiler.ts — PlanDocument → RenderScene
 *
 * Chuyển đổi DSL sang cấu trúc render-ready.
 * Tất cả toạ độ đầu ra tính bằng mm (đã chuẩn hoá).
 */

import type { PlanDocument, PlanItem, RectItem, PathItem, MeasureItem, Unit, DimensionSide, DimensionSpec, DimensionSideConfig } from "./schema.js";

// ── Unit normalisation ────────────────────────────────────────────────────────

function toMm(value: number, unit: Unit): number {
  switch (unit) {
    case "m":  return value * 1000;
    case "cm": return value * 10;
    case "mm": return value;
  }
}

// ── Render types ──────────────────────────────────────────────────────────────

export interface DimSideEntry {
  side: DimensionSide;
  labelPos: "outer" | "inner";
}

export interface RenderRect {
  kind: "rect";
  id: string;
  label?: string;
  labelRotation: number | undefined;
  x: number; y: number;
  w: number; h: number;
  stroke: string;
  strokeWidth: number;
  strokeDash?: string;
  fill: string;
  /** Các cạnh có đường kích thước kèm vị trí nhãn */
  dimSides: DimSideEntry[];
}

export interface RenderPath {
  kind: "path";
  id: string;
  label?: string;
  points: [number, number][];
  stroke: string;
  strokeDash?: string;
  strokeWidth: number;
}

export interface RenderMeasure {
  kind: "measure";
  id: string;
  from: [number, number];
  to: [number, number];
  label?: string;
  autoLabel: string;
  offset: number;
  stroke: string;
  labelPos: "outer" | "inner";
}

export type RenderShape = RenderRect | RenderPath | RenderMeasure;

export interface RenderScene {
  /** Chiều rộng mảnh đất (mm) */
  plotW: number;
  /** Chiều sâu mảnh đất (mm) */
  plotH: number;
  plotLabel?: string;
  plotShowDimensions: boolean;
  shapes: RenderShape[];
  /** Đơn vị gốc để hiển thị nhãn */
  unit: Unit;
  /** Khoảng cách px từ shape ra đường ghi kích thước */
  dimensionOffset: number;
}

// ── Compiler ──────────────────────────────────────────────────────────────────

const DEFAULT_SIDES: DimSideEntry[] = [
  { side: "top", labelPos: "outer" },
  { side: "right", labelPos: "outer" },
];

function resolveDimSides(spec: DimensionSpec | undefined): DimSideEntry[] {
  if (spec === false) return [];
  if (spec === true || spec === undefined) return [...DEFAULT_SIDES];
  if (Array.isArray(spec))
    return spec.map(s => ({ side: s, labelPos: "outer" as const }));
  // Record form: merge vào default (top+right). false = ẩn cạnh đó, true/config = thêm/override
  const map = new Map<DimensionSide, DimSideEntry>(
    DEFAULT_SIDES.map(e => [e.side, { ...e }])
  );
  for (const [side, cfg] of Object.entries(spec) as [DimensionSide, false | true | DimensionSideConfig][]) {
    if (cfg === false) { map.delete(side); }
    else {
      map.set(side, {
        side,
        labelPos: (cfg === true || !(cfg as DimensionSideConfig).labelPos) ? "outer" : (cfg as DimensionSideConfig).labelPos!,
      });
    }
  }
  return Array.from(map.values());
}

function compileRect(item: RectItem, unit: Unit): RenderRect {
  const dash = item.style === "dashed" ? "8,5" : undefined;
  return {
    kind: "rect",
    id: item.id,
    label: item.label,
    x: toMm(item.x, unit),
    y: toMm(item.y, unit),
    w: toMm(item.width, unit),
    h: toMm(item.height, unit),
    stroke: item.stroke ?? "#1a7a3e",
    strokeWidth: item.strokeWidth != null ? toMm(item.strokeWidth, unit) : -1, // -1 = dùng default px
    strokeDash: dash,
    fill: item.fill ?? "none",
    labelRotation: item.labelRotation,
    dimSides: resolveDimSides(item.showDimensions),
  };
}

function compilePath(item: PathItem, unit: Unit): RenderPath {
  const dash = item.style === "dashed" ? "8,5" : undefined;
  return {
    kind: "path",
    id: item.id,
    label: item.label,
    points: item.points.map(([x, y]) => [toMm(x, unit), toMm(y, unit)]),
    stroke: item.stroke ?? "#555",
    strokeDash: dash,
    strokeWidth: toMm(item.strokeWidth ?? 200, unit),
  };
}

function compileMeasure(item: MeasureItem, unit: Unit): RenderMeasure {
  const [x1, y1] = [toMm(item.from[0], unit), toMm(item.from[1], unit)];
  const [x2, y2] = [toMm(item.to[0], unit), toMm(item.to[1], unit)];
  const dist = Math.round(Math.sqrt((x2-x1)**2 + (y2-y1)**2));
  const autoLabel = String(dist);
  return {
    kind: "measure",
    id: item.id,
    from: [x1, y1],
    to: [x2, y2],
    label: item.label,
    autoLabel,
    offset: item.offset ?? 0,
    stroke: item.stroke ?? "#888",
    labelPos: item.labelPos ?? "outer",
  };
}

export function compile(doc: PlanDocument): RenderScene {
  const unit: Unit = doc.unit ?? "mm";

  const shapes: RenderShape[] = (doc.items ?? []).map((item: PlanItem) => {
    if (item.type === "rect") return compileRect(item, unit);
    if (item.type === "path") return compilePath(item, unit);
    if (item.type === "measure") return compileMeasure(item, unit);
    throw new Error(`Unknown item type: ${(item as PlanItem).type}`);
  });

  return {
    plotW: toMm(doc.plot.width, unit),
    plotH: toMm(doc.plot.depth, unit),
    plotLabel: doc.plot.label,
    plotShowDimensions: doc.plot.showDimensions !== false,
    shapes,
    unit,
    dimensionOffset: doc.dimensionOffset ?? 0,
  };
}
