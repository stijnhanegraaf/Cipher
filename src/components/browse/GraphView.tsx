"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Graph } from "@/lib/vault-graph";
import { GraphCanvas } from "./GraphCanvas";
import { GraphFilters } from "./GraphFilters";

/**
 * GraphView — full graph surface: filter panel + canvas + empty/error states.
 *
 * Data loads once from /api/vault/graph and caches on the server side.
 * Click a node → onOpen(path) → DetailPage opens via ChatInterface.
 */

interface Props {
  onOpen: (path: string) => void;
}

export function GraphView({ onOpen }: Props) {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [visibleFolders, setVisibleFolders] = useState<Set<string>>(new Set());
  const [orphansOnly, setOrphansOnly] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/vault/graph");
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || `Graph fetch failed (${res.status})`);
        }
        const payload: Graph = await res.json();
        if (!cancelled) {
          setGraph(payload);
          // Default: all folders visible (empty set = "all" in GraphCanvas/Filters).
          setVisibleFolders(new Set());
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load graph");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const toggleFolder = useCallback((folder: string) => {
    setVisibleFolders((prev) => {
      const next = new Set(prev);
      // Treat empty set as "all visible". Toggling one folder transitions into
      // explicit mode where only checked folders show.
      if (next.size === 0) {
        // If all are currently shown, clicking a folder disables just that one.
        const all = new Set(graph?.folders ?? []);
        all.delete(folder);
        return all;
      }
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });
  }, [graph]);

  const allFolders = useCallback(() => {
    setVisibleFolders(new Set());
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ background: "var(--bg-marketing)" }}>
        <span className="mono-label" style={{ color: "var(--text-quaternary)", letterSpacing: "0.04em" }}>
          Building graph…
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center" style={{ background: "var(--bg-marketing)", padding: 32 }}>
        <p className="caption-large" style={{ color: "var(--text-primary)", fontWeight: 510, marginBottom: 8 }}>
          Couldn't build graph
        </p>
        <p className="small" style={{ color: "var(--text-tertiary)", maxWidth: 420, textAlign: "center", lineHeight: 1.5 }}>
          {error}
        </p>
      </div>
    );
  }

  if (!graph || graph.nodes.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center" style={{ background: "var(--bg-marketing)", padding: 32 }}>
        <p className="caption-large" style={{ color: "var(--text-primary)", fontWeight: 510, marginBottom: 8 }}>
          Empty vault
        </p>
        <p className="small" style={{ color: "var(--text-tertiary)", maxWidth: 420, textAlign: "center", lineHeight: 1.5 }}>
          No markdown files found. Connect a vault to see its graph.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1" style={{ height: "100%", overflow: "hidden" }}>
      <GraphFilters
        graph={graph}
        visibleFolders={visibleFolders}
        onToggleFolder={toggleFolder}
        onAllFolders={allFolders}
        orphansOnly={orphansOnly}
        onToggleOrphans={() => setOrphansOnly((v) => !v)}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
      />
      <GraphCanvas
        graph={graph}
        onOpen={onOpen}
        visibleFolders={visibleFolders}
        orphansOnly={orphansOnly}
        searchTerm={searchTerm}
      />
    </div>
  );
}
