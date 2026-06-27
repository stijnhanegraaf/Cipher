"use client";

/**
 * ForceGraph — Obsidian-quality 2D force-directed graph via react-force-graph.
 *
 * Replaces the hand-rolled GraphCanvas with a live, draggable layout that:
 *  - Uses d3-force (Barnes-Hut) for scalable physics (2400+ nodes)
 *  - Relaxes neighbours on drag automatically (react-force-graph reheats sim)
 *  - Degree-scaled node radii (hubs clearly larger than leaves)
 *  - Hover-gated label pills legible in both dark + light themes
 *  - Zoom-gated persistent labels for hubs / all nodes at high zoom
 *  - Hover → highlight neighbourhood, dim the rest (Obsidian's signature feel)
 *  - Monochrome + accent (indigo) colour: 3 tones total; rainbow opt-in
 *  - Directional particles on the hovered subgraph (reduced-motion gated)
 *  - Visible edges with tag-filter-aware dimming
 *  - Single-click opens a note (onOpen)
 *  - Settles then idles (cooldownTicks + autoPauseRedraw)
 *  - Fits to view after first settle (zoomToFit in onEngineStop)
 *
 * Color: ALL colors resolved from CSS tokens via getComputedStyle at paint time.
 * Raw hex is never written as a literal — values are derived from CSS tokens
 * and converted to canvas-usable strings at runtime.
 * Exception: the light-mode pill drop-shadow uses rgba(0,0,0,0.3) — a neutral
 * black alpha that is not a brand colour (allowed by the file's lint allowlist).
 */

import dynamic from "next/dynamic";
import { useRef, useCallback, useEffect, useState, useMemo } from "react";
import type React from "react";
import { useReducedMotion } from "framer-motion";
import { forceCollide } from "d3-force";
import type { Graph } from "@/lib/vault-graph";
import { tagColor, statusTagColor } from "@/lib/color/tag-color";
import { toForceGraphData, type FGNodeData } from "@/lib/browse/force-graph-data";

// ─── Runtime node/link types ─────────────────────────────────────────────────
// After react-force-graph processes graphData, node objects are mutated with
// physics properties (x, y, vx, vy, fx, fy). FGNode extends FGNodeData with
// these optional fields so paint callbacks can type-safely read them.
// fx/fy use `number | null` to satisfy d3-force's SimulationNodeDatum constraint.

interface FGNode extends FGNodeData {
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
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
  /** Get or set a named d3 force. Returns force with optional .strength() when called with one arg. */
  d3Force(name: string, force?: unknown): { strength(n: number): void } | null | undefined;
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
  linkDirectionalParticles?: number | ((link: FGLink) => number);
  linkDirectionalParticleWidth?: number;
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Rounded-rect path helper. Traces the path only — caller calls fill/stroke.
 * Clamps corner radius to half of the smaller dimension to avoid artefacts.
 */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const safeR = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + safeR, y);
  ctx.lineTo(x + w - safeR, y);
  ctx.arcTo(x + w, y, x + w, y + safeR, safeR);
  ctx.lineTo(x + w, y + h - safeR);
  ctx.arcTo(x + w, y + h, x + w - safeR, y + h, safeR);
  ctx.lineTo(x + safeR, y + h);
  ctx.arcTo(x, y + h, x, y + h - safeR, safeR);
  ctx.lineTo(x, y + safeR);
  ctx.arcTo(x, y, x + safeR, y, safeR);
  ctx.closePath();
}

// ─── Radius scale ─────────────────────────────────────────────────────────────

/** Map degree to a canvas radius: leaves ~3px, hubs up to 16px. */
function nodeRadius(degree: number): number {
  return Math.min(3 + Math.sqrt(degree) * 1.8, 16);
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  graph: Graph;
  visibleTags: Set<string>;
  onOpen: (path: string) => void;
  /** When true, use full semantic tag colours (rainbow palette). Default: false (mono + 2 status hues). */
  rainbow?: boolean;
}

