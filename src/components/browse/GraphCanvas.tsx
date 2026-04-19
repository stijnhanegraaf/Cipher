"use client";

/**
 * Canvas-based force-directed graph renderer. Consumes Graph from
 * vault-graph; handles pan/zoom, hover highlights, click-to-open.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Graph, GraphEdge, GraphNode } from "@/lib/vault-graph";

// ─── GraphCanvas ──────────────────────────────────────────────────────
// Canvas-based force-directed graph for the active vault.
//
// Layout: hand-rolled O(n²) repulsion + Hooke spring on edges + weak
// centering force. Stable for vaults up to ~800 nodes; above that,
// consider swapping in d3-force or a Barnes-Hut quadtree.
//
// Interactions: click → onOpen(path); hover → label; drag → pan;
// wheel → zoom; +/- keys zoom; arrow keys pan; Esc resets; f fits.

interface Props {
  graph: Graph;
  onOpen: (path: string) => void;
  /** Active filter set — if provided, nodes whose folder is not in the set fade to 0.15. */
  visibleFolders?: Set<string>;
  /** When true, show only disconnected (zero-edge) nodes. */
  orphansOnly?: boolean;
  /** Name-substring filter. Case-insensitive on node title/id. */
  searchTerm?: string;
}

interface SimNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  /** in + out links; precomputed so repulsion + centering can weight by it. */
  degree: number;
  /** Per-node charge for degree-weighted repulsion. Hubs push harder. */
  charge: number;
  /** Deterministic 0..7 folder slot for coloring. */
  slot: number;
  /** Breathing phase (0..2π), hashed from id; used by draw(). */
  phase: number;
}

// Deterministic 8-slot folder palette. Dark/light variants resolved at draw-time.
const FOLDER_SLOTS = [
  { dark: "#818CF8", light: "#6366F1" }, // indigo
  { dark: "#C4B5FD", light: "#A78BFA" }, // violet
  { dark: "#6EE7B7", light: "#34D399" }, // emerald
  { dark: "#FBBF24", light: "#F59E0B" }, // amber
  { dark: "#F472B6", light: "#EC4899" }, // pink
  { dark: "#67E8F9", light: "#06B6D4" }, // cyan
  { dark: "#94A3B8", light: "#64748B" }, // slate
  { dark: "#FCA5A5", light: "#F87171" }, // rose
] as const;

function folderSlot(folder: string): number {
  const key = folder.split("/")[0] || "root";
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 8;
}

function hashPhase(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  return (Math.abs(h) % 6283) / 1000; // 0..~2π
}

/**
 * Canvas-rendered force-directed vault graph.
 *
 * Runs a silent pre-settle pass (~120 ticks) on mount so the initial
 * paint lands close to steady state, then drives a degree-weighted
 * Barnes-Hut-style repulsion + spring simulation on rAF. `visibleFolders`
 * filters which nodes participate; `orphansOnly` restricts to zero-link
 * nodes; `searchTerm` dims non-matches. Click a node to fire `onOpen`.
 */
