/**
 * parse-canvas.ts — tolerant parser for the JSONCanvas / Obsidian .canvas format.
 *
 * Never throws; accepts a parsed object or a raw JSON string.
 * All validation failures produce empty results rather than hard errors.
 */

// ─── Types ─────────────────────────────────────────────────────────────────

export type CanvasColor =
  | { kind: "preset"; preset: 1 | 2 | 3 | 4 | 5 | 6 }
  | { kind: "hex"; hex: string }
  | null;

export interface CanvasNodeBase {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: CanvasColor;
}

export interface TextNode extends CanvasNodeBase {
  type: "text";
  text: string;
}

export interface FileNode extends CanvasNodeBase {
  type: "file";
  file: string;
  subpath: string | null;
}

export interface LinkNode extends CanvasNodeBase {
  type: "link";
  url: string;
}

export interface GroupNode extends CanvasNodeBase {
  type: "group";
  label: string | null;
}

export interface UnknownNode extends CanvasNodeBase {
  type: "unknown";
  raw: Record<string, unknown>;
}

export type CanvasNode = TextNode | FileNode | LinkNode | GroupNode | UnknownNode;

export type CanvasSide = "top" | "right" | "bottom" | "left";
export type CanvasEnd = "none" | "arrow";

export interface CanvasEdge {
  id: string;
  fromNode: string;
  fromSide: CanvasSide | null;
  fromEnd: CanvasEnd;
  toNode: string;
  toSide: CanvasSide | null;
  toEnd: CanvasEnd;
  color: CanvasColor;
  label: string | null;
}

export interface ParsedCanvas {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

// ─── Constants ─────────────────────────────────────────────────────────────

const DEFAULT_W = 250;
const DEFAULT_H = 60;
const EMPTY: ParsedCanvas = { nodes: [], edges: [] };

// ─── Helpers ───────────────────────────────────────────────────────────────

function parseColor(raw: unknown): CanvasColor {
  if (typeof raw !== "string") return null;
  const n = Number(raw);
  if (Number.isInteger(n) && n >= 1 && n <= 6) {
    return { kind: "preset", preset: n as 1 | 2 | 3 | 4 | 5 | 6 };
  }
  if (/^#[0-9a-f]{3,8}$/i.test(raw)) {
    return { kind: "hex", hex: raw };
  }
  return null;
}

function parseSide(raw: unknown): CanvasSide | null {
  if (raw === "top" || raw === "right" || raw === "bottom" || raw === "left") return raw;
  return null;
}

function parseEnd(raw: unknown, defaultVal: CanvasEnd): CanvasEnd {
  if (raw === "none" || raw === "arrow") return raw;
  return defaultVal;
}

function parseNode(raw: Record<string, unknown>): CanvasNode | null {
  // id must be a non-empty string
  const id = raw.id;
  if (typeof id !== "string" || id === "") return null;

  // x/y must be finite numbers
  const x = Number(raw.x);
  const y = Number(raw.y);
  if (!isFinite(x) || !isFinite(y)) return null;

  // width/height: default if missing or non-finite
  const rawW = Number(raw.width);
  const rawH = Number(raw.height);
  const width = isFinite(rawW) ? rawW : DEFAULT_W;
  const height = isFinite(rawH) ? rawH : DEFAULT_H;

  const color = parseColor(raw.color);
  const base: CanvasNodeBase = { id, x, y, width, height, color };

  const type = raw.type;

  if (type === "text") {
    return { ...base, type: "text", text: typeof raw.text === "string" ? raw.text : "" };
  }

  if (type === "file") {
    const fileStr = typeof raw.file === "string" ? raw.file : "";
    const hashIdx = fileStr.indexOf("#");
    const file = hashIdx >= 0 ? fileStr.slice(0, hashIdx) : fileStr;
    const subpath = hashIdx >= 0 ? fileStr.slice(hashIdx) : null;
    return { ...base, type: "file", file, subpath };
  }

  if (type === "link") {
    return { ...base, type: "link", url: typeof raw.url === "string" ? raw.url : "" };
  }

  if (type === "group") {
    const label = typeof raw.label === "string" ? raw.label : null;
    return { ...base, type: "group", label };
  }

  // Unknown type — preserve raw object for display purposes
  return { ...base, type: "unknown", raw };
}

function parseEdge(raw: Record<string, unknown>, nodeIds: Set<string>): CanvasEdge | null {
  const id = raw.id;
  if (typeof id !== "string" || id === "") return null;

  const fromNode = raw.fromNode;
  const toNode = raw.toNode;

  if (typeof fromNode !== "string" || fromNode === "") return null;
  if (typeof toNode !== "string" || toNode === "") return null;

  // Drop dangling edges that reference missing nodes
  if (!nodeIds.has(fromNode) || !nodeIds.has(toNode)) return null;

  return {
    id,
    fromNode,
    fromSide: parseSide(raw.fromSide),
    fromEnd: parseEnd(raw.fromEnd, "none"),
    toNode,
    toSide: parseSide(raw.toSide),
    toEnd: parseEnd(raw.toEnd, "arrow"),
    color: parseColor(raw.color),
    label: typeof raw.label === "string" ? raw.label : null,
  };
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Parse a JSONCanvas document.
 *
 * Accepts a parsed `object` or a raw JSON `string` (JSON.parse is applied
 * internally). Never throws — any parse failure or invalid input returns
 * `{ nodes: [], edges: [] }`.
 */
export function parseCanvas(json: unknown): ParsedCanvas {
  let data: unknown = json;

  // Accept raw JSON string
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return EMPTY;
    }
  }

  // Must be a non-null, non-array object
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return EMPTY;
  }

  const obj = data as Record<string, unknown>;

  // Parse nodes
  const rawNodes = Array.isArray(obj.nodes) ? obj.nodes : [];
  const nodes: CanvasNode[] = [];
  for (const raw of rawNodes) {
    if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
      const node = parseNode(raw as Record<string, unknown>);
      if (node) nodes.push(node);
    }
  }

  const nodeIds = new Set(nodes.map((n) => n.id));

  // Parse edges (after nodes so we can check for dangling references)
  const rawEdges = Array.isArray(obj.edges) ? obj.edges : [];
  const edges: CanvasEdge[] = [];
  for (const raw of rawEdges) {
    if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
      const edge = parseEdge(raw as Record<string, unknown>, nodeIds);
      if (edge) edges.push(edge);
    }
  }

  return { nodes, edges };
}

/**
 * Compute the anchor point on a node's border for an edge endpoint.
 *
 * When `side` is null, the side facing `other`'s center is chosen
 * (closest-center heuristic, same as how Obsidian auto-routes).
 */
export function edgeAnchor(
  node: CanvasNodeBase,
  side: CanvasSide | null,
  other: CanvasNodeBase,
): { x: number; y: number } {
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;

  const resolvedSide: CanvasSide =
    side ??
    (() => {
      const ocx = other.x + other.width / 2;
      const ocy = other.y + other.height / 2;
      const dx = ocx - cx;
      const dy = ocy - cy;
      if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "right" : "left";
      return dy >= 0 ? "bottom" : "top";
    })();

  switch (resolvedSide) {
    case "top":    return { x: cx,                   y: node.y };
    case "bottom": return { x: cx,                   y: node.y + node.height };
    case "left":   return { x: node.x,               y: cy };
    case "right":  return { x: node.x + node.width,  y: cy };
  }
}