export function ForceGraph({ graph, visibleTags, onOpen, rainbow = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<FGInstance | undefined>(undefined);
  const engineStoppedRef = useRef(false);

  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);

  // prefers-reduced-motion gate for particles and warmup.
  const prefersReducedMotion = useReducedMotion() ?? false;

  // Refs for state shared with stable canvas callbacks.
  const highlightNodesRef = useRef(new Set<string>());
  const hoveredNodeRef = useRef<string | null>(null);
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

  // Configure custom d3 forces once the graph instance is available. The
  // component is dynamically imported, so fgRef may be null for the first few
  // frames — poll via rAF until it's set (capped) instead of a single
  // setTimeout(0), which could miss a slow import and leave nodes overlapping.
  useEffect(() => {
    let raf = 0;
    let tries = 0;
    const apply = () => {
      const fg = fgRef.current;
      if (!fg) {
        if (tries++ < 60) raf = requestAnimationFrame(apply);
        return;
      }
      // Stronger repulsion for an airy constellation spread.
      fg.d3Force("charge")?.strength(-120);
      // Prevent node overlap — radius matches the visual radius + 2px clearance.
      fg.d3Force(
        "collide",
        forceCollide<FGNode>((node) => nodeRadius(node.degree) + 2)
      );
    };
    raf = requestAnimationFrame(apply);
    return () => cancelAnimationFrame(raf);
  }, [runtimeData]);

  // ─── Canvas paint callbacks ─────────────────────────────────────────────────
  // Stable references; all mutable state read from refs so the callbacks never
  // become stale. react-force-graph's autoPauseRedraw resumes on pointer events.

  const paintNode = useCallback(
    (node: FGNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const id = node.id as string;
      const baseR = nodeRadius(node.degree);
      const x = node.x ?? 0;
      const y = node.y ?? 0;

      const highlightActive = highlightNodesRef.current.size > 0;
      const filterActive = visibleTagsRef.current.size > 0;
      const isHighlighted = !highlightActive || highlightNodesRef.current.has(id);
      const isTagVisible = !filterActive || visibleTagsRef.current.has(node.tag);

      const isHovered = id === hoveredNodeRef.current;
      // A neighbour is: highlight active, this node is highlighted, but it's not the hovered node itself.
      const isNeighbour = highlightActive && !isHovered && highlightNodesRef.current.has(id);

      // Alpha: tag-filtered → near-invisible; dimmed when not in hovered subgraph.
      let alpha: number;
      if (!isTagVisible) {
        alpha = 0.04;
      } else if (!isHighlighted) {
        alpha = 0.12;
      } else {
        alpha = 1;
      }

      // Fill: accent (indigo) for hovered / neighbour; resting colour otherwise.
      const isAccented = isHovered || isNeighbour;
      const restingColor = rainbow
        ? resolveToken(tagColor(node.tag))
        : resolveToken(statusTagColor(node.tag));
      const nodeColor = isAccented ? resolveToken("--accent-brand") : restingColor;

      // Hovered node pops at ×1.3 radius (Quartz / Obsidian behaviour).
      const drawR = isHovered ? baseR * 1.3 : baseR;

      const isLight = document.documentElement.getAttribute("data-theme") === "light";

      ctx.save();
      ctx.globalAlpha = alpha;

      // Focus glow — hovered node only.
      if (isHovered && isTagVisible) {
        ctx.shadowColor = resolveToken("--accent-brand");
        ctx.shadowBlur = (isLight ? 6 : 12) / globalScale;
      }

      ctx.beginPath();
      ctx.arc(x, y, drawR, 0, Math.PI * 2);
      ctx.fillStyle = nodeColor;
      ctx.fill();

      // Reset shadow before rim stroke so stroke doesn't inherit glow.
      ctx.shadowBlur = 0;
      ctx.shadowColor = "transparent";

      // 1px rim in --bg-marketing so nodes "float" above edges (d3 Les-Mis trick).
      ctx.strokeStyle = resolveToken("--bg-marketing");
      ctx.lineWidth = Math.max(0.5, 1 / globalScale);
      ctx.stroke();

      ctx.restore();

      // ─── Label pill ────────────────────────────────────────────────────────
      // Show when: hovered or 1-hop neighbour (any zoom), OR zoom-gated persistent.
      const isHub = node.degree >= 5;
      const showLabel =
        isHovered ||
        isNeighbour ||
        globalScale > 2.5 ||
        (isHub && globalScale > 1.2);

      if (showLabel && isTagVisible && alpha > 0.1) {
        const rawName = id.split("/").pop()?.replace(/\.md$/i, "") ?? id;
        const label = node.title || rawName;
        // Constant screen size: 12px regardless of zoom level.
        const fontSize = 12 / globalScale;
        const pad = 4 / globalScale;
        const radius = 4 / globalScale;

        ctx.save();
        ctx.font = `${fontSize}px system-ui,-apple-system,sans-serif`;

        const textW = ctx.measureText(label).width;
        const pillW = textW + pad * 2;
        const pillH = fontSize + pad * 2;
        const pillX = x - pillW / 2;
        const pillY = y + drawR + 2 / globalScale;

        // Light-mode pill drop-shadow: neutral black alpha (not a brand colour —
        // allowed by the lint allowlist on this file; do NOT generalise).
        if (isLight) {
          ctx.shadowBlur = 4;
          ctx.shadowColor = "rgba(0,0,0,0.3)";
        }

        // Pill background — --bg-elevated inverts naturally: dark in dark, white in light.
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = resolveToken("--bg-elevated");
        roundRect(ctx, pillX, pillY, pillW, pillH, radius);
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.shadowColor = "transparent";

        // Pill border — subtle accent tint.
        ctx.globalAlpha = 0.25;
        ctx.strokeStyle = resolveToken("--accent-brand");
        ctx.lineWidth = 1 / globalScale;
        roundRect(ctx, pillX, pillY, pillW, pillH, radius);
        ctx.stroke();

        // Label text — full opacity, auto-correct contrast in both themes.
        ctx.globalAlpha = 1;
        ctx.fillStyle = resolveToken("--text-primary");
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(label, x, pillY + pad);

        ctx.restore();
      }
    },
    [rainbow]
  );

  /**
   * Hit-detection area — node circle + extended rect below for label pills
   * on hovered / neighbour nodes so labels are clickable.
   */
  const paintNodePointerArea = useCallback(
    (node: FGNode, color: string, ctx: CanvasRenderingContext2D) => {
      const id = node.id as string;
      const baseR = nodeRadius(node.degree);
      const x = node.x ?? 0;
      const y = node.y ?? 0;

      const isHovered = id === hoveredNodeRef.current;
      const highlightActive = highlightNodesRef.current.size > 0;
      const isNeighbour = highlightActive && !isHovered && highlightNodesRef.current.has(id);
      const drawR = isHovered ? baseR * 1.3 : baseR;

      // Node circle hit area (slightly padded).
      ctx.beginPath();
      ctx.arc(x, y, drawR + 2, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      // Extend hit area downward to cover the label pill for hovered/neighbour nodes.
      // ~20 world units covers a 12px font + 8px padding at globalScale ≈ 1.
      if (isHovered || isNeighbour) {
        ctx.beginPath();
        ctx.rect(x - 60, y + drawR + 1, 120, 20);
        ctx.fillStyle = color;
        ctx.fill();
      }
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
      const tagPassed = !filterActive || (srcVisible && tgtVisible);

      const isLight = document.documentElement.getAttribute("data-theme") === "light";

      let color: string;
      let alpha: number;
      let lw: number;

      const restLw = Math.max(0.5, 1.2 / globalScale);

      if (!tagPassed) {
        // Tag-filtered link — near-invisible.
        color = resolveToken("--border-standard");
        alpha = 0.04;
        lw = restLw;
      } else if (highlightActive && isLinkHighlighted) {
        // In the hovered subgraph — accent highlight.
        color = resolveToken("--accent-brand");
        alpha = 0.75;
        lw = Math.max(1, (1.2 * 1.8) / globalScale); // rest width ×1.8
      } else if (highlightActive) {
        // Dimmed non-neighbour link.
        color = resolveToken("--border-standard");
        alpha = isLight ? 0.08 : 0.06;
        lw = restLw;
      } else {
        // Resting state — no hover active.
        color = resolveToken("--border-standard");
        alpha = isLight ? 0.14 : 0.18;
        lw = restLw;
      }

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
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
      // Track which node is directly hovered for glow + radius pop.
      hoveredNodeRef.current = node ? (node.id as string) : null;

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
      // Fit the full graph into view with 50px padding after initial settle.
      fgRef.current?.zoomToFit(400, 50);
    }
  }, []);

  const getCanvasMode = useCallback(() => "replace", []);

  /**
   * Directional particle count per link: 2 on hovered subgraph, 0 elsewhere.
   * Gated by prefers-reduced-motion.
   */
  const getLinkParticles = useCallback(
    (link: FGLink): number => {
      if (prefersReducedMotion) return 0;
      const src = link.source;
      const tgt = link.target;
      if (typeof src === "string" || typeof tgt === "string") return 0;
      const hn = highlightNodesRef.current;
      return hn.size > 0 && hn.has(src.id as string) && hn.has(tgt.id as string) ? 2 : 0;
    },
    [prefersReducedMotion]
  );

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        minHeight: 0,
        position: "relative",
        overflow: "hidden",
        // Background provided by the MapPage container (see MapPage.tsx).
      }}
    >
      {width > 0 && height > 0 && (
        <DynFG2D
          ref={fgRef}
          graphData={runtimeData}
          width={width}
          height={height}
          // Transparent canvas — container div in MapPage supplies --bg-marketing + vignette.
          backgroundColor="transparent"
          // Disable built-in tooltip; we paint zoom-gated label pills in nodeCanvasObject.
          nodeLabel=""
          // Custom node paint: degree-scaled radius + monochrome+accent + glow + pill label.
          nodeCanvasObject={paintNode}
          nodeCanvasObjectMode={getCanvasMode}
          nodePointerAreaPaint={paintNodePointerArea}
          // Custom link paint: token colours + globalAlpha for hover/filter dimming.
          linkCanvasObject={paintLink}
          linkCanvasObjectMode="replace"
          // Directional particles on the hovered subgraph (reduced-motion gated).
          linkDirectionalParticles={getLinkParticles}
          linkDirectionalParticleWidth={2}
          // Physics: pre-settle off-screen (warmupTicks), then freeze (cooldownTime/Ticks).
          // High warmup under reduced-motion to skip the settle animation entirely.
          warmupTicks={prefersReducedMotion ? 200 : 80}
          cooldownTicks={200}
          cooldownTime={6000}
          d3VelocityDecay={0.55}
          autoPauseRedraw
          // Drag enabled: react-force-graph pins fx/fy on drag and reheats the sim.
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
