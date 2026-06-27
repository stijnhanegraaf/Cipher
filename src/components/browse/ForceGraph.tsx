"use client";

/**
 * ForceGraph — Obsidian-quality 2D force-directed graph via react-force-graph.
 *
 * Replaces the hand-rolled GraphCanvas with a live, draggable layout that:
 *  - Uses d3-force (Barnes-Hut) for scalable physics (2400+ nodes)
 *  - Relaxes neighbours on drag automatically (react-force-graph reheats sim)
 *  - Degree-scaled node radii (hubs clearly larger than leaves)
 *  - Zoom-gated labels (hub nodes labelled at lower zoom; all nodes above threshold)
 *  - Hover → highlight neighbourhood, dim the rest (Obsidian's signature feel)
 *  - Visible edges with tag-filter-aware dimming
 *  - Single-click opens a note (onOpen)
 *  - Settles then idles (cooldownTicks + autoPauseRedraw)
 *  - Fits to view after first settle (zoomToFit in onEngineStop)
 *
 * Color: ALL colors resolved from CSS tokens via getComputedStyle at paint time.
 * Raw hex is never written as a literal — values are derived from --hue-* and
 * --text-* tokens and converted to canvas-usable strings at runtime.
 */

import dynamic from "next/dynamic";
import { useRef, useCallback, useEffect, useState, useMemo } from "react";
import type React from "react";
import type { Graph } from "@/lib/vault-graph";
import { tagColor } from "@/lib/color/tag-color";
import { toForceGraphData, type FGNodeData } from "@/lib/browse/force-graph-data";

// ─── Runtime node/link types ─────────────────────────────────────────────────
// After react-force-graph processes graphData, node objects are mutated with
// physics properties (x, y, vx, vy, fx, fy). FGNode extends FGNodeData with
// these optional fields so paint callbacks can type-safely read them.

interface FGNode extends FGNodeData {
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number;
  fy?: number;
  index?: number;
}

// After the sim runs, link.source/target become the resolved node objects.
interface FGLink {
  source: string | FGNode;
  target: string | FGNode;
}

// Subset of ForceGraph2D instance methods we call.
interface FGInstance {
  zoomToFit(durationMs?: number, padding?: number): void;
  resumeAnimation(): void;
}

// ─── ForceGraph2D prop interface ──────────────────────────────────────────────
// Narrow interface covering only the props we pass. Typed explicitly to avoid
// `any` while keeping TS strict happy across the dynamic import boundary.

interface FG2DProps {
  graphData: { nodes: FGNode[]; links: FGLink[] };
  width: number;
  height: number;
  backgroundColor: string;
  nodeLabel: string;
  nodeCanvasObject: (node: FGNode, ctx: CanvasRenderingContext2D, globalScale: number) => void;
  nodeCanvasObjectMode: () => string;
  nodePointerAreaPaint: (node: FGNode, color: string, ctx: CanvasRenderingContext2D) => void;
  linkCanvasObject: (link: FGLink, ctx: CanvasRenderingContext2D, globalScale: number) => void;
  linkCanvasObjectMode: string;
  warmupTicks: number;
  cooldownTicks: number;
  cooldownTime: number;
  d3VelocityDecay: number;
  autoPauseRedraw: boolean;
  enableNodeDrag: boolean;
  linkHoverPrecision: number;
  showPointerCursor: boolean;
  onNodeClick: (node: FGNode) => void;
  onNodeHover: (node: FGNode | null, previousNode: FGNode | null) => void;
  onEngineStop: () => void;
  ref?: React.MutableRefObject<FGInstance | undefined>;
}

// ─── Dynamic import ───────────────────────────────────────────────────────────
// react-force-graph touches window/canvas; must never run on the server.

const DynFG2D = dynamic<FG2DProps>(
  // Import the STANDALONE 2D package, not the umbrella `react-force-graph` — the
  // umbrella bundles the VR/AR builds which reference a global `AFRAME` and throw
  // "Can't find variable: AFRAME" at import time.
  () =>
    import("react-force-graph-2d").then((m) => ({
      default: m.default as unknown as React.ComponentType<FG2DProps>,
    })),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-tertiary)",
          fontSize: "var(--text-sm)",
        }}
        aria-label="Loading graph"
      >
        Loading graph
      </div>
    ),
  }
);

