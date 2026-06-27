"use client";

/**
 * CanvasView — read-only Obsidian Canvas (.canvas / JSONCanvas) renderer.
 *
 * Approach: absolutely-positioned DOM divs inside a CSS-transform pan/zoom
 * container + one SVG edge layer. This (vs <canvas>) lets MarkdownRenderer
 * work inside text nodes and lets node chrome use var(--…) tokens directly.
 *
 * Pan/zoom math mirrors GraphCanvas.tsx (viewRef, wheel-zoom-toward-cursor,
 * fit, keyboard).
 */

import { useCallback, useEffect, useId, useRef } from "react";
import { useRouter } from "next/navigation";
import { useCanvasContent } from "@/lib/hooks/useCanvasContent";
import { MarkdownRenderer } from "@/components/ui/MarkdownRenderer";
import { edgeAnchor } from "@/lib/canvas/parse-canvas";
import { resolveCanvasColor } from "@/lib/canvas/canvas-color";
import { fileKindForExt } from "@/lib/browse/file-kind";
import { PageShell, PageAction } from "@/components/PageShell";
import { Breadcrumbs } from "@/components/ui";
import { useSheet } from "@/lib/hooks/useSheet";
import { useVault } from "@/lib/hooks/useVault";
import type { CanvasNode, CanvasEdge, ParsedCanvas } from "@/lib/canvas/parse-canvas";

interface CanvasViewProps {
  filePath: string;
  onNavigate: (target: string, anchor?: string) => void;
}

// ─── Edge SVG layer ─────────────────────────────────────────────────────────

function EdgeLayer({ nodes, edges }: { nodes: CanvasNode[]; edges: CanvasEdge[] }) {
  const arrowId = useId();
  if (edges.length === 0) return null;

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  return (
    <svg
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: 0,
        height: 0,
        overflow: "visible",
        pointerEvents: "none",
        zIndex: 1,
      }}
      aria-hidden="true"
    >
      <defs>
        <marker
          id={arrowId}
          markerWidth={10}
          markerHeight={7}
          refX={9}
          refY={3.5}
          orient="auto"
        >
          <polygon
            points="0 0, 10 3.5, 0 7"
            style={{ fill: "var(--text-tertiary)" }}
          />
        </marker>
      </defs>
      {edges.map((edge) => {
        const fromNode = nodeMap.get(edge.fromNode);
        const toNode = nodeMap.get(edge.toNode);
        if (!fromNode || !toNode) return null;

        const from = edgeAnchor(fromNode, edge.fromSide, toNode);
        const to = edgeAnchor(toNode, edge.toSide, fromNode);

        const edgeColor = resolveCanvasColor(edge.color);

        return (
          <line
            key={edge.id}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            style={{
              stroke: edgeColor ?? "var(--border-standard)",
              strokeWidth: 1.5,
            }}
            markerEnd={edge.toEnd === "arrow" ? `url(#${arrowId})` : undefined}
          />
        );
      })}
    </svg>
  );
}

// ─── Individual node renderers ───────────────────────────────────────────────

function TextNodeCard({
  node,
  onNavigate,
}: {
  node: Extract<CanvasNode, { type: "text" }>;
  onNavigate: (target: string, anchor?: string) => void;
}) {
  const borderColor = resolveCanvasColor(node.color);
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "var(--bg-surface)",
        border: `1px solid ${borderColor ?? "var(--border-subtle)"}`,
        borderRadius: 8,
        overflow: "auto",
        padding: "8px 12px",
        boxSizing: "border-box",
        fontSize: 13,
      }}
    >
      <MarkdownRenderer content={node.text} onNavigate={onNavigate} />
    </div>
  );
}

