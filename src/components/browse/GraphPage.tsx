"use client";

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
      icon={
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6" cy="7" r="2" />
          <circle cx="18" cy="7" r="2" />
          <circle cx="12" cy="17" r="2" />
          <path d="M8 8l3 7M16 8l-3 7" />
        </svg>
      }
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
