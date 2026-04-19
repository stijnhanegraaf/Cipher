"use client";

/**
 * /browse/graph page — owns mode state (Graph ↔ Structure), fetches
 * /api/vault/graph once, hands the payload to whichever child view is active.
 * Mode persists to localStorage["cipher-map-mode-v1"].
 */

import { useEffect, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { GraphCanvas } from "@/components/browse/GraphCanvas";
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
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-quaternary)",
            }}
          >
            Building graph…
          </div>
        )}
        {!loading && error && (
          <div style={{ flex: 1, maxWidth: 720, margin: "0 auto", padding: "16px 0", color: "var(--status-blocked)" }}>{error}</div>
        )}
        {!loading && !error && graph && mode === "graph" && (
          <GraphCanvas graph={graph} onOpen={sheet.open} />
        )}
        {!loading && !error && graph && mode === "structure" && (
          <StructureColumns graph={graph} onOpen={sheet.open} />
        )}
      </div>
    </PageShell>
  );
}
