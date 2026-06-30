"use client";

/**
 * /browse/graph page — owns mode state (Graph ↔ Structure), fetches
 * /api/vault/graph once, hands the payload to whichever child view is active.
 * Mode persists to localStorage["cipher-map-mode-v1"].
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { ForceGraph } from "@/components/browse/ForceGraph";
import { GraphLegend, type TagCount } from "@/components/browse/GraphLegend";
import { MapModeToggle, type MapMode } from "@/components/browse/MapModeToggle";
import { StructureColumns } from "@/components/browse/StructureColumns";
import { useSheet } from "@/lib/hooks/useSheet";
import type { Graph } from "@/lib/vault-graph";

const MODE_STORAGE_KEY = "cipher-map-mode-v1";

function readInitialMode(): MapMode {
  if (typeof window === "undefined") return "graph";
  const v = window.localStorage.getItem(MODE_STORAGE_KEY);
  return v === "structure" ? "structure" : "graph";
}

export function MapPage() {
  const sheet = useSheet();
  const [graph, setGraph] = useState<Graph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<MapMode>("graph");
  const [visibleTags, setVisibleTags] = useState<Set<string>>(new Set());
  const [rainbow, setRainbow] = useState(false);

  // Hydrate mode on mount (avoids SSR mismatch by starting with "graph").
  useEffect(() => {
    setMode(readInitialMode());
  }, []);

  // Persist mode changes.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(MODE_STORAGE_KEY, mode);
  }, [mode]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/vault/graph");
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || `Graph fetch failed (${res.status})`);
        }
        const payload: Graph = await res.json();
        if (!cancelled) setGraph(payload);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load graph");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Derive sorted tag list from graph nodes (by count desc, then name asc).
  const tagCounts = useMemo((): TagCount[] => {
    if (!graph) return [];
    const counts = new Map<string, number>();
    for (const n of graph.nodes) {
      const t = n.tag ?? "";
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }, [graph]);

  const handleTagToggle = useCallback((tag: string) => {
    setVisibleTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
  }, []);

  const handleClearFilter = useCallback(() => {
    setVisibleTags(new Set());
  }, []);

  const title = mode === "structure" ? "Structure" : "Graph";
  const subtitle = graph ? `${graph.nodes.length} notes · ${graph.edges.length} links` : undefined;

  return (
    <PageShell
      title={title}
      subtitle={subtitle}
      toolbar={<MapModeToggle mode={mode} onChange={setMode} />}
    >
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        {loading && (
          <div style={{ padding: 32 }}>
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="animate-shimmer"
                style={{ height: 40, marginBottom: 4, borderRadius: 6, animationDelay: `${i * 0.12}s` }}
              />
            ))}
          </div>
        )}
        {!loading && error && (
          <div style={{ padding: 32 }}>
            <p className="caption-large" style={{ color: "var(--status-blocked)", marginBottom: 8 }}>
              Couldn&#39;t load graph
            </p>
            <p className="small" style={{ color: "var(--text-tertiary)" }}>{error}</p>
          </div>
        )}
        {!loading && !error && graph && graph.nodes.length === 0 && (
          <p className="small" style={{ color: "var(--text-quaternary)", padding: 32, margin: 0 }}>
            No notes found. Connect a vault to build the graph.
          </p>
        )}
        {!loading && !error && graph && graph.nodes.length > 0 && mode === "graph" && (
          <div
            style={{
              position: "relative",
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              // Cinematic deep-space background: radial gradient from lifted near-black
              // center to pure-black edges. Light mode uses a clean soft field.
              background:
                "radial-gradient(ellipse at 50% 45%, var(--graph-bg-center) 0%, var(--graph-bg-edge) 70%)",
            }}
          >
            {/* Accent nebula glow overlay — indigo radial wash centered on the graph */}
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
                background:
                  "radial-gradient(ellipse at 50% 40%, color-mix(in oklch, var(--accent-brand) 10%, transparent), transparent 68%)",
                zIndex: 0,
              }}
            />
            <ForceGraph
              graph={graph}
              onOpen={sheet.open}
              visibleTags={visibleTags}
              rainbow={rainbow}
              activePath={sheet.path}
            />
            <GraphLegend
              tags={tagCounts}
              visibleTags={visibleTags}
              onToggle={handleTagToggle}
              onClearFilter={handleClearFilter}
              rainbow={rainbow}
              onRainbowToggle={() => setRainbow((r) => !r)}
            />
          </div>
        )}
        {!loading && !error && graph && graph.nodes.length > 0 && mode === "structure" && (
          <StructureColumns graph={graph} onOpen={sheet.open} />
        )}
      </div>
    </PageShell>
  );
}
