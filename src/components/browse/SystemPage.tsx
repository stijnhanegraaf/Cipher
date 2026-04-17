"use client";

import { useCallback, useEffect, useState } from "react";
import { PageShell, PageAction } from "@/components/PageShell";
import { StatusDot, Badge, MarkdownRenderer } from "@/components/ui";
import { ActivitySparkline } from "@/components/ui/ActivitySparkline";
import { useSheet } from "@/lib/hooks/useSheet";
import type { SystemStatusData, Status } from "@/lib/view-models";

/** Fetch system status via the existing /api/query pipeline. */
async function fetchSystemData(): Promise<SystemStatusData | null> {
  const res = await fetch("/api/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "system health" }),
  });
  if (!res.ok) return null;
  const payload = await res.json();
  const view = payload?.response?.views?.[0];
  return (view?.data as SystemStatusData) ?? null;
}

export function SystemPage() {
  const sheet = useSheet();
  const [data, setData] = useState<SystemStatusData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const payload = await fetchSystemData();
        if (!cancelled) setData(payload);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load system status");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  const refresh = useCallback(() => setRefreshTick((t) => t + 1), []);

  const healthyCount = data?.checks.filter((c) => c.status === "ok" || c.status === "fresh").length ?? 0;
  const attentionCount = data?.checks.filter((c) => c.status === "warn" || c.status === "error").length ?? 0;
  const subtitle = data
    ? `${healthyCount} healthy${attentionCount > 0 ? ` · ${attentionCount} needs attention` : ""}`
    : undefined;

  return (
    <PageShell
      icon={
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 2L3 14h9l-1 8 10-12h-9z" />
        </svg>
      }
      title="System status"
      subtitle={subtitle}
      actions={
        <PageAction label="Refresh" onClick={refresh}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 4v6h6M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
        </PageAction>
      }
    >
      {loading && <Loading />}
      {!loading && error && <ErrorBlock body={error} />}
      {!loading && !error && data && (
        <>
          {/* Vault activity — appears first so you immediately see the
              pulse of the vault. */}
          {data.health && (
            <Section label="Vault activity" count={data.health.totalFiles}>
              <div style={{ padding: "16px 16px 20px" }}>
                <ActivitySparkline
                  days={data.health.activity.days}
                  peak={data.health.activity.peak}
                  total={data.health.activity.total}
                />
              </div>
            </Section>
          )}

          <Section label="Checks" count={data.checks.length}>
            {data.checks.length === 0 ? (
              <EmptyState body="No checks configured." />
            ) : (
              data.checks.map((check, i) => (
                <CheckRow key={i} status={check.status} label={check.label} detail={check.detail} />
              ))
            )}
          </Section>

          {data.health && data.health.brokenLinks.count > 0 && (
            <Section label="Broken links" count={data.health.brokenLinks.count}>
              {data.health.brokenLinks.samples.map((s, i) => (
                <BrokenLinkRow
                  key={i}
                  sample={s}
                  onOpen={() => sheet.open(s.from)}
                />
              ))}
              {data.health.brokenLinks.count > data.health.brokenLinks.samples.length && (
                <p className="small" style={{ padding: "8px 16px 16px", color: "var(--text-quaternary)", margin: 0 }}>
                  + {data.health.brokenLinks.count - data.health.brokenLinks.samples.length} more.
                </p>
              )}
            </Section>
          )}

          {data.health && data.health.staleNotes.count > 0 && (
            <Section label="Stale notes" count={data.health.staleNotes.count}>
              {data.health.staleNotes.samples.map((s, i) => (
                <StaleNoteRow key={i} sample={s} onOpen={() => sheet.open(s.path)} />
              ))}
              {data.health.staleNotes.count > data.health.staleNotes.samples.length && (
                <p className="small" style={{ padding: "8px 16px 16px", color: "var(--text-quaternary)", margin: 0 }}>
                  + {data.health.staleNotes.count - data.health.staleNotes.samples.length} more.
                </p>
              )}
            </Section>
          )}

          {data.attention && data.attention.length > 0 && (
            <Section label="Needs attention" count={data.attention.length}>
              <div
                style={{
                  margin: "12px 16px",
                  padding: "14px 16px",
                  borderRadius: 8,
                  background: "color-mix(in srgb, var(--status-warning) 6%, transparent)",
                  borderLeft: "2px solid var(--status-warning)",
                }}
              >
                <div className="small" style={{ color: "var(--text-secondary)", lineHeight: 1.6 }}>
                  <MarkdownRenderer content={data.attention.join(". ") + "."} onNavigate={sheet.open} />
                </div>
              </div>
            </Section>
          )}
        </>
      )}
    </PageShell>
  );
}