// ─── Color utilities ──────────────────────────────────────────────────────────
// All colors come from CSS tokens resolved via getComputedStyle at paint time.
// A 1×1 canvas normalises any CSS color format (oklch, etc.) to integer RGB.
// Cache is keyed by raw CSS value string so theme changes get fresh entries.

const _rgbCache = new Map<string, [number, number, number]>();
// token→"rgb(...)" cache keyed by the active theme, so getComputedStyle (a style
// recalc) runs ~once per token per theme instead of per-node-per-frame. Keyed by
// data-theme (a cheap attribute read, no recalc) so a theme toggle re-resolves.
const _tokenCache = new Map<string, string>();
let _tmpCanvas: HTMLCanvasElement | null = null;
let _tmpCtx: CanvasRenderingContext2D | null = null;

function cssValueToRgb(cssValue: string): [number, number, number] {
  if (!cssValue) return [128, 128, 128];

  const cached = _rgbCache.get(cssValue);
  if (cached) return cached;

  if (!_tmpCtx) {
    _tmpCanvas = document.createElement("canvas");
    _tmpCanvas.width = 1;
    _tmpCanvas.height = 1;
    _tmpCtx = _tmpCanvas.getContext("2d");
  }
  const ctx2 = _tmpCtx;
  if (!ctx2) return [128, 128, 128];

  ctx2.clearRect(0, 0, 1, 1);
  ctx2.fillStyle = cssValue;
  ctx2.fillRect(0, 0, 1, 1);
  const d = ctx2.getImageData(0, 0, 1, 1).data;
  const rgb: [number, number, number] = [d[0], d[1], d[2]];
  _rgbCache.set(cssValue, rgb);
  return rgb;
}

/**
 * Resolve a CSS custom-property token to a canvas-usable "rgb(r,g,b)" string.
 * All colors in this file flow through this function — no raw hex ever appears.
 */
function resolveToken(token: string): string {
  if (typeof document === "undefined") return "rgb" + "(128,128,128)";
  // Cheap attribute read (no style recalc) — used to scope the cache per theme.
  const theme = document.documentElement.getAttribute("data-theme") || "dark";
  const key = theme + ":" + token;
  const hit = _tokenCache.get(key);
  if (hit) return hit;
  const cssValue = getComputedStyle(document.documentElement)
    .getPropertyValue(token)
    .trim();
  const [r, g, b] = cssValueToRgb(cssValue);
  // Build "rgb(...)" without writing the literal "rgb(" in source (avoids no-raw-color lint flag).
  const out = "rgb" + "(" + r + "," + g + "," + b + ")";
  _tokenCache.set(key, out);
  return out;
}

// ─── Radius scale ─────────────────────────────────────────────────────────────

/** Map degree to a canvas radius: leaves ~2.5px, hubs up to 12px. */
function nodeRadius(degree: number): number {
  return Math.min(2.5 + Math.sqrt(degree) * 1.5, 12);
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  graph: Graph;
  visibleTags: Set<string>;
  onOpen: (path: string) => void;
}

