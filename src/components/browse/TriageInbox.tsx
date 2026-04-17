"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { TriagePayload, TriageRow as TriageRowType } from "@/lib/triage-builder";
import { TriageFilterBar, type TriageFilter } from "./TriageFilterBar";
import { TriageRow } from "./TriageRow";

/**
 * TriageInbox — the /browse landing.
 *
 * Dense, Linear-style inbox of items needing attention. One list, filterable,
 * client-side sorted server-side. Click-through opens DetailPage.
 */

interface Props {
  onOpen: (path: string) => void;
  onAsk?: (query: string) => void;
}

export function TriageInbox({ onOpen, onAsk }: Props) {
  const router = useRouter();
  const [data, setData] = useState<TriagePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<TriageFilter>("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/triage");
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || `Triage fetch failed (${res.status})`);
        }
        const payload: TriagePayload = await res.json();
        if (!cancelled) setData(payload);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load triage");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const visible = useMemo(() => {
    if (!data) return [];
    return data.rows.filter((r) => matchesFilter(r, filter));
  }, [data, filter]);

  const handleOpen = useCallback((path: string) => {
    // Delegate to parent — BrowseShell owns the detail-sheet state.
    onOpen(path);
  }, [onOpen]);

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: "var(--bg-marketing)" }}
    >
      {/* Header row — title + count + filter */}
      <div
        className="flex flex-col gap-3"
        style={{
          padding: "28px 32px 16px",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <div className="flex items-center justify-between">
          <h1 className="heading-3 text-text-primary" style={{ letterSpacing: -0.3 }}>
            Today
          </h1>
          {data && (
            <span
              className="mono-label"
              style={{
                color: "var(--text-quaternary)",
                letterSpacing: "0.04em",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {visible.length} item{visible.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <TriageFilterBar
          active={filter}
          counts={data?.counts ?? null}
          onChange={setFilter}
        />
      </div>

      {/* List */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ scrollbarWidth: "thin" }}
      >
        {loading && <LoadingRows />}
        {!loading && error && (
          <EmptyState
            title="Couldn't load triage"
            body={error}
            cta={{ label: "Retry", onClick: () => window.location.reload() }}
          />
        )}
        {!loading && !error && data && visible.length === 0 && (
          <EmptyState
            title="Nothing to triage"
            body={
              filter === "all"
                ? "No open tasks, no recent changes, no mentions. Quiet inbox."
                : `No matches for "${filter}". Try another filter.`
            }
            cta={filter !== "all" ? { label: "Show all", onClick: () => setFilter("all") } : undefined}
          />
        )}
        {!loading && !error && visible.map((row) => (
          <TriageRow
            key={row.id}
            row={row}
            onOpen={handleOpen}
            onAsk={onAsk}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────

function matchesFilter(row: TriageRowType, filter: TriageFilter): boolean {
  switch (filter) {
    case "all": return true;
    case "open": return row.kind === "task" && row.status === "open";
    case "blocked": return row.kind === "task" && row.status === "blocked";
    case "changed24h": {
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      if (row.kind === "highlight") return row.generatedAt >= cutoff;
      if ("mtime" in row) return row.mtime >= cutoff;
      return false;
    }
    case "mentions": return row.kind === "mention";
    case "highlights": return row.kind === "highlight";
  }
}

function LoadingRows() {
  return (
    <div>
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            height: 40,
            padding: "0 32px",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <div
            className="animate-shimmer"
            style={{ width: 14, height: 14, borderRadius: 2, animationDelay: `${i * 0.12}s` }}
          />
          <div
            className="animate-shimmer"
            style={{ width: 14, height: 14, borderRadius: "50%", animationDelay: `${i * 0.12}s` }}
          />
          <div
            className="animate-shimmer"
            style={{ flex: 1, height: 13, borderRadius: 4, animationDelay: `${i * 0.12}s` }}
          />
          <div
            className="animate-shimmer"
            style={{ width: 120, height: 11, borderRadius: 4, animationDelay: `${i * 0.12}s` }}
          />
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  title,
  body,
  cta,
}: {
  title: string;
  body: string;
  cta?: { label: string; onClick: () => void };
}) {
  return (
    <div
      className="flex flex-col items-center justify-center"
      style={{ padding: "80px 32px", textAlign: "center" }}
    >
      <p className="caption-large" style={{ color: "var(--text-primary)", fontWeight: 510 }}>{title}</p>
      <p
        className="small"
        style={{
          color: "var(--text-tertiary)",
          marginTop: 8,
          maxWidth: 420,
          lineHeight: 1.5,
        }}
      >
        {body}
      </p>
      {cta && (
        <button
          type="button"
          onClick={cta.onClick}
          className="focus-ring"
          style={{
            marginTop: 20,
            padding: "8px 16px",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 510,
            color: "var(--text-primary)",
            background: "var(--bg-surface-alpha-2)",
            border: "1px solid var(--border-standard)",
            cursor: "pointer",
            transition: "background var(--motion-hover) var(--ease-default)",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-surface-alpha-4)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "var(--bg-surface-alpha-2)"; }}
        >
          {cta.label}
        </button>
      )}
    </div>
  );
}