function Section({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  return (
    <section>
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
        <span>{label.toUpperCase()}</span>
        <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-quaternary)" }}>{count}</span>
      </div>
      {children}
    </section>
  );
}

function CheckRow({ status, label, detail }: { status: Status; label: string; detail?: string }) {
  const variant =
    status === "ok" || status === "fresh"
      ? ("success" as const)
      : status === "warn"
      ? ("warning" as const)
      : ("error" as const);
  const pillLabel =
    status === "ok" ? "Healthy" : status === "fresh" ? "Fresh" : status === "warn" ? "Warning" : status === "error" ? "Error" : "Stale";
  return (
    <div
      className="app-row"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "0 16px",
        height: 40,
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      <span style={{ flexShrink: 0 }}>
        <StatusDot status={status} size={8} />
      </span>
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-primary)", fontSize: 13 }}>
        {label}
      </span>
      <Badge variant={variant} dot>
        {pillLabel}
      </Badge>
    </div>
  );
}

function BrokenLinkRow({ sample, onOpen }: { sample: { from: string; label: string }; onOpen: () => void }) {
  const fromShort = (sample.from.split("/").pop() || sample.from).replace(/\.md$/i, "");
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); }
      }}
      className="app-row focus-ring"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "0 16px",
        height: 40,
        borderBottom: "1px solid var(--border-subtle)",
        cursor: "pointer",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--status-warning)", flexShrink: 0 }} />
      <span style={{
        flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        color: "var(--text-primary)", fontSize: 13,
      }}>
        <span style={{ color: "var(--text-tertiary)" }}>[[</span>{sample.label}<span style={{ color: "var(--text-tertiary)" }}>]]</span>
      </span>
      <span className="mono-label" style={{ color: "var(--text-quaternary)", letterSpacing: "0.02em", flexShrink: 0 }}>
        in {fromShort}
      </span>
    </div>
  );
}

function StaleNoteRow({ sample, onOpen }: { sample: { path: string; title: string; daysStale: number }; onOpen: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); }
      }}
      className="app-row focus-ring"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "0 16px",
        height: 40,
        borderBottom: "1px solid var(--border-subtle)",
        cursor: "pointer",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--text-quaternary)", flexShrink: 0 }} />
      <span style={{
        flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        color: "var(--text-primary)", fontSize: 13,
      }}>
        {sample.title}
      </span>
      <span className="mono-label" style={{ color: "var(--text-quaternary)", letterSpacing: "0.02em", flexShrink: 0 }}>
        {sample.daysStale}d
      </span>
    </div>
  );
}

function Loading() {
  return (
    <div style={{ padding: 32 }}>
      {[0, 1, 2].map((i) => (
        <div key={i} className="animate-shimmer" style={{ height: 40, marginBottom: 4, borderRadius: 6, animationDelay: `${i * 0.12}s` }} />
      ))}
    </div>
  );
}

function ErrorBlock({ body }: { body: string }) {
  return (
    <div style={{ padding: 32 }}>
      <p className="caption-large" style={{ color: "var(--status-blocked)", marginBottom: 8 }}>
        Couldn't load
      </p>
      <p className="small" style={{ color: "var(--text-tertiary)" }}>{body}</p>
    </div>
  );
}

function EmptyState({ body }: { body: string }) {
  return (
    <p className="small" style={{ color: "var(--text-quaternary)", padding: 16, margin: 0 }}>
      {body}
    </p>
  );
}