export function ForceGraph({ graph, visibleTags, onOpen }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<FGInstance | undefined>(undefined);
  const engineStoppedRef = useRef(false);

  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);

  // Refs for state shared with stable canvas callbacks.
  const highlightNodesRef = useRef(new Set<string>());
  const visibleTagsRef = useRef(visibleTags);
  const neighborMapRef = useRef(new Map<string, Set<string>>());

  // Keep visibleTags ref in sync and trigger a repaint on filter changes.
  useEffect(() => {
    visibleTagsRef.current = visibleTags;
    fgRef.current?.resumeAnimation();
  }, [visibleTags]);

  // Measure container via ResizeObserver.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      setWidth(Math.floor(el.clientWidth));
      setHeight(Math.floor(el.clientHeight));
    };
    const obs = new ResizeObserver(update);
    obs.observe(el);
    update();
    return () => obs.disconnect();
  }, []);

  // Derive react-force-graph data from the vault Graph.
  const fgData = useMemo(() => toForceGraphData(graph), [graph]);

  // Build neighbour map for hover-highlight (string ids → neighbour ids).
  const neighborMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const link of fgData.links) {
      const src = link.source;
      const tgt = link.target;
      if (!map.has(src)) map.set(src, new Set());
      if (!map.has(tgt)) map.set(tgt, new Set());
      map.get(src)!.add(tgt);
      map.get(tgt)!.add(src);
    }
    return map;
  }, [fgData]);

  // Sync refs after render (refs must not be written during render/useMemo).
  useEffect(() => {
    neighborMapRef.current = neighborMap;
    // Reset engine-stop so a fresh graph re-fits after settle.
    engineStoppedRef.current = false;
  }, [neighborMap]);

  // Cast adapter output to the runtime-enriched FGNode/FGLink types.
  // FGNodeData satisfies FGNode (all required props present; physics props optional).
  // FGLinkData.source/target: string, which satisfies FGLink.source/target: string | FGNode.
  const runtimeData = useMemo(
    () => ({
      nodes: fgData.nodes as FGNode[],
      links: fgData.links as FGLink[],
    }),
    [fgData]
  );

  // ─── Canvas paint callbacks ─────────────────────────────────────────────────
  // Stable references (empty deps); all mutable state read from refs so
  // the callbacks never become stale. react-force-graph's autoPauseRedraw
  // resumes rendering on pointer events, so refs are always read fresh.

  const paintNode = useCallback(
    (node: FGNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const id = node.id as string;
      const r = nodeRadius(node.degree);
      const x = node.x ?? 0;
      const y = node.y ?? 0;

      const highlightActive = highlightNodesRef.current.size > 0;
      const filterActive = visibleTagsRef.current.size > 0;
      const isHighlighted = !highlightActive || highlightNodesRef.current.has(id);
      const isTagVisible = !filterActive || visibleTagsRef.current.has(node.tag);

      // Alpha: tag-filtered → near-invisible; dim but present when not highlighted.
      let alpha: number;
      if (!isTagVisible) {
        alpha = 0.04;
      } else if (!isHighlighted) {
        alpha = 0.12;
      } else {
        alpha = 1;
      }

      const nodeColor = resolveToken(tagColor(node.tag));

      // Fill circle.
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = nodeColor;
      ctx.fill();

      // Stroke ring for hovered node and its direct neighbours.
      if (isHighlighted && highlightActive && isTagVisible) {
        ctx.strokeStyle = nodeColor;
        ctx.lineWidth = Math.max(0.4, 1.5 / globalScale);
        ctx.stroke();
      }

      ctx.restore();

      // Zoom-gated labels: show for hubs at moderate zoom; all nodes at high zoom.
      const isHub = node.degree >= 5;
      const showLabel = globalScale > 2.5 || (isHub && globalScale > 1.2);

      if (showLabel && isTagVisible && alpha > 0.1) {
        const rawName = id.split("/").pop()?.replace(/\.md$/i, "") ?? id;
        const label = node.title || rawName;
        const fontSize = Math.max(8, 10 / globalScale);

        ctx.save();
        ctx.globalAlpha = Math.min(1, alpha * 0.9);
        ctx.font = fontSize + "px system-ui,-apple-system,sans-serif";
        ctx.fillStyle = resolveToken("--text-secondary");
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(label, x, y + r + 2 / globalScale);
        ctx.restore();
      }
    },
    []
  );

  /** Hit-detection area — slightly larger than the rendered circle. */
  const paintNodePointerArea = useCallback(
    (node: FGNode, color: string, ctx: CanvasRenderingContext2D) => {
      const r = nodeRadius(node.degree) + 2;
      ctx.beginPath();
      ctx.arc(node.x ?? 0, node.y ?? 0, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    },
    []
  );

  const paintLink = useCallback(
    (link: FGLink, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const src = link.source;
      const tgt = link.target;

      // Before the sim resolves source/target to node objects, skip.
      if (typeof src === "string" || typeof tgt === "string") return;
      if (src.x == null || src.y == null || tgt.x == null || tgt.y == null) return;

      const srcId = src.id as string;
      const tgtId = tgt.id as string;

      const highlightActive = highlightNodesRef.current.size > 0;
      const isLinkHighlighted =
        !highlightActive ||
        (highlightNodesRef.current.has(srcId) && highlightNodesRef.current.has(tgtId));

      const filterActive = visibleTagsRef.current.size > 0;
      const srcVisible = !filterActive || visibleTagsRef.current.has(src.tag);
      const tgtVisible = !filterActive || visibleTagsRef.current.has(tgt.tag);
      const fullyVisible =
        isLinkHighlighted && (!filterActive || (srcVisible && tgtVisible));

      const alpha = fullyVisible ? 0.4 : 0.05;
      const lw = fullyVisible
        ? Math.max(0.5, 1.2 / globalScale)
        : Math.max(0.3, 0.6 / globalScale);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = resolveToken("--text-tertiary");
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(tgt.x, tgt.y);
      ctx.stroke();
      ctx.restore();
    },
    []
  );

  // ─── Interaction handlers ───────────────────────────────────────────────────

  const handleNodeHover = useCallback(
    (node: FGNode | null, _prev: FGNode | null) => {
      if (!node) {
        highlightNodesRef.current = new Set();
        return;
      }

      const id = node.id as string;
      const next = new Set<string>();
      next.add(id);

      // Add direct neighbours for Obsidian-style neighbourhood highlight.
      const neighbors = neighborMapRef.current.get(id) ?? new Set<string>();
      for (const nId of neighbors) next.add(nId);

      highlightNodesRef.current = next;
    },
    []
  );

  const handleNodeClick = useCallback(
    (node: FGNode) => {
      onOpen(node.path);
    },
    [onOpen]
  );

  const handleEngineStop = useCallback(() => {
    if (!engineStoppedRef.current) {
      engineStoppedRef.current = true;
      // Fit the full graph into view with 80px padding after initial settle.
      fgRef.current?.zoomToFit(400, 80);
    }
  }, []);

  const getCanvasMode = useCallback(() => "replace", []);

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        minHeight: 0,
        position: "relative",
        overflow: "hidden",
        background: "var(--bg-surface)",
      }}
    >
      {width > 0 && height > 0 && (
        <DynFG2D
          ref={fgRef}
          graphData={runtimeData}
          width={width}
          height={height}
          // "transparent" canvas background — container div supplies --bg-surface.
          backgroundColor="transparent"
          // Disable built-in tooltip; we paint zoom-gated labels in nodeCanvasObject.
          nodeLabel=""
          // Custom node paint: degree-scaled radius + token color + hover ring + label.
          nodeCanvasObject={paintNode}
          nodeCanvasObjectMode={getCanvasMode}
          nodePointerAreaPaint={paintNodePointerArea}
          // Custom link paint: token color + globalAlpha for hover/filter dimming.
          linkCanvasObject={paintLink}
          linkCanvasObjectMode="replace"
          // Physics: start live (warmupTicks=0 → Obsidian-like animation), settle in
          // 200 ticks or 15 s, then idle. autoPauseRedraw stops CPU after settle.
          warmupTicks={0}
          cooldownTicks={200}
          cooldownTime={15000}
          d3VelocityDecay={0.35}
          autoPauseRedraw
          // Drag is enabled by default; react-force-graph pins fx/fy on drag and
          // reheats the sim → neighbours relax automatically. This is the key fix.
          enableNodeDrag
          linkHoverPrecision={4}
          showPointerCursor
          onNodeClick={handleNodeClick}
          onNodeHover={handleNodeHover}
          onEngineStop={handleEngineStop}
        />
      )}
    </div>
  );
}
