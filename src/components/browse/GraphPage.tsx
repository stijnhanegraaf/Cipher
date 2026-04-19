"use client";

/**
 * /browse/graph page — wraps GraphCanvas with PageShell chrome.
 */

import { useEffect, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { GraphCanvas } from "@/components/browse/GraphCanvas";
import { useSheet } from "@/lib/hooks/useSheet";
import type { Graph } from "@/lib/vault-graph";

export function GraphPage() {
  const sheet = useSheet();
  const [graph, setGraph] = useState<Graph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
    return () => { cancelled = true; };
  }, []);

  return (
    <PageShell
      title="Graph"
      subtitle={graph ? `${graph.nodes.length} notes · ${graph.edges.length} links` : undefined}
    >
      <div style={{ display: "flex", flex: 1, height: "100%", minHeight: 0 }}>
        {!loading && !error && graph && (
          <GraphCanvas graph={graph} onOpen={sheet.open} />
        )}
        {loading && <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-quaternary)" }}>Building graph…</div>}
        {error && <div style={{ flex: 1, padding: 32, color: "var(--status-blocked)" }}>{error}</div>}
      </div>
    </PageShell>
  );
}
