"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { useSheet } from "@/lib/hooks/useSheet";
import type { SearchResultsData } from "@/lib/view-models";

async function fetchSearch(q: string): Promise<SearchResultsData | null> {
  if (!q) return null;
  const res = await fetch("/api/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: q }),
  });
  if (!res.ok) return null;
  const payload = await res.json();
  return (payload?.response?.views?.[0]?.data as SearchResultsData) ?? null;
}

export function SearchPage() {
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  const sheet = useSheet();
  const [data, setData] = useState<SearchResultsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const payload = await fetchSearch(q);
        if (!cancelled) setData(payload);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [q]);

  const grouped = useMemo(() => {
    if (!data) return [] as { kind: string; label: string; items: SearchResultsData["results"] }[];
    const order = [
      { kind: "canonical_note", label: "Notes" },
      { kind: "entity", label: "Entities" },
      { kind: "topic", label: "Topics" },
      { kind: "derived_index", label: "Indexes" },
      { kind: "runtime_status", label: "Status" },
      { kind: "generated_summary", label: "Summaries" },
    ];
    const byKind: Record<string, SearchResultsData["results"]> = {};
    for (const r of data.results) {
      (byKind[r.kind || "other"] ??= []).push(r);
    }
    return order
      .filter(({ kind }) => byKind[kind]?.length)
      .map(({ kind, label }) => ({ kind, label, items: byKind[kind] }));
  }, [data]);

  return (
    <PageShell
      icon={
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
      }
      title={q ? `Results for "${q}"` : "Search"}
      subtitle={data ? `${data.results.length} result${data.results.length === 1 ? "" : "s"}` : undefined}
    >
      {loading && <div style={{ padding: 32, color: "var(--text-quaternary)" }}>Searching…</div>}
      {!loading && !q && (
        <p className="small" style={{ color: "var(--text-quaternary)", padding: 32 }}>
          No query. Add <code>?q=…</code> to the URL or use ⌘K.
        </p>
      )}
      {!loading && q && data && grouped.length === 0 && (
        <p className="small" style={{ color: "var(--text-quaternary)", padding: 32 }}>
          No matches for "{q}".
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
              padding: "16px 16px 8px",
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
                padding: "0 16px",
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
