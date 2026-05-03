/**
 * schema.ts — DrawPlan DSL v1
 *
 * Người dùng mô tả mặt bằng bằng JSON.
 * Tất cả đơn vị đo là milimét (mm) theo mặc định, hoặc m/cm nếu chỉ rõ.
 *
 * Ví dụ nhanh:
 * {
 *   "unit": "mm",
 *   "plot": { "width": 22000, "depth": 60000 },
 *   "items": [
 *     {
 *       "id": "house",
 *       "label": "House",
 *       "type": "rect",
 *       "x": 8393, "y": 0,
 *       "width": 21000, "height": 8730,
 *       "style": "solid"
 *     },
 *     {
 *       "id": "garage",
 *       "label": "Garage",
 *       "type": "rect",
 *       "x": 1125, "y": 13210,
 *       "width": 21947, "height": 7400,
 *       "style": "solid"
 *     }
 *   ]
 * }
 */

export type Unit = "mm" | "cm" | "m";

/** Kiểu hiển thị viền: solid = nét liền, dashed = nét đứt */
export type StrokeStyle = "solid" | "dashed";

/** Màu nền tùy chọn */
export type FillColor = string; // CSS color hoặc "none"

export type DimensionSide = "top" | "bottom" | "left" | "right";

/** Vị trí nhãn so với đường đo: outer = ra xa shape, inner = ép vào shape */
export type DimensionLabelPos = "outer" | "inner";

export interface DimensionSideConfig {
  /** Mặc định: "outer" */
  labelPos?: DimensionLabelPos;
}

/**
 * Chỉ định cạnh nào vẽ đường kích thước:
 *   true           → mặc định (top + right, outer)
 *   false          → ẩn tất cả
 *   ["top","left"] → các cạnh đó với labelPos outer
 *   { "bottom": { "labelPos": "outer" }, "right": false } → per-side config, false = ẩn cạnh đó
 */
export type DimensionSpec =
  | boolean
  | DimensionSide[]
  | Partial<Record<DimensionSide, false | true | DimensionSideConfig>>;

/**
 * Một ô hình chữ nhật trên mặt bằng.
 * x, y là toạ độ góc trên-trái tính từ góc trên-trái của mảnh đất.
 * Đơn vị theo trường "unit" của PlanDocument.
 */
export interface RectItem {
  id: string;
  label?: string;
  type: "rect";
  /** Toạ độ X (từ trái) */
  x: number;
  /** Toạ độ Y (từ trên) */
  y: number;
  width: number;
  height: number;
  style?: StrokeStyle;
  fill?: FillColor;
  /** Màu nét vẽ, VD: "#e11d48", "blue". Mặc định: "#1a7a3e" */
  stroke?: string;
  /** Độ dày nét vẽ theo đơn vị của document (mm/cm/m). Mặc định: 1.5px canvas */
  strokeWidth?: number;
  /** Góc quay nhãn (độ). Mặc định: 0 */
  labelRotation?: number;
  /**
   * Cạnh vẽ đường kích thước.
   * true = ["top","right"], false = [], hoặc chỉ định cụ thể: ["top","bottom","left","right"]
   * Mặc định: true
   */
  showDimensions?: DimensionSpec;
}

/**
 * Một con đường/lối đi dạng đường thẳng.
 */
export interface PathItem {
  id: string;
  label?: string;
  type: "path";
  /** Danh sách điểm [x, y] */
  points: [number, number][];
  /** Màu nét vẽ. Mặc định: "#555" */
  stroke?: string;
  /** Độ dày nét vẽ theo đơn vị của document. Mặc định: 200mm */
  strokeWidth?: number;
  style?: StrokeStyle;
}

/**
 * Đường đo khoảng cách giữa 2 điểm.
 * Vẽ mũi tên 2 đầu + nhãn ở giữa.
 * Nếu không chỉ định label, tự tính từ khoảng cách thực.
 *
 * Ví dụ:
 * { "id": "gap-top", "type": "measure",
 *   "from": [1125, 0], "to": [1125, 1125] }
 */
export interface MeasureItem {
  id: string;
  type: "measure";
  /** Điểm bắt đầu [x, y] */
  from: [number, number];
  /** Điểm kết thúc [x, y] */
  to: [number, number];
  /** Nhãn hiển thị. Nếu bỏ qua, tự tính khoảng cách theo đơn vị */
  label?: string;
  /** Dịch chuyển vuông góc với đường đo (px). Mặc định: 0 */
  offset?: number;
  /** Màu nét. Mặc định: "#888" */
  stroke?: string;
  /** Vị trí nhãn: "outer" = phía trên đường (mặc định), "inner" = phía dưới */
  labelPos?: DimensionLabelPos;
}

export type PlanItem = RectItem | PathItem | MeasureItem;

/** Mảnh đất / khuôn viên tổng thể */
export interface Plot {
  /** Chiều rộng (trục X) */
  width: number;
  /** Chiều sâu / chiều dài (trục Y) */
  depth: number;
  label?: string;
  /** Hiển thị dimension lines cho mảnh đất (mặc định true) */
  showDimensions?: boolean;
}

/** Tài liệu mặt bằng tổng thể */
export interface PlanDocument {
  /** Phiên bản schema */
  version?: "drawplan/v1";
  /** Đơn vị đo (mặc định: mm) */
  unit?: Unit;
  /** Mảnh đất tổng thể */
  plot: Plot;
  /** Danh sách các hạng mục */
  items?: PlanItem[];
  /** Khoảng cách (px) từ shape ra đường ghi kích thước. Mặc định: 0 */
  dimensionOffset?: number;
}