function FileNodeCard({
  node,
  onNavigate,
}: {
  node: Extract<CanvasNode, { type: "file" }>;
  onNavigate: (target: string, anchor?: string) => void;
}) {
  const ext = node.file.split(".").pop()?.toLowerCase() ?? "";
  const kind = fileKindForExt(ext);
  const borderColor = resolveCanvasColor(node.color);
  const name = node.file.split("/").pop() ?? node.file;

  if (kind === "image") {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          border: `1px solid ${borderColor ?? "var(--border-subtle)"}`,
          borderRadius: 8,
          overflow: "hidden",
          boxSizing: "border-box",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/vault/asset?path=${encodeURIComponent(node.file)}`}
          alt={name}
          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
        />
      </div>
    );
  }

  // For markdown and other files: show an "Open" card
  const anchor = node.subpath ?? undefined;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "var(--bg-surface)",
        border: `1px solid ${borderColor ?? "var(--border-subtle)"}`,
        borderRadius: 8,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "8px 12px",
        boxSizing: "border-box",
        gap: 4,
        cursor: "pointer",
      }}
      onClick={() => onNavigate(node.file, anchor)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onNavigate(node.file, anchor); }}
    >
      <span style={{ fontSize: 11, color: "var(--text-quaternary)", fontFamily: "var(--font-mono)" }}>
        {ext.toUpperCase() || "FILE"}
      </span>
      <span style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500, wordBreak: "break-word" }}>
        {name}
      </span>
      {node.subpath && (
        <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
          {node.subpath}
        </span>
      )}
    </div>
  );
}

function LinkNodeCard({ node }: { node: Extract<CanvasNode, { type: "link" }> }) {
  const borderColor = resolveCanvasColor(node.color);
  let hostname = node.url;
  try { hostname = new URL(node.url).hostname; } catch { /* keep raw */ }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "var(--bg-surface)",
        border: `1px solid ${borderColor ?? "var(--border-subtle)"}`,
        borderRadius: 8,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "8px 12px",
        boxSizing: "border-box",
        gap: 4,
      }}
    >
      <span style={{ fontSize: 11, color: "var(--text-quaternary)" }}>URL</span>
      <a
        href={node.url}
        target="_blank"
        rel="noopener noreferrer"
        style={{ fontSize: 13, color: "var(--link)", wordBreak: "break-all" }}
      >
        {hostname}
      </a>
    </div>
  );
}

function GroupNodeFrame({ node }: { node: Extract<CanvasNode, { type: "group" }> }) {
  const borderColor = resolveCanvasColor(node.color);
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        border: `1px solid ${borderColor ?? "var(--border-standard)"}`,
        borderRadius: 8,
        boxSizing: "border-box",
        position: "relative",
        pointerEvents: "none",
      }}
    >
      {node.label && (
        <span
          style={{
            position: "absolute",
            top: 6,
            left: 8,
            fontSize: 11,
            color: borderColor ?? "var(--text-tertiary)",
            fontWeight: 600,
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          {node.label}
        </span>
      )}
    </div>
  );
}

function UnknownNodeCard({ node }: { node: Extract<CanvasNode, { type: "unknown" }> }) {
  const borderColor = resolveCanvasColor(node.color);
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "var(--bg-surface)",
        border: `1px dashed ${borderColor ?? "var(--border-subtle)"}`,
        borderRadius: 8,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxSizing: "border-box",
        fontSize: 11,
        color: "var(--text-quaternary)",
      }}
    >
      {String(node.raw.type ?? "unknown")}
    </div>
  );
}

// ─── Node dispatcher ─────────────────────────────────────────────────────────

function CanvasNodeView({
  node,
  onNavigate,
}: {
  node: CanvasNode;
  onNavigate: (target: string, anchor?: string) => void;
}) {
  const isGroup = node.type === "group";

  return (
    <div
      style={{
        position: "absolute",
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
        zIndex: isGroup ? 0 : 2,
      }}
    >
      {node.type === "text" && <TextNodeCard node={node} onNavigate={onNavigate} />}
      {node.type === "file" && <FileNodeCard node={node} onNavigate={onNavigate} />}
      {node.type === "link" && <LinkNodeCard node={node} />}
      {node.type === "group" && <GroupNodeFrame node={node} />}
      {node.type === "unknown" && <UnknownNodeCard node={node} />}
    </div>
  );
}

// ─── Canvas stage (data-driven) ──────────────────────────────────────────────

function CanvasStage({
  data,
  onNavigate,
}: {
  data: ParsedCanvas;
  onNavigate: (target: string, anchor?: string) => void;
}) {
  return (
    <>
      <EdgeLayer nodes={data.nodes} edges={data.edges} />
      {data.nodes.map((node) => (
        <CanvasNodeView key={node.id} node={node} onNavigate={onNavigate} />
      ))}
    </>
  );
}

// ─── Main CanvasView ─────────────────────────────────────────────────────────

export function CanvasView({ filePath, onNavigate }: CanvasViewProps) {
  const { data, loading, error } = useCanvasContent(filePath);

  const viewportRef = useRef<HTMLDivElement>(null);
  const transformLayerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef({ tx: 0, ty: 0, scale: 1 });
  const draggingRef = useRef<{ lastX: number; lastY: number } | null>(null);

  // Apply the current viewRef to the transform layer DOM node directly
  // to avoid re-renders on every pointer move / wheel event.
  const applyTransform = useCallback(() => {
    const el = transformLayerRef.current;
    if (!el) return;
    const { tx, ty, scale } = viewRef.current;
    el.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`;
  }, []);

  // Fit all nodes into the viewport on first load.
  const fitToView = useCallback(
    (canvas: ParsedCanvas) => {
      const viewport = viewportRef.current;
      if (!viewport || canvas.nodes.length === 0) return;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const n of canvas.nodes) {
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + n.width);
        maxY = Math.max(maxY, n.y + n.height);
      }
      const bw = maxX - minX;
      const bh = maxY - minY;
      const w = viewport.clientWidth;
      const h = viewport.clientHeight;
      const pad = 40;
      const scale =
        bw > 0 && bh > 0
          ? Math.min((w - pad * 2) / bw, (h - pad * 2) / bh, 2)
          : 1;
      viewRef.current = {
        scale,
        tx: w / 2 - ((minX + maxX) / 2) * scale,
        ty: h / 2 - ((minY + maxY) / 2) * scale,
      };
      applyTransform();
    },
    [applyTransform],
  );

  // Fit on mount when data arrives.
  useEffect(() => {
    if (data) fitToView(data);
  }, [data, fitToView]);

  // Wheel zoom toward cursor — mirror GraphCanvas.tsx:1000-1015.
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const viewport = viewportRef.current;
      if (!viewport) return;
      const rect = viewport.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const v = viewRef.current;
      const delta = -e.deltaY * 0.002;
      const nextScale = Math.max(0.1, Math.min(4, v.scale * (1 + delta)));
      const ratio = nextScale / v.scale;
      v.tx = mx - (mx - v.tx) * ratio;
      v.ty = my - (my - v.ty) * ratio;
      v.scale = nextScale;
      applyTransform();
    },
    [applyTransform],
  );

  // Attach wheel with {passive:false} so preventDefault works.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  // Keyboard: + / - zoom, arrows pan, f fit, Esc reset — mirror GraphCanvas.tsx:1060-1083.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      const v = viewRef.current;
      if (e.key === "+" || e.key === "=") {
        v.scale = Math.min(4, v.scale * 1.15);
        e.preventDefault();
      } else if (e.key === "-" || e.key === "_") {
        v.scale = Math.max(0.1, v.scale / 1.15);
        e.preventDefault();
      } else if (e.key === "ArrowLeft") {
        v.tx += 40;
      } else if (e.key === "ArrowRight") {
        v.tx -= 40;
      } else if (e.key === "ArrowUp") {
        v.ty += 40;
      } else if (e.key === "ArrowDown") {
        v.ty -= 40;
      } else if (e.key === "f" || e.key === "F") {
        if (data) fitToView(data);
        return;
      } else if (e.key === "Escape") {
        viewRef.current = { tx: 0, ty: 0, scale: 1 };
      } else {
        return;
      }
      applyTransform();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [applyTransform, fitToView, data]);

  // Pan via pointer drag on the viewport background.
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Only pan when clicking the viewport or transform layer background,
    // not on node content (which stops propagation implicitly via React).
    if (
      e.target !== viewportRef.current &&
      e.target !== transformLayerRef.current
    )
      return;
    draggingRef.current = { lastX: e.clientX, lastY: e.clientY };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      const dx = e.clientX - draggingRef.current.lastX;
      const dy = e.clientY - draggingRef.current.lastY;
      draggingRef.current.lastX = e.clientX;
      draggingRef.current.lastY = e.clientY;
      viewRef.current.tx += dx;
      viewRef.current.ty += dy;
      applyTransform();
    },
    [applyTransform],
  );

  const handlePointerUp = useCallback(() => {
    draggingRef.current = null;
  }, []);

  return (
    <div
      ref={viewportRef}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: "var(--bg-marketing)",
        cursor: "grab",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Loading / error states */}
      {loading && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-quaternary)",
            fontSize: 13,
          }}
        >
          Loading canvas…
        </div>
      )}
      {error && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--status-blocked)",
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {/* Transform layer — all nodes and edges live here */}
      <div
        ref={transformLayerRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          transformOrigin: "0 0",
          // Initial transform; updated imperatively by applyTransform()
          transform: "translate(0px,0px) scale(1)",
        }}
      >
        {data && <CanvasStage data={data} onNavigate={onNavigate} />}
      </div>

      {/* Keyboard hint overlay */}
      <div
        style={{
          position: "absolute",
          bottom: 12,
          left: 12,
          fontSize: 10,
          color: "var(--text-quaternary)",
          fontFamily: "var(--font-mono)",
          pointerEvents: "none",
          userSelect: "none",
          lineHeight: 1.6,
        }}
      >
        scroll to zoom · drag to pan · F fit · +/- zoom · ↑↓←→ pan
      </div>
    </div>
  );
}

