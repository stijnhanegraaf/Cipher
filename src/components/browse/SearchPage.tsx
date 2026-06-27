"use client";

/**
 * /browse/search page — query-driven search across vault files.
 *
 * Mode toggle: Exact (default) | Semantic.
 * - Exact: calls /api/search?mode=exact → buildSearchResults (unchanged behaviour).
 * - Semantic: calls /api/search?mode=semantic → retrieve() + cosine rerank.
 *   Degrades transparently to keyword-only when no embedder is reachable.
 * Existing deep links (?q=…, no mode) land on Exact — behaviour unchanged.
 */

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { useSheet } from "@/lib/hooks/useSheet";
import type { SearchResultsData } from "@/lib/view-models";
import { SEARCH_KIND_ORDER, SEARCH_KIND_LABEL, toSearchKind } from "@/lib/builders/search-kinds";

type SearchMode = "exact" | "semantic";
// Keep source as a plain string to avoid importing server-only embeddings.ts in a client component.
type SearchSource = string;

interface SearchPayload {
  data: SearchResultsData;
  source: SearchSource;
}

async function fetchSearch(
  q: string,
  mode: SearchMode,
): Promise<SearchPayload | null> {
  if (!q) return null;
  const params = new URLSearchParams({ q, mode });
  const res = await fetch(`/api/search?${params}`);
  if (!res.ok) return null;
  return res.json() as Promise<SearchPayload>;
}

export function SearchPage() {
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  const sheet = useSheet();

  const [mode, setMode] = useState<SearchMode>("exact");
  const [data, setData] = useState<SearchResultsData | null>(null);
  const [source, setSource] = useState<SearchSource>("keyword-only");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const payload = await fetchSearch(q, mode);
        if (!cancelled) {
          setData(payload?.data ?? null);
          setSource(payload?.source ?? "keyword-only");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [q, mode]);

  const grouped = useMemo(() => {
    if (!data) return [] as { kind: string; label: string; items: SearchResultsData["results"] }[];
    const order = SEARCH_KIND_ORDER.map((kind) => ({ kind, label: SEARCH_KIND_LABEL[kind] }));
    const byKind: Record<string, SearchResultsData["results"]> = {};
    for (const r of data.results) {
      (byKind[toSearchKind(r.kind)] ??= []).push(r);
    }
    return order
      .filter(({ kind }) => byKind[kind]?.length)
      .map(({ kind, label }) => ({ kind, label, items: byKind[kind] }));
  }, [data]);

  const showDegradeNotice = mode === "semantic" && source === "keyword-only";

  return (
    <PageShell
      title={q ? `Results for "${q}"` : "Search"}
      subtitle={data ? `${data.results.length} result${data.results.length === 1 ? "" : "s"}` : undefined}
    >
      {/* Mode segmented control */}
      <div
        style={{
          display: "flex",
          gap: 4,
          padding: "12px 32px",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        {(["exact", "semantic"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className="mono-label"
            style={{
              padding: "3px 10px",
              borderRadius: 6,
              border: "1px solid var(--border-standard)",
              background: mode === m ? "var(--active-surface)" : "transparent",
              color: mode === m ? "var(--text-primary)" : "var(--text-tertiary)",
              cursor: "pointer",
              letterSpacing: "0.04em",
              fontSize: 11,
              fontWeight: mode === m ? 600 : 400,
              transition: "background 120ms ease, color 120ms ease",
            }}
          >
            {m === "exact" ? "EXACT" : "SEMANTIC"}
          </button>
        ))}
      </div>

      {/* Keyword-only degrade notice (semantic mode only, when embedder unreachable) */}
      {showDegradeNotice && (
        <p
          className="mono-label"
          style={{
            margin: 0,
            padding: "6px 32px",
            color: "var(--text-quaternary)",
            fontSize: 11,
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          Search falls back to keywords
        </p>
      )}

      {loading && <div style={{ padding: 32, color: "var(--text-quaternary)" }}>Searching…</div>}
      {!loading && !q && (
        <p className="small" style={{ color: "var(--text-quaternary)", padding: 32 }}>
          No query. Add <code>?q=…</code> to the URL or use ⌘K.
        </p>
      )}
      {!loading && q && data && grouped.length === 0 && (
        <p className="small" style={{ color: "var(--text-quaternary)", padding: 32 }}>
          No matches for &quot;{q}&quot;.
        </p>
      )}
      {!loading && grouped.map((g) => (
        <section key={g.kind}>
          <div
            className="mono-label"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "16px 32px 8px",
              color: "var(--text-tertiary)",
              letterSpacing: "0.04em",
              borderBottom: "1px solid var(--border-subtle)",
            }}
          >
            <span>{g.label.toUpperCase()}</span>
            <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-quaternary)" }}>{g.items.length}</span>
          </div>
          {g.items.map((item, i) => (
            <button
              key={i}
              type="button"
              onClick={() => item.path && sheet.open(item.path)}
              className="app-row focus-ring"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                width: "100%",
                padding: "0 32px",
                height: 40,
                border: "none",
                background: "transparent",
                textAlign: "left",
                borderBottom: "1px solid var(--border-subtle)",
                cursor: item.path ? "pointer" : "default",
              }}
              disabled={!item.path}
            >
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-primary)", fontSize: 13 }}>
                {item.label}
              </span>
              <span
                className="mono-label"
                style={{ color: "var(--text-quaternary)", letterSpacing: "0.02em", flexShrink: 0, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              >
                {item.path}
              </span>
            </button>
          ))}
        </section>
      ))}
    </PageShell>
  );
}
