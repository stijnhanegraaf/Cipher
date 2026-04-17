"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
}

export function GraphCanvas({ graph, onOpen, visibleFolders, orphansOnly, searchTerm }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);

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
  const pulseRef = useRef<{ id: string; startedAt: number } | null>(null);
  const mountTimeRef = useRef<number>(0);

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

  // ── Initialize simulation on graph change ────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const w = container.clientWidth;
    const h = container.clientHeight;

    const simNodes: SimNode[] = graph.nodes.map((n, i) => {
      // Deterministic pseudo-random initial positions clustered near center.
      const angle = (i / graph.nodes.length) * Math.PI * 2;
      const r = 50 + ((i * 97) % 200);
      return {
        ...n,
        x: w / 2 + Math.cos(angle) * r,
        y: h / 2 + Math.sin(angle) * r,
        vx: 0,
        vy: 0,
        radius: Math.max(1.5, Math.min(6, 1.5 + Math.sqrt(n.backlinks) * 0.8)),
      };
    });
    simNodesRef.current = simNodes;
    simEdgesRef.current = graph.edges;
    tickCountRef.current = 0;
    viewRef.current = { tx: 0, ty: 0, scale: 1 };
    mountTimeRef.current = performance.now();
    inhaleRef.current = 0;

    // Kick off the animation loop.
    const tick = () => {
      step();
      const now = performance.now();
      const inhaleElapsed = now - mountTimeRef.current;
      inhaleRef.current = Math.min(1, inhaleElapsed / 300);

      // Idle pulse — start a new one every ~4s if none active.
      if (!pulseRef.current && inhaleRef.current >= 1) {
        if (Math.random() < 0.012) {
          // Pick a random bright or hub node.
          const candidates = simNodesRef.current.filter((n) => n.backlinks >= 3);
          if (candidates.length > 0) {
            const pick = candidates[Math.floor(Math.random() * candidates.length)];
            pulseRef.current = { id: pick.id, startedAt: now };
          }
        }
      } else if (pulseRef.current) {
        const age = now - pulseRef.current.startedAt;
        if (age > 600) pulseRef.current = null;
      }

      draw();
      tickCountRef.current++;
      // Run ~400 ticks for layout to settle, then keep drawing on interactions only.
      if (tickCountRef.current < 400) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        // Keep a light idle loop to redraw for hover/zoom state and idle pulses.
        const idle = () => {
          const now2 = performance.now();
          if (!pulseRef.current) {
            if (Math.random() < 0.012) {
              const candidates = simNodesRef.current.filter((n) => n.backlinks >= 3);
              if (candidates.length > 0) {
                const pick = candidates[Math.floor(Math.random() * candidates.length)];
                pulseRef.current = { id: pick.id, startedAt: now2 };
              }
            }
          } else {
            const age = now2 - pulseRef.current.startedAt;
            if (age > 600) pulseRef.current = null;
          }
          draw();
          rafRef.current = requestAnimationFrame(idle);
        };
        rafRef.current = requestAnimationFrame(idle);
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
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

    // 1. Repulsion — O(n²), fine for <800 nodes.
    const REPULSION = 900;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distSq = dx * dx + dy * dy + 0.01;
        const dist = Math.sqrt(distSq);
        const force = REPULSION / distSq;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx -= fx;
        a.vy -= fy;
        b.vx += fx;
        b.vy += fy;
      }
    }

    // 2. Spring force on edges (Hooke's law toward target distance).
    const TARGET = 70;
    const STIFFNESS = 0.05;
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

    // 3. Weak centering force to prevent drift.
    const CENTER = 0.01;
    for (const n of nodes) {
      n.vx += (centerX - n.x) * CENTER;
      n.vy += (centerY - n.y) * CENTER;
    }

    // 4. Integrate with damping.
    const DAMPING = 0.88;
    for (const n of nodes) {
      n.vx *= DAMPING;
      n.vy *= DAMPING;
      n.x += n.vx;
      n.y += n.vy;
    }
  }, []);

  // ── Render ───────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
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

    // Clear then paint cosmic backdrop.
    ctx.clearRect(0, 0, w, h);
    const grd = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
    grd.addColorStop(0, bgStart);
    grd.addColorStop(1, bgEnd);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);

    // Nebula wash — two soft radials.
    const nebulaA = ctx.createRadialGradient(w * 0.35, h * 0.6, 0, w * 0.35, h * 0.6, w * 0.4);
    nebulaA.addColorStop(0, isLight ? "rgba(94,106,210,0.12)" : "rgba(120,100,200,0.15)");
    nebulaA.addColorStop(1, "transparent");
    ctx.fillStyle = nebulaA;
    ctx.fillRect(0, 0, w, h);
    const nebulaB = ctx.createRadialGradient(w * 0.65, h * 0.4, 0, w * 0.65, h * 0.4, w * 0.4);
    nebulaB.addColorStop(0, isLight ? "rgba(120,160,220,0.10)" : "rgba(90,130,220,0.12)");
    nebulaB.addColorStop(1, "transparent");
    ctx.fillStyle = nebulaB;
    ctx.fillRect(0, 0, w, h);

    // Apply pan+zoom.
    ctx.save();
    ctx.translate(tx, ty);
    ctx.scale(scale, scale);

    // Edges first (so nodes draw on top).
    const byId = new Map<string, SimNode>();
    for (const n of nodes) byId.set(n.id, n);

    // Inhale: nodes scale from 0.5 → 1 and edges fade in 0 → 1 over 300ms.
    const inhaleScale = 0.5 + 0.5 * inhaleRef.current;
    const inhaleAlpha = inhaleRef.current;

    // Focus neighbors — computed once per frame when focus is active.
    const neighborSet = focusId ? getOneHopNeighbors(focusId, edges) : null;

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
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Nodes.
    const pulse = pulseRef.current;
    const nowPerf = performance.now();
    for (const n of nodes) {
      const active = activeIds.size === 0 || activeIds.has(n.id);
      const hovered = n.id === hoveredId;
      const selected = n.id === selectedId;
      const isHub = n.backlinks >= 8;
      const isBright = !isHub && n.backlinks >= 3;

      // Idle pulse — if this node is pulsing, multiply opacity by a sine bump.
      let pulseMul = 1;
      if (pulse && pulse.id === n.id) {
        const age = (nowPerf - pulse.startedAt) / 600;
        pulseMul = 0.8 + 0.2 * Math.sin(age * Math.PI);
      }

      // Focus dimming — nodes outside the focused subgraph fade back.
      let focusAlpha = 1;
      if (focusId && neighborSet) {
        if (n.id !== focusId && !neighborSet.has(n.id)) focusAlpha = 0.1;
      }

      ctx.beginPath();
      ctx.arc(n.x, n.y, n.radius * inhaleScale, 0, Math.PI * 2);

      if (hovered || selected) {
        ctx.fillStyle = colAccent;
        ctx.shadowColor = colAccent;
        ctx.shadowBlur = 12;
      } else if (isHub) {
        ctx.fillStyle = colStarHub;
        ctx.shadowColor = isLight ? "rgba(94,106,210,0.5)" : "rgba(200,220,255,0.9)";
        ctx.shadowBlur = 8;
      } else if (isBright) {
        ctx.fillStyle = colStarBright;
        ctx.shadowColor = isLight ? "rgba(94,106,210,0.35)" : "rgba(200,220,255,0.9)";
        ctx.shadowBlur = 4;
      } else {
        ctx.fillStyle = colStar;
        ctx.shadowBlur = 0;
      }

      ctx.globalAlpha = (active ? 1 : 0.15) * inhaleAlpha * pulseMul * focusAlpha;
      ctx.fill();
      ctx.shadowBlur = 0;

      if (selected) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius * inhaleScale + 4 / scale, 0, Math.PI * 2);
        ctx.strokeStyle = colAccent;
        ctx.globalAlpha = 0.4 * inhaleAlpha;
        ctx.lineWidth = 2 / scale;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    // Label overlay for hovered node (not scaled, stays crisp at any zoom).
    if (hoveredId) {
      const n = byId.get(hoveredId);
      if (n) {
        const sx = n.x * scale + tx;
        const sy = n.y * scale + ty;
        const label = n.title;
        ctx.font = '500 12px Inter, system-ui, sans-serif';
        const metrics = ctx.measureText(label);
        const pad = 6;
        const boxW = metrics.width + pad * 2;
        const boxH = 22;
        const boxX = sx + n.radius * scale + 8;
        const boxY = sy - boxH / 2;
        ctx.fillStyle = colTooltipBg;
        ctx.globalAlpha = 0.95;
        roundRect(ctx, boxX, boxY, boxW, boxH, 4);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = colLabel;
        ctx.textBaseline = "middle";
        ctx.fillText(label, boxX + pad, boxY + boxH / 2);
      }
    }
  }, [hoveredId, selectedId, activeIds, focusId]);

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
      // If pointer didn't move much, treat as a click.
      const moved = Math.hypot(x - drag.lastX, y - drag.lastY);
      if (moved < 4) {
        setSelectedId(drag.id);
        onOpen(drag.id);
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
          setFocusId(null);
          e.preventDefault();
          return;
        }
        viewRef.current = { tx: 0, ty: 0, scale: 1 };
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

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
      className="relative flex-1"
      style={{
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
          if (hit) setFocusId(hit.id);
        }}
        style={{ display: "block", touchAction: "none" }}
      />
      {/* Keyboard hint */}
      <div
        className="mono-label"
        style={{
          position: "absolute",
          bottom: 12,
          left: 16,
          color: "var(--text-quaternary)",
          letterSpacing: "0.04em",
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        drag · scroll to zoom · ↑↓←→ pan · f fit · esc reset
      </div>
    </div>
  );
}