export function GraphCanvas({ graph, onOpen, visibleFolders, orphansOnly, searchTerm }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [legendFilter, setLegendFilter] = useState<number | null>(null);
  const [legendHover, setLegendHover] = useState<number | null>(null);

  // View transform (pan + zoom). stored in a ref so the animation loop
  // can read it without triggering re-renders.
  const viewRef = useRef({ tx: 0, ty: 0, scale: 1 });
  const simNodesRef = useRef<SimNode[]>([]);
  const simEdgesRef = useRef<GraphEdge[]>([]);
  const tickCountRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const draggingRef = useRef<{ kind: "pan" | "node"; id?: string; lastX: number; lastY: number } | null>(null);
  const mouseRef = useRef<{ x: number; y: number } | null>(null);
  const inhaleRef = useRef(0); // 0 → 1 over 300ms on mount
  const pulseRef = useRef<{ id: string; startedAt: number; echoStartedAt: number } | null>(null);
  const mountTimeRef = useRef<number>(0);
  // Holds the latest `draw` so the rAF loop doesn't call a stale closure.
  const drawRef = useRef<() => void>(() => {});
  const reducedMotionRef = useRef(false);
  const cometsRef = useRef<{ edgeKey: string; source: string; target: string; startedAt: number }[]>([]);
  const prevHoveredRef = useRef<string | null>(null);
  const cameraRef = useRef<{
    from: { tx: number; ty: number; scale: number };
    to: { tx: number; ty: number; scale: number };
    startedAt: number;
    duration: number;
    direction: "enter" | "exit";
  } | null>(null);
  const focusLayoutRef = useRef<Map<string, { tx: number; ty: number }> | null>(null);
  const simulationFrozenRef = useRef(false);
  const preFocusViewRef = useRef<{ tx: number; ty: number; scale: number } | null>(null);
  const rippleRef = useRef<{ x: number; y: number; startedAt: number } | null>(null);

  // Which nodes are "active" given filters. ids not in this set render faded.
  const activeIds = useMemo(() => {
    const set = new Set<string>();
    for (const n of graph.nodes) {
      if (visibleFolders && visibleFolders.size > 0 && !visibleFolders.has(n.folder)) continue;
      if (orphansOnly && (n.backlinks + n.outlinks) > 0) continue;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        if (!n.title.toLowerCase().includes(q) && !n.id.toLowerCase().includes(q)) continue;
      }
      set.add(n.id);
    }
    return set;
  }, [graph.nodes, visibleFolders, orphansOnly, searchTerm]);

  // Map each slot to the human-readable folder names that landed in it.
  const slotLabels = useMemo(() => {
    const map = new Map<number, Set<string>>();
    for (const n of graph.nodes) {
      const s = folderSlot(n.folder);
      const label = n.folder.split("/")[0] || "root";
      if (!map.has(s)) map.set(s, new Set());
      map.get(s)!.add(label);
    }
    return map;
  }, [graph.nodes]);

  const focusLinks = useMemo(() => {
    if (!focusId) return null;
    const backlinks: string[] = [];
    const outlinks: string[] = [];
    for (const e of graph.edges) {
      if (e.target === focusId) backlinks.push(e.source);
      else if (e.source === focusId) outlinks.push(e.target);
    }
    const node = graph.nodes.find((n) => n.id === focusId) ?? null;
    return { backlinks, outlinks, node };
  }, [focusId, graph.edges, graph.nodes]);

  const [expandedBacklinks, setExpandedBacklinks] = useState(false);
  const [expandedOutlinks, setExpandedOutlinks] = useState(false);

  // Reset expansion when focus changes.
  useEffect(() => {
    setExpandedBacklinks(false);
    setExpandedOutlinks(false);
  }, [focusId]);

  // Inject the HUD entry animation keyframes once.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const id = "graph-hud-keyframes";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `
      @keyframes graph-hud-in {
        from { opacity: 0; transform: translateY(-4px); }
        to   { opacity: 1; transform: translateY(0); }
      }
    `;
    document.head.appendChild(style);
  }, []);

  // ── Initialize simulation on graph change ────────────────────────
  // Gated on a non-zero container rect via ResizeObserver, because on mount
  // the flex layout hasn't settled yet and clientWidth/Height read 0.
  // Running init at 0×0 seeded the simulation inside a collapsed viewport,
  // which is what made /browse/graph paint blank.
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let inited = false;

    const initSimulation = (w: number, h: number) => {
      const simNodes: SimNode[] = graph.nodes.map((n, i) => {
        const angle = (i / graph.nodes.length) * Math.PI * 2;
        const r = 50 + ((i * 97) % 200);
        const degree = n.backlinks + n.outlinks;
        return {
          ...n,
          x: w / 2 + Math.cos(angle) * r,
          y: h / 2 + Math.sin(angle) * r,
          vx: 0,
          vy: 0,
          radius: Math.max(1.2, Math.min(5, 1.2 + Math.sqrt(n.backlinks) * 0.7)),
          degree,
          charge: 130 + Math.sqrt(degree) * 80,
          slot: folderSlot(n.folder),
          phase: hashPhase(n.id),
        };
      });
      simNodesRef.current = simNodes;
      simEdgesRef.current = graph.edges;
      tickCountRef.current = 0;
      viewRef.current = { tx: 0, ty: 0, scale: 1 };

      // Pre-settle to equilibrium before first paint.
      for (let i = 0; i < 900; i++) {
        step();
        if (i > 120 && i % 25 === 0) {
          let energy = 0;
          for (const n of simNodes) energy += n.vx * n.vx + n.vy * n.vy;
          if (energy < 0.015) break;
        }
      }
      for (const n of simNodes) { n.vx = 0; n.vy = 0; }
    };

    const startFadeLoop = () => {
      mountTimeRef.current = performance.now();
      inhaleRef.current = 0;
      const FADE_MS = 500;
      const fade = () => {
        const now = performance.now();
        const t = Math.min(1, (now - mountTimeRef.current) / FADE_MS);
        inhaleRef.current = 1 - Math.pow(1 - t, 3);
        drawRef.current();
        if (t < 1) {
          rafRef.current = requestAnimationFrame(fade);
        } else {
          inhaleRef.current = 1;
          const idle = () => {
            const now2 = performance.now();
            const reduced = reducedMotionRef.current;
            if (!pulseRef.current && !reduced) {
              // At 60fps, 0.0014 ≈ one hit per 12s.
              if (Math.random() < 0.0014) {
                const candidates = simNodesRef.current.filter((n) => n.backlinks >= 3);
                if (candidates.length > 0) {
                  const pick = candidates[Math.floor(Math.random() * candidates.length)];
                  pulseRef.current = { id: pick.id, startedAt: now2, echoStartedAt: now2 + 200 };
                }
              }
            } else if (pulseRef.current) {
              const age = now2 - pulseRef.current.startedAt;
              // Primary 600ms + echo offset 200ms + echo 600ms = 800ms total.
              if (age > 900) pulseRef.current = null;
            }
            drawRef.current();
            rafRef.current = requestAnimationFrame(idle);
          };
          rafRef.current = requestAnimationFrame(idle);
        }
      };
      rafRef.current = requestAnimationFrame(fade);
    };

    const tryInit = () => {
      if (inited) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      inited = true;
      initSimulation(w, h);
      startFadeLoop();
    };

    // Fire as soon as the browser has painted — covers the common case
    // where the container already has real dimensions before ResizeObserver
    // emits its first entry.
    const raf = requestAnimationFrame(tryInit);

    const ro = new ResizeObserver(tryInit);
    ro.observe(container);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph]);

  // ── Resize handling ──────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const resize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // ── Force simulation step ────────────────────────────────────────
  const step = useCallback(() => {
    if (simulationFrozenRef.current) return;
    const nodes = simNodesRef.current;
    const edges = simEdgesRef.current;
    const container = containerRef.current;
    if (!container || nodes.length === 0) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    const centerX = w / 2;
    const centerY = h / 2;

    // Build a fast id→node lookup once per step.
    const byId = new Map<string, SimNode>();
    for (const n of nodes) byId.set(n.id, n);

    // 1. Repulsion + collision in one O(n²) pass.
    //    Hubs push harder (degree-weighted charge). Nodes that would
    //    overlap get forcibly separated — no geometry overlap at rest,
    //    the exact thing that makes Obsidian's clusters read.
    const COLLIDE_PAD = 1;
    const REPULSION_NORM = 22000; // tuned for 150 + sqrt(degree) * 90 charge
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distSq = dx * dx + dy * dy + 0.01;
        const dist = Math.sqrt(distSq);
        const minDist = a.radius + b.radius + COLLIDE_PAD;

        if (dist < minDist) {
          // Collision: push apart so they just touch. Splits 50/50.
          const push = (minDist - dist) * 0.5;
          const nx = dx / dist;
          const ny = dy / dist;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
        } else {
          // Degree-weighted Coulomb-like repulsion.
          const force = (a.charge * b.charge) / REPULSION_NORM / distSq;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          a.vx -= fx;
          a.vy -= fy;
          b.vx += fx;
          b.vy += fy;
        }
      }
    }

    // 2. Spring force on edges. Short rest length + stiff — linked pairs
    //    snap together tight, forming dense clusters.
    const TARGET = 30;
    const STIFFNESS = 0.10;
    for (const e of edges) {
      const a = byId.get(e.source);
      const b = byId.get(e.target);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
      const force = (dist - TARGET) * STIFFNESS;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }

    // 3. Centering — weaker than before, so the connected cluster can settle
    //    into its natural asymmetric shape. Orphans get reversed centering
    //    below a radius threshold, which drifts them out to form the
    //    Obsidian-style outer ring.
    const CENTER = 0.006;
    const ORPHAN_MIN_R = Math.min(w, h) * 0.22;
    for (const n of nodes) {
      if (n.degree === 0) {
        const dx = n.x - centerX;
        const dy = n.y - centerY;
        const r2 = dx * dx + dy * dy;
        if (r2 < ORPHAN_MIN_R * ORPHAN_MIN_R && r2 > 0.01) {
          // Push gently outward from center.
          const d = Math.sqrt(r2);
          n.vx += (dx / d) * 0.3;
          n.vy += (dy / d) * 0.3;
        } else {
          // Far enough out — keep a minimal inward pull so they don't drift forever.
          n.vx += (centerX - n.x) * 0.002;
          n.vy += (centerY - n.y) * 0.002;
        }
      } else {
        n.vx += (centerX - n.x) * CENTER;
        n.vy += (centerY - n.y) * CENTER;
      }
    }

    // 4. Integrate with damping. Cap |v| per step — high-degree hubs
    //    (26+ edges) accumulate spring forces that are individually stable
    //    but together exceed the Euler-integration stability threshold,
    //    making positions explode to NaN within a few hundred ticks of
    //    the pre-settle pass. Clamping velocity keeps the visual motion
    //    identical at rest while guaranteeing bounded integration.
    const DAMPING = 0.82;
    const MAX_V = 40;
    for (const n of nodes) {
      n.vx *= DAMPING;
      n.vy *= DAMPING;
      const speed = Math.hypot(n.vx, n.vy);
      if (speed > MAX_V) {
        const k = MAX_V / speed;
        n.vx *= k;
        n.vy *= k;
      }
      n.x += n.vx;
      n.y += n.vy;
    }
  }, []);

  const computeFocusLayout = useCallback((selectedId: string) => {
    const nodes = simNodesRef.current;
    const edges = simEdgesRef.current;
    const container = containerRef.current;
    if (!container) return null;
    const byId = new Map<string, SimNode>();
    for (const n of nodes) byId.set(n.id, n);
    const selected = byId.get(selectedId);
    if (!selected) return null;

    const backlinks: SimNode[] = [];
    const outlinks: SimNode[] = [];
    for (const e of edges) {
      if (e.target === selectedId) {
        const n = byId.get(e.source);
        if (n && !backlinks.includes(n)) backlinks.push(n);
      } else if (e.source === selectedId) {
        const n = byId.get(e.target);
        if (n && !outlinks.includes(n)) outlinks.push(n);
      }
    }

    const sortByDegree = (a: SimNode, b: SimNode) => (b.outlinks + b.backlinks) - (a.outlinks + a.backlinks);
    backlinks.sort(sortByDegree);
    outlinks.sort(sortByDegree);

    const h = container.clientHeight;
    const layout = new Map<string, { tx: number; ty: number }>();
    layout.set(selectedId, { tx: selected.x, ty: selected.y });

    const place = (list: SimNode[], xOffset: number) => {
      const spacing = Math.max(36, h / (list.length + 1));
      list.forEach((n, i) => {
        const jitter = ((n.id.charCodeAt(0) % 17) - 8);
        const ty = selected.y + (i - (list.length - 1) / 2) * spacing;
        const tx = selected.x + xOffset + jitter;
        layout.set(n.id, { tx, ty });
      });
    };
    place(backlinks, -220);
    place(outlinks, 220);

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const pos of layout.values()) {
      minX = Math.min(minX, pos.tx);
      minY = Math.min(minY, pos.ty);
      maxX = Math.max(maxX, pos.tx);
      maxY = Math.max(maxY, pos.ty);
    }
    const w = container.clientWidth;
    const bw = Math.max(1, maxX - minX);
    const bh = Math.max(1, maxY - minY);
    const fitScale = Math.min((w * 0.7) / bw, (h * 0.7) / bh, 2.5);
    const scale = Math.max(0.8, fitScale);
    const tx = w / 2 - selected.x * scale;
    const ty = h / 2 - selected.y * scale;

    return { layout, camera: { tx, ty, scale } };
  }, []);

  const enterFocus = useCallback((id: string, clickX: number, clickY: number) => {
    const result = computeFocusLayout(id);
    if (!result) return;
    const reduced = reducedMotionRef.current;
    preFocusViewRef.current = { ...viewRef.current };
    cameraRef.current = {
      from: { ...viewRef.current },
      to: result.camera,
      startedAt: performance.now(),
      duration: reduced ? 100 : 400,
      direction: "enter",
    };
    focusLayoutRef.current = result.layout;
    simulationFrozenRef.current = true;
    setFocusId(id);
    if (!reduced) {
      rippleRef.current = { x: clickX, y: clickY, startedAt: performance.now() };
    }
  }, [computeFocusLayout]);

  const exitFocus = useCallback((clickX?: number, clickY?: number) => {
    const reduced = reducedMotionRef.current;
    const back = preFocusViewRef.current ?? { tx: 0, ty: 0, scale: 1 };
    cameraRef.current = {
      from: { ...viewRef.current },
      to: back,
      startedAt: performance.now(),
      duration: reduced ? 100 : 300,
      direction: "exit",
    };
    setFocusId(null);
    if (!reduced && clickX !== undefined && clickY !== undefined) {
      rippleRef.current = { x: clickX, y: clickY, startedAt: performance.now() };
    }
    const dur = reduced ? 100 : 300;
    setTimeout(() => {
      focusLayoutRef.current = null;
      simulationFrozenRef.current = false;
      preFocusViewRef.current = null;
    }, dur + 20);
  }, []);

  // ── Render ───────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Advance camera glide, if active.
    if (cameraRef.current) {
      const cam = cameraRef.current;
      const tRaw = Math.min(1, (performance.now() - cam.startedAt) / cam.duration);
      const e = 1 - Math.pow(1 - tRaw, 3);
      viewRef.current = {
        tx: cam.from.tx + (cam.to.tx - cam.from.tx) * e,
        ty: cam.from.ty + (cam.to.ty - cam.from.ty) * e,
        scale: cam.from.scale + (cam.to.scale - cam.from.scale) * e,
      };
      if (tRaw >= 1) cameraRef.current = null;
    }

    const w = container.clientWidth;
    const h = container.clientHeight;
    const { tx, ty, scale } = viewRef.current;
    const nodes = simNodesRef.current;
    const edges = simEdgesRef.current;

    // Theme-aware cosmic palette.
    const style = getComputedStyle(document.documentElement);
    const isLight = document.documentElement.classList.contains("light");

    const bgStart = isLight ? "#fafaf5" : "#0b0e18";
    const bgEnd   = isLight ? "#f0f0ea" : "#05060a";
    const colStar        = isLight ? "rgba(74,81,102,0.85)"  : "rgba(168,178,209,0.85)";
    const colStarBright  = isLight ? "#23252a"              : "#ffffff";
    const colStarHub     = isLight ? (style.getPropertyValue("--accent-brand").trim() || "#5e6ad2") : "#ffffff";
    const colRay         = isLight ? "rgba(94,106,210,0.20)" : "rgba(180,200,255,0.18)";
    const colRayHover    = isLight ? "rgba(94,106,210,0.70)" : "rgba(200,220,255,0.70)";
    const colAccent      = style.getPropertyValue("--accent-brand").trim() || "#5e6ad2";
    const colLabel       = style.getPropertyValue("--text-primary").trim() || "#f7f8f8";
    const colTooltipBg   = style.getPropertyValue("--bg-tooltip").trim() || "#0d0e0f";

    // Clear then paint a calm, nearly-flat backdrop with one subtle vignette.
    ctx.clearRect(0, 0, w, h);
    const grd = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.75);
    grd.addColorStop(0, bgStart);
    grd.addColorStop(1, bgEnd);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);

    // Apply pan+zoom.
    ctx.save();
    ctx.translate(tx, ty);
    ctx.scale(scale, scale);

    // Edges first (so nodes draw on top).
    const byId = new Map<string, SimNode>();
    for (const n of nodes) byId.set(n.id, n);

    // Inhale: opacity-only fade 0 → 1 over 400ms. Layout is pre-settled so
    // nodes don't fly; they just appear. No scale component — that felt chaotic.
    const inhaleScale = 1;
    const inhaleAlpha = inhaleRef.current;

    // Focus neighbors — computed once per frame when focus is active.
    const neighborSet = focusId ? getOneHopNeighbors(focusId, edges) : null;

    const nowPerf = performance.now();
    const interpFocus = (node: SimNode): [number, number] => {
      const layoutF = focusLayoutRef.current;
      const tgt = layoutF?.get(node.id);
      if (!tgt) return [node.x, node.y];
      if (cameraRef.current) {
        const tRaw = Math.min(1, (nowPerf - cameraRef.current.startedAt) / cameraRef.current.duration);
        const eCurve = 1 - Math.pow(1 - tRaw, 3);
        if (cameraRef.current.direction === "enter") {
          return [node.x + (tgt.tx - node.x) * eCurve, node.y + (tgt.ty - node.y) * eCurve];
        }
        return [tgt.tx + (node.x - tgt.tx) * eCurve, tgt.ty + (node.y - tgt.ty) * eCurve];
      }
      return [tgt.tx, tgt.ty];
    };

    ctx.lineWidth = 0.4 / scale;
    for (const e of edges) {
      const a = byId.get(e.source);
      const b = byId.get(e.target);
      if (!a || !b) continue;
      const isConnected = hoveredId && (a.id === hoveredId || b.id === hoveredId);
      const aActive = activeIds.size === 0 || activeIds.has(a.id);
      const bActive = activeIds.size === 0 || activeIds.has(b.id);
      const alpha = isConnected ? 1 : (aActive && bActive ? 1 : 0.12);
      // Focus dimming — edges not touching the focused node fade back.
      let edgeFocusMul = 1;
      if (focusId) {
        const inFocus = a.id === focusId || b.id === focusId;
        if (!inFocus) edgeFocusMul = 0.15;
      }
      ctx.strokeStyle = isConnected ? colRayHover : colRay;
      ctx.lineWidth = isConnected ? 0.6 / scale : 0.4 / scale;
      ctx.globalAlpha = alpha * inhaleAlpha * edgeFocusMul;
      const [ax, ay] = interpFocus(a);
      const [bx, by] = interpFocus(b);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Comet trails — consume cometsRef, drop finished entries.
    if (!reducedMotionRef.current && cometsRef.current.length > 0) {
      const alive: typeof cometsRef.current = [];
      for (const c of cometsRef.current) {
        const t = (nowPerf - c.startedAt) / 600;
        if (t >= 1) continue;
        const a = byId.get(c.source);
        const b = byId.get(c.target);
        if (!a || !b) continue;
        const [ax, ay] = interpFocus(a);
        const [bx, by] = interpFocus(b);
        const headX = ax + (bx - ax) * t;
        const headY = ay + (by - ay) * t;
        const tailT = Math.max(0, t - 0.06);
        const tailX = ax + (bx - ax) * tailT;
        const tailY = ay + (by - ay) * tailT;
        const alpha = Math.sin(t * Math.PI);
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(headX, headY);
        ctx.strokeStyle = colAccent;
        ctx.lineWidth = 1.4 / scale;
        ctx.globalAlpha = alpha * inhaleAlpha;
        ctx.stroke();
        alive.push(c);
      }
      cometsRef.current = alive;
      ctx.globalAlpha = 1;
    }

    // Nodes.
    const pulse = pulseRef.current;
    for (const n of nodes) {
      const active = activeIds.size === 0 || activeIds.has(n.id);
      const hovered = n.id === hoveredId;
      const selected = n.id === selectedId;
      const isHub = n.backlinks >= 8;
      const isBright = !isHub && n.backlinks >= 3;

      // Idle pulse — subtle opacity bump on the node itself.
      let pulseMul = 1;
      if (pulse && pulse.id === n.id) {
        const age = (nowPerf - pulse.startedAt) / 600;
        if (age >= 0 && age <= 1) pulseMul = 0.85 + 0.15 * Math.sin(age * Math.PI);
      }

      // Focus dimming — nodes outside the focused subgraph fade back.
      let focusAlpha = 1;
      if (focusId && neighborSet) {
        if (n.id !== focusId && !neighborSet.has(n.id)) focusAlpha = 0.05;
      }

      // Breathing — per-node phased sine, zero amplitude under reduced motion.
      const breatheAmp = reducedMotionRef.current
        ? 0
        : Math.min(0.18, 0.02 + Math.log(n.backlinks + 1) * 0.04);
      const breathe = 1 + Math.sin(nowPerf * 0.002 * Math.PI + n.phase) * breatheAmp;
      const displayR = n.radius * inhaleScale * breathe;

      const [nx, ny] = interpFocus(n);

      ctx.beginPath();
      ctx.arc(nx, ny, displayR, 0, Math.PI * 2);

      const isOrphan = n.degree === 0;
      const slot = FOLDER_SLOTS[n.slot];
      const slotColor = isLight ? slot.light : slot.dark;
      const orphanColor = style.getPropertyValue("--text-quaternary").trim() || (isLight ? "#9aa0a6" : "#6b7280");

      if (hovered || selected) {
        ctx.fillStyle = colAccent;
        ctx.shadowColor = colAccent;
        ctx.shadowBlur = 18;
      } else if (isOrphan) {
        ctx.fillStyle = orphanColor;
        ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = slotColor;
        ctx.shadowColor = slotColor;
        ctx.shadowBlur = isHub ? 14 : isBright ? 6 : 0;
      }

      const effectiveSlotFilter = legendHover ?? legendFilter;
      const slotMul = effectiveSlotFilter === null ? 1 : (n.slot === effectiveSlotFilter ? 1 : 0.15);
      ctx.globalAlpha = (active ? 1 : 0.15) * inhaleAlpha * pulseMul * focusAlpha * slotMul * 0.85;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Slot ring (skip for orphans, skip when selected — selected draws brand ring).
      if (!isOrphan && !selected) {
        ctx.beginPath();
        ctx.arc(nx, ny, displayR + 0.8 / scale, 0, Math.PI * 2);
        ctx.strokeStyle = hovered
          ? (isLight ? "rgba(0,0,0,0.8)" : "rgba(255,255,255,1)")
          : slotColor;
        ctx.lineWidth = 1 / scale;
        ctx.globalAlpha = (active ? 1 : 0.15) * inhaleAlpha * focusAlpha * slotMul;
        ctx.stroke();
      }

      if (selected) {
        ctx.beginPath();
        ctx.arc(nx, ny, displayR + 4 / scale, 0, Math.PI * 2);
        ctx.strokeStyle = colAccent;
        ctx.globalAlpha = 0.4 * inhaleAlpha;
        ctx.lineWidth = 2 / scale;
        ctx.stroke();
      }

      // Dual-ring hub pulse expansion (folder-tinted).
      if (pulse && pulse.id === n.id) {
        const slotBase = FOLDER_SLOTS[n.slot];
        const pulseColor = isLight ? slotBase.light : slotBase.dark;

        const t1 = (nowPerf - pulse.startedAt) / 600;
        if (t1 >= 0 && t1 <= 1) {
          const r1 = displayR + 32 * t1;
          const a1 = 0.45 * (1 - t1);
          ctx.beginPath();
          ctx.arc(nx, ny, r1, 0, Math.PI * 2);
          ctx.strokeStyle = pulseColor;
          ctx.globalAlpha = a1 * inhaleAlpha;
          ctx.lineWidth = 1.2 / scale;
          ctx.stroke();
        }
        const t2 = (nowPerf - pulse.echoStartedAt) / 600;
        if (t2 >= 0 && t2 <= 1) {
          const r2 = displayR + 20 * t2;
          const a2 = 0.25 * (1 - t2);
          ctx.beginPath();
          ctx.arc(nx, ny, r2, 0, Math.PI * 2);
          ctx.strokeStyle = pulseColor;
          ctx.globalAlpha = a2 * inhaleAlpha;
          ctx.lineWidth = 1 / scale;
          ctx.stroke();
        }
      }

      ctx.globalAlpha = 1;
    }

    ctx.restore();

    // Label overlay for hovered node (screen-space, stays crisp at any zoom).
    if (hoveredId) {
      const n = byId.get(hoveredId);
      if (n) {
        // Use focus-layout position when active, so the label tracks the animated node.
        const layout = focusLayoutRef.current;
        const target = layout?.get(n.id);
        const liveX = target && !cameraRef.current ? target.tx : n.x;
        const liveY = target && !cameraRef.current ? target.ty : n.y;
        const sx = liveX * scale + tx;
        const sy = liveY * scale + ty;
        const label = n.title;
        ctx.font = '500 13px Inter, system-ui, sans-serif';
        const metrics = ctx.measureText(label);
        const padX = 10;
        const padY = 6;
        const boxW = metrics.width + padX * 2;
        const boxH = 26;
        // Prefer right of node; flip to left if it would clip the canvas.
        let boxX = sx + n.radius * scale + 10;
        if (boxX + boxW > w - 8) boxX = sx - n.radius * scale - 10 - boxW;
        const boxY = sy - boxH / 2;
        // Subtle drop shadow so label reads on any background.
        ctx.save();
        ctx.shadowColor = isLight ? "rgba(0,0,0,0.08)" : "rgba(0,0,0,0.5)";
        ctx.shadowBlur = 12;
        ctx.shadowOffsetY = 2;
        ctx.fillStyle = colTooltipBg;
        ctx.globalAlpha = 0.96;
        roundRect(ctx, boxX, boxY, boxW, boxH, 6);
        ctx.fill();
        ctx.restore();
        // Hairline border for definition.
        ctx.strokeStyle = isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)";
        ctx.lineWidth = 1;
        roundRect(ctx, boxX + 0.5, boxY + 0.5, boxW - 1, boxH - 1, 6);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = colLabel;
        ctx.textBaseline = "middle";
        ctx.textAlign = "left";
        ctx.fillText(label, boxX + padX, boxY + boxH / 2 + 0.5);
      }
    }
  }, [hoveredId, selectedId, activeIds, focusId, legendFilter, legendHover]);

  // Keep drawRef pointing at the latest draw so the rAF loop (which is
  // created once per `graph` change) always renders with current state.
  useEffect(() => {
    drawRef.current = draw;
  }, [draw]);

  // On hover-enter, seed one comet per incident edge (cap 30).
  useEffect(() => {
    const prev = prevHoveredRef.current;
    prevHoveredRef.current = hoveredId;
    if (!hoveredId || hoveredId === prev) return;
    if (reducedMotionRef.current) return;
    const now = performance.now();
    const edges = simEdgesRef.current;
    const incident = edges.filter((e) => e.source === hoveredId || e.target === hoveredId).slice(0, 30);
    for (const e of incident) {
      cometsRef.current.push({
        edgeKey: `${e.source}->${e.target}`,
        source: e.source,
        target: e.target,
        startedAt: now,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoveredId]);

  function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function getOneHopNeighbors(nodeId: string, edges: GraphEdge[]): Set<string> {
    const set = new Set<string>();
    for (const e of edges) {
      if (e.source === nodeId) set.add(e.target);
      else if (e.target === nodeId) set.add(e.source);
    }
    return set;
  }

  // ── Hit-testing ──────────────────────────────────────────────────
  const pickNode = useCallback((mx: number, my: number): SimNode | null => {
    const { tx, ty, scale } = viewRef.current;
    const x = (mx - tx) / scale;
    const y = (my - ty) / scale;
    // Iterate in reverse so topmost node wins.
    const nodes = simNodesRef.current;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      const dx = n.x - x;
      const dy = n.y - y;
      if (dx * dx + dy * dy <= (n.radius + 4) * (n.radius + 4)) return n;
    }
    return null;
  }, []);

  // ── Pointer handlers ─────────────────────────────────────────────
  const getRel = useCallback((e: PointerEvent | React.PointerEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    const { x, y } = getRel(e);
    const hit = pickNode(x, y);
    if (hit) {
      draggingRef.current = { kind: "node", id: hit.id, lastX: x, lastY: y };
    } else {
      draggingRef.current = { kind: "pan", lastX: x, lastY: y };
    }
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const { x, y } = getRel(e);
    mouseRef.current = { x, y };
    const drag = draggingRef.current;
    if (!drag) {
      // Hover hit-test only.
      const hit = pickNode(x, y);
      const id = hit?.id ?? null;
      if (id !== hoveredId) setHoveredId(id);
      return;
    }
    const dx = x - drag.lastX;
    const dy = y - drag.lastY;
    drag.lastX = x;
    drag.lastY = y;
    if (drag.kind === "pan") {
      viewRef.current.tx += dx;
      viewRef.current.ty += dy;
    } else if (drag.kind === "node" && drag.id) {
      const n = simNodesRef.current.find((x) => x.id === drag.id);
      if (n) {
        const { scale } = viewRef.current;
        n.x += dx / scale;
        n.y += dy / scale;
        // Pin briefly by zeroing velocity while dragging.
        n.vx = 0; n.vy = 0;
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const drag = draggingRef.current;
    const { x, y } = getRel(e);
    draggingRef.current = null;
    (e.target as Element).releasePointerCapture(e.pointerId);
    if (drag && drag.kind === "node" && drag.id) {
      const moved = Math.hypot(x - drag.lastX, y - drag.lastY);
      if (moved < 4) {
        setSelectedId(drag.id);
        const clickedId = drag.id;

        if (focusId === null) {
          enterFocus(clickedId, x, y);
        } else if (focusId === clickedId) {
          exitFocus(x, y);
        } else {
          const connected = simEdgesRef.current.some(
            (edge) => (edge.source === focusId && edge.target === clickedId)
              || (edge.target === focusId && edge.source === clickedId),
          );
          if (connected) {
            enterFocus(clickedId, x, y);
          }
        }
      }
    }
  };

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const v = viewRef.current;
    const delta = -e.deltaY * 0.002;
    const nextScale = Math.max(0.3, Math.min(4, v.scale * (1 + delta)));
    const ratio = nextScale / v.scale;
    // Zoom toward mouse.
    v.tx = mx - (mx - v.tx) * ratio;
    v.ty = my - (my - v.ty) * ratio;
    v.scale = nextScale;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  // Reduced-motion gate. Re-read live so toggling the OS preference
  // updates every motion channel on the next frame.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => { reducedMotionRef.current = mq.matches; };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Keyboard: + / - zoom, arrows pan, f fit, Esc reset.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const v = viewRef.current;
      if (e.key === "+" || e.key === "=") { v.scale = Math.min(4, v.scale * 1.15); e.preventDefault(); }
      else if (e.key === "-" || e.key === "_") { v.scale = Math.max(0.3, v.scale / 1.15); e.preventDefault(); }
      else if (e.key === "ArrowLeft") v.tx += 40;
      else if (e.key === "ArrowRight") v.tx -= 40;
      else if (e.key === "ArrowUp") v.ty += 40;
      else if (e.key === "ArrowDown") v.ty -= 40;
      else if (e.key === "f" || e.key === "F") fitToView();
      else if (e.key === "Escape") {
        if (focusId) {
          exitFocus();
          e.preventDefault();
          return;
        }
        viewRef.current = { tx: 0, ty: 0, scale: 1 };
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusId, exitFocus]);

  const fitToView = useCallback(() => {
    const container = containerRef.current;
    const nodes = simNodesRef.current;
    if (!container || nodes.length === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.x - n.radius);
      minY = Math.min(minY, n.y - n.radius);
      maxX = Math.max(maxX, n.x + n.radius);
      maxY = Math.max(maxY, n.y + n.radius);
    }
    const bw = maxX - minX;
    const bh = maxY - minY;
    const w = container.clientWidth;
    const h = container.clientHeight;
    const pad = 40;
    const scale = Math.min((w - pad * 2) / bw, (h - pad * 2) / bh, 2);
    viewRef.current = {
      scale,
      tx: w / 2 - ((minX + maxX) / 2) * scale,
      ty: h / 2 - ((minY + maxY) / 2) * scale,
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        flex: "1 1 0%",
        minHeight: 0,
        width: "100%",
        height: "100%",
        background: "var(--bg-marketing)",
        overflow: "hidden",
        cursor: hoveredId ? "pointer" : draggingRef.current?.kind === "pan" ? "grabbing" : "default",
      }}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => { setHoveredId(null); mouseRef.current = null; }}
        onDoubleClick={(e) => {
          const canvas = canvasRef.current;
          if (!canvas) return;
          const rect = canvas.getBoundingClientRect();
          const hit = pickNode(e.clientX - rect.left, e.clientY - rect.top);
          if (hit) onOpen(hit.id);
        }}
        style={{ display: "block", touchAction: "none" }}
      />
      {/* Legend chip — 8 folder-slot dots */}
      <div
        style={{
          position: "absolute",
          bottom: 12,
          left: 16,
          display: "flex",
          gap: 2,
          alignItems: "center",
          zIndex: 3,
        }}
      >
        {FOLDER_SLOTS.map((slot, i) => {
          const color = typeof document !== "undefined" && document.documentElement.classList.contains("light") ? slot.light : slot.dark;
          const folders = Array.from(slotLabels.get(i) ?? []).join(" · ") || "(empty)";
          const pressed = legendFilter === i;
          return (
            <button
              key={i}
              type="button"
              aria-label={`Filter to ${folders}`}
              aria-pressed={pressed}
              title={folders}
              onPointerEnter={() => setLegendHover(i)}
              onPointerLeave={() => setLegendHover(null)}
              onClick={() => setLegendFilter((prev) => (prev === i ? null : i))}
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: color,
                border: "none",
                padding: 0,
                margin: 0,
                cursor: "pointer",
                outline: pressed ? `1.5px solid var(--accent-brand)` : "none",
                outlineOffset: 2,
                opacity: legendFilter === null || pressed ? 1 : 0.4,
              }}
            />
          );
        })}
      </div>
      {/* Keyboard hint */}
      <div
        className="mono-label"
        style={{
          position: "absolute",
          bottom: 12,
          left: 120,
          color: "var(--text-quaternary)",
          letterSpacing: "0.04em",
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        drag · scroll to zoom · ↑↓←→ pan · f fit · esc reset
      </div>
      {focusLinks && focusLinks.node && typeof document !== "undefined"
        ? createPortal(
            <div
              role="region"
              aria-live="polite"
              style={{
                position: "fixed",
                top: 12,
                right: 12,
                width: 260,
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 10,
                boxShadow: "var(--shadow-dialog)",
                padding: 12,
                zIndex: 5,
                animation: "graph-hud-in 180ms ease-out",
              }}
            >
              <div className="mono-label" style={{ color: "var(--text-quaternary)", marginBottom: 8 }}>
                FOCUSED · {focusLinks.backlinks.length} backlinks · {focusLinks.outlinks.length} outlinks
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {focusLinks.node.title}
                  </div>
                  <div className="caption-large" style={{ color: "var(--text-quaternary)", marginTop: 2 }}>
                    {focusLinks.node.folder || "root"}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Open in sheet"
                  onClick={() => onOpen(focusLinks.node!.id)}
                  style={{
                    border: "1px solid var(--border-subtle)",
                    background: "transparent",
                    color: "var(--text-secondary)",
                    borderRadius: 6,
                    padding: "4px 8px",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  ↗
                </button>
              </div>

              <div style={{ borderTop: "1px solid var(--border-subtle)", margin: "10px 0" }} />

              {(["backlinks", "outlinks"] as const).map((kind) => {
                const list = kind === "backlinks" ? focusLinks.backlinks : focusLinks.outlinks;
                const expanded = kind === "backlinks" ? expandedBacklinks : expandedOutlinks;
                const setExpanded = kind === "backlinks" ? setExpandedBacklinks : setExpandedOutlinks;
                if (list.length === 0) return null;
                const shown = expanded ? list : list.slice(0, 4);
                return (
                  <div key={kind} style={{ marginBottom: kind === "backlinks" ? 10 : 0 }}>
                    <div className="mono-label" style={{ color: "var(--text-quaternary)", marginBottom: 4 }}>
                      {kind === "backlinks" ? "LINKED FROM" : "LINKS TO"}
                    </div>
                    {shown.map((id) => {
                      const basename = id.split("/").pop()?.replace(/\.md$/i, "") ?? id;
                      return (
                        <button
                          key={id}
                          type="button"
                          className="app-row"
                          aria-label={`Focus on ${basename}`}
                          onClick={() => {
                            const rect = containerRef.current?.getBoundingClientRect();
                            const cx = rect ? rect.width / 2 : 0;
                            const cy = rect ? rect.height / 2 : 0;
                            enterFocus(id, cx, cy);
                          }}
                          onDoubleClick={() => onOpen(id)}
                          style={{
                            display: "block",
                            width: "100%",
                            textAlign: "left",
                            border: "none",
                            background: "transparent",
                            color: "var(--text-secondary)",
                            padding: "4px 6px",
                            borderRadius: 4,
                            cursor: "pointer",
                            fontSize: 13,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          · {basename}
                        </button>
                      );
                    })}
                    {list.length > 4 && !expanded ? (
                      <button
                        type="button"
                        onClick={() => setExpanded(true)}
                        style={{
                          border: "none",
                          background: "transparent",
                          color: "var(--text-quaternary)",
                          cursor: "pointer",
                          padding: "2px 6px",
                          fontSize: 12,
                        }}
                      >
                        (+{list.length - 4} more ↓)
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
