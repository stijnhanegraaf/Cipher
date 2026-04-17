"use client";

import { useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { useSheet } from "@/lib/hooks/useSheet";
import type { TimelineSynthesisData } from "@/lib/view-models";

type Range = "week" | "month" | "quarter" | "all";
const RANGE_LABEL: Record<Range, string> = {
  week: "This week",
  month: "This month",
  quarter: "This quarter",
  all: "All time",
};
const RANGE_MS: Record<Exclude<Range, "all">, number> = {
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
  quarter: 90 * 24 * 60 * 60 * 1000,
};

async function fetchTimeline(): Promise<TimelineSynthesisData | null> {
  const res = await fetch("/api/query?intent=timeline_synthesis");
  if (!res.ok) return null;
  const payload = await res.json();
  return (payload?.response?.views?.[0]?.data as TimelineSynthesisData) ?? null;
}

export function TimelinePage() {
  const sheet = useSheet();
  const [data, setData] = useState<TimelineSynthesisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<Range>("month");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const payload = await fetchTimeline();
        if (!cancelled) setData(payload);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load timeline");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Flatten themes into date-sorted items, then group by week bucket.
  const grouped = useMemo(() => {
    if (!data) return [] as { label: string; items: { date: string; label: string; path?: string; summary?: string }[] }[];
    const all = data.themes.flatMap((t) =>
      t.items.map((it) => ({ date: it.date, label: it.label, path: it.path, summary: it.summary, theme: t.label }))
    );
    // Parse date strings loosely — accept "YYYY-MM-DD" or human "12 Mar" (current year).
    const now = Date.now();
    const parsed = all
      .map((it) => {
        const d = parseLooseDate(it.date);
        return d ? { ...it, ts: d.getTime() } : null;
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
    // Apply range filter.
    const filtered = range === "all"
      ? parsed
      : parsed.filter((p) => now - p.ts <= RANGE_MS[range]);
    // Sort desc.
    filtered.sort((a, b) => b.ts - a.ts);
    // Bucket by week.
    const buckets = new Map<string, typeof filtered>();
    for (const item of filtered) {
      const key = weekKey(new Date(item.ts));
      const list = buckets.get(key) ?? [];
      list.push(item);
      buckets.set(key, list);
    }
    return Array.from(buckets.entries()).map(([label, items]) => ({ label, items }));
  }, [data, range]);

  return (
    <PageShell
      icon={
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v4l3 3" />
        </svg>
      }
      title="Timeline"
      subtitle={data?.range?.label}
      toolbar={
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {(Object.keys(RANGE_LABEL) as Range[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className="filter-chip focus-ring"
              data-active={range === r ? "true" : undefined}
              aria-pressed={range === r}
            >
              {RANGE_LABEL[r]}
            </button>
          ))}
        </div>
      }
    >
      {loading && <div style={{ padding: 32, color: "var(--text-quaternary)" }}>Loading…</div>}
      {!loading && error && (
        <div style={{ padding: 32 }}>
          <p className="caption-large" style={{ color: "var(--status-blocked)" }}>Couldn't load timeline</p>
          <p className="small" style={{ color: "var(--text-tertiary)" }}>{error}</p>
        </div>
      )}
      {!loading && !error && grouped.length === 0 && (
        <p className="small" style={{ color: "var(--text-quaternary)", padding: 32 }}>No events in this range.</p>
      )}
      {!loading && !error && grouped.map((group) => (
        <section key={group.label}>
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
            <span>{group.label.toUpperCase()}</span>
            <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-quaternary)" }}>{group.items.length}</span>
          </div>
          {group.items.map((item, i) => (
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
              <span
                className="mono-label"
                style={{ width: 64, color: "var(--text-quaternary)", flexShrink: 0, letterSpacing: "0.04em" }}
              >
                {item.date}
              </span>
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  color: "var(--text-primary)",
                  fontSize: 13,
                }}
              >
                {item.label}
              </span>
            </button>
          ))}
        </section>
      ))}
    </PageShell>
  );
}

function parseLooseDate(s: string): Date | null {
  if (!s) return null;
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);
  const human = s.match(/(\d{1,2})\s+([A-Za-z]{3,})/);
  if (human) {
    const months: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    };
    const m = months[human[2].slice(0, 3).toLowerCase()];
    if (m !== undefined) {
      const d = new Date();
      d.setMonth(m);
      d.setDate(+human[1]);
      return d;
    }
  }
  const any = Date.parse(s);
  return isNaN(any) ? null : new Date(any);
}

function weekKey(d: Date): string {
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  if (days < 7) return "This week";
  if (days < 14) return "Last week";
  if (days < 31) return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}