// ─── CanvasFullPage — for /file/[...path] route ──────────────────────────────

export function CanvasFullPage({ path }: { path: string }) {
  const router = useRouter();
  const vault = useVault();
  const sheet = useSheet();
  const name = path.split("/").pop()?.replace(/\.canvas$/i, "") ?? path;

  const openObsidian = useCallback(() => {
    const vaultName = vault.name || "Obsidian";
    window.open(
      `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(path)}`,
      "_blank",
    );
  }, [path, vault.name]);

  const handleNavigate = useCallback(
    (target: string, anchor?: string) => {
      // A canvas can reference another canvas. The overlay sheet markdown-parses
      // whatever it opens, so route .canvas targets to the full /file route
      // (which short-circuits to CanvasFullPage) instead of the sheet.
      if (target.toLowerCase().endsWith(".canvas")) {
        router.push(`/file/${target.split("/").map(encodeURIComponent).join("/")}`);
        return;
      }
      sheet.open(target, anchor);
    },
    [sheet, router],
  );

  return (
    <PageShell
      title={name}
      actions={
        <PageAction label="Open in Obsidian" onClick={openObsidian}>
          <svg
            width={12}
            height={12}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </PageAction>
      }
      toolbar={
        <div style={{ flex: 1 }}>
          <Breadcrumbs
            path={path}
            onHome={() => router.push("/browse")}
            onSection={(query) => router.push(`/chat?q=${encodeURIComponent(query)}`)}
          />
        </div>
      }
    >
      <div style={{ height: "calc(100vh - 120px)", position: "relative" }}>
        <CanvasView filePath={path} onNavigate={handleNavigate} />
      </div>
    </PageShell>
  );
}
