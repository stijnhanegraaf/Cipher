"use client";

import { useCallback, useEffect, useState } from "react";
import { PageShell, PageAction } from "@/components/PageShell";
import { StatusDot, Badge, MarkdownRenderer } from "@/components/ui";
import { ActivitySparkline } from "@/components/ui/ActivitySparkline";
import { LinkDistributionChart } from "@/components/ui/LinkDistributionChart";
import { useSheet } from "@/lib/hooks/useSheet";
import type {
  SystemStatusData,
  Status,
  VaultHealthMetrics,
  BrokenLinkSample,
  StaleNoteSample,
  HubNote,
  FolderCount,
} from "@/lib/view-models";

// ─── Fetch ──────────────────────────────────────────────────────────
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

// ─── Page ───────────────────────────────────────────────────────────
export function SystemPage() {
  const sheet = useSheet();
  const [data, setData] = useState<SystemStatusData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const [brokenExpanded, setBrokenExpanded] = useState(false);
  const [staleExpanded, setStaleExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyBroken = useCallback(async (samples: BrokenLinkSample[]) => {
    const lines = [
      `Broken wiki-links in vault (${samples.length} total):`,
      "",
      ...samples.map((s) => `- [[${s.label}]]  in  ${s.from}`),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {}
  }, []);

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

  const refresh = useCallback(() => {
    setBrokenExpanded(false);
    setStaleExpanded(false);
    setRefreshTick((t) => t + 1);
  }, []);

  const health = data?.health;
  const healthyCount = data?.checks.filter((c) => c.status === "ok" || c.status === "fresh").length ?? 0;
  const attentionCount = data?.checks.filter((c) => c.status === "warn" || c.status === "error").length ?? 0;
  const subtitle = health
    ? `${health.totalFiles} notes · ${health.totalLinks} links${attentionCount > 0 ? ` · ${attentionCount} need attention` : ""}`
    : undefined;

  return (
    <PageShell
      title="System"
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
        <div style={{ display: "flex", flexDirection: "column", paddingBottom: 48 }}>
          {/* ── Stat cards row ───────────────────────────── */}
          {health && <StatCards health={health} healthyCount={healthyCount} attentionCount={attentionCount} />}

          {/* ── Activity + Connectivity — 50/50 ────────────── */}
          {health && (
            <Section label="Pulse">
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                  gap: 32,
                  padding: "20px 32px 28px",
                }}
              >
                <div>
                  <div className="mono-label" style={{ color: "var(--text-quaternary)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 14 }}>
                    Activity · 30 days
                  </div>
                  <ActivitySparkline days={health.activity.days} peak={health.activity.peak} total={health.activity.total} />
                </div>
                <div>
                  <div className="mono-label" style={{ color: "var(--text-quaternary)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 14 }}>
                    Connectivity
                  </div>
                  <LinkDistributionChart data={health.linkDistribution} total={health.totalFiles} />
                </div>
              </div>
            </Section>
          )}

          {/* ── Folder distribution ───────────────────────── */}
          {health && health.folders.length > 0 && (
            <Section label="Inventory">
              <FolderStack folders={health.folders} total={health.totalFiles} />
            </Section>
          )}

          {/* ── Hubs ──────────────────────────────────────── */}
          {health && health.hubs.length > 0 && (
            <Section label="Top hubs" count={health.hubs.length}>
              {health.hubs.map((h) => (
                <HubRow key={h.path} hub={h} onOpen={() => sheet.open(h.path)} />
              ))}
            </Section>
          )}

          {/* ── Broken links ──────────────────────────────── */}
          {health && health.brokenLinks.count > 0 && (
            <Section
              label="Broken links"
              count={health.brokenLinks.count}
              action={
                <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <SeeAllButton onClick={() => handleCopyBroken(health.brokenLinks.all)}>
                    {copied ? "Copied" : "Copy all paths"}
                  </SeeAllButton>
                  {!brokenExpanded && health.brokenLinks.count > health.brokenLinks.samples.length ? (
                    <SeeAllButton onClick={() => setBrokenExpanded(true)}>See all</SeeAllButton>
                  ) : brokenExpanded ? (
                    <SeeAllButton onClick={() => setBrokenExpanded(false)}>Collapse</SeeAllButton>
                  ) : null}
                </div>
              }
            >
              <ListScroll expanded={brokenExpanded}>
                {(brokenExpanded ? health.brokenLinks.all : health.brokenLinks.samples).map((s, i) => (
                  <BrokenLinkRow key={`${s.from}-${i}`} sample={s} onOpen={() => sheet.open(s.from)} />
                ))}
              </ListScroll>
            </Section>
          )}

          {/* ── Stale notes ──────────────────────────────── */}
          {health && health.staleNotes.count > 0 && (
            <Section
              label="Stale notes"
              count={health.staleNotes.count}
              action={
                !staleExpanded && health.staleNotes.count > health.staleNotes.samples.length ? (
                  <SeeAllButton onClick={() => setStaleExpanded(true)}>See all</SeeAllButton>
                ) : staleExpanded ? (
                  <SeeAllButton onClick={() => setStaleExpanded(false)}>Collapse</SeeAllButton>
                ) : undefined
              }
            >
              <ListScroll expanded={staleExpanded}>
                {(staleExpanded ? health.staleNotes.all : health.staleNotes.samples).map((s, i) => (
                  <StaleNoteRow key={`${s.path}-${i}`} sample={s} onOpen={() => sheet.open(s.path)} />
                ))}
              </ListScroll>
            </Section>
          )}

          {/* ── Checks (curated from status.md) ───────────── */}
          {data.checks.length > 0 && (
            <Section label="Checks" count={data.checks.length}>
              {data.checks.map((check, i) => (
                <CheckRow key={i} status={check.status} label={check.label} detail={check.detail} />
              ))}
            </Section>
          )}

          {/* ── Needs attention (curated list) ─────────────── */}
          {data.attention && data.attention.length > 0 && (
            <Section label="Needs attention" count={data.attention.length}>
              <div
                style={{
                  margin: "12px 32px",
                  padding: "14px 16px",
                  borderRadius: "var(--radius-card)",
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
        </div>
      )}
    </PageShell>
  );
}

// ─── Stat cards ─────────────────────────────────────────────────────
function StatCards({ health, healthyCount, attentionCount }: { health: VaultHealthMetrics; healthyCount: number; attentionCount: number }) {
  const brokenPct = health.totalLinks > 0 ? Math.round((health.brokenLinks.count / health.totalLinks) * 100) : 0;
  const orphanPct = health.totalFiles > 0 ? Math.round((health.orphans / health.totalFiles) * 100) : 0;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 12,
        padding: "24px 32px 8px",
      }}
    >
      <StatCard
        label="Notes"
        value={health.totalFiles.toLocaleString()}
        delta={`${orphanPct}% orphaned`}
        deltaTone={orphanPct > 40 ? "warn" : "muted"}
      />
      <StatCard
        label="Links"
        value={health.totalLinks.toLocaleString()}
        delta={`${health.hubs.length} hubs`}
        deltaTone="muted"
      />
      <StatCard
        label="Broken"
        value={health.brokenLinks.count.toLocaleString()}
        delta={`${brokenPct}% of links`}
        deltaTone={brokenPct > 10 ? "warn" : brokenPct > 0 ? "attention" : "ok"}
      />
      <StatCard
        label="This week"
        value={health.activity.week.toLocaleString()}
        delta={`${health.activity.total} in 30d`}
        deltaTone="muted"
      />
      <StatCard
        label="Checks"
        value={healthyCount.toLocaleString()}
        delta={attentionCount > 0 ? `${attentionCount} attention` : "all healthy"}
        deltaTone={attentionCount > 0 ? "warn" : "ok"}
      />
    </div>
  );
}

function StatCard({ label, value, delta, deltaTone }: { label: string; value: string; delta?: string; deltaTone?: "ok" | "warn" | "attention" | "muted" }) {
  const deltaColor =
    deltaTone === "ok" ? "var(--status-done)"
    : deltaTone === "warn" ? "var(--status-warning)"
    : deltaTone === "attention" ? "var(--text-secondary)"
    : "var(--text-quaternary)";
  return (
    <div
      style={{
        padding: "14px 16px 16px",
        borderRadius: "var(--radius-card)",
        background: "var(--bg-surface-alpha-2)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <div className="mono-label" style={{ color: "var(--text-quaternary)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 590, letterSpacing: -0.8, lineHeight: 1.1, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      {delta && (
        <div className="caption" style={{ marginTop: 4, color: deltaColor }}>
          {delta}
        </div>
      )}
    </div>
  );
}

// ─── Folder stacked bar ─────────────────────────────────────────────
function FolderStack({ folders, total }: { folders: FolderCount[]; total: number }) {
  // Linear-style horizontal stacked bar with a legend underneath.
  const accents = [
    "var(--accent-brand)",
    "var(--accent-violet)",
    "var(--status-done)",
    "var(--status-in-progress)",
    "var(--text-tertiary)",
    "var(--text-quaternary)",
  ];
  const visible = folders.slice(0, 6);
  const otherCount = folders.slice(6).reduce((s, f) => s + f.count, 0);
  const bars = otherCount > 0 ? [...visible, { folder: "other", count: otherCount }] : visible;
  return (
    <div style={{ padding: "20px 32px 24px" }}>
      <div
        style={{
          display: "flex",
          height: 10,
          width: "100%",
          borderRadius: "var(--radius-full)",
          overflow: "hidden",
          background: "var(--bg-surface-alpha-2)",
          marginBottom: 12,
        }}
      >
        {bars.map((f, i) => (
          <div
            key={f.folder}
            title={`${f.folder} — ${f.count}`}
            style={{
              width: `${(f.count / total) * 100}%`,
              background: accents[i % accents.length],
              transition: "background var(--motion-hover) var(--ease-default)",
            }}
          />
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px" }}>
        {bars.map((f, i) => (
          <div key={f.folder} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: accents[i % accents.length],
                flexShrink: 0,
              }}
            />
            <span className="caption" style={{ color: "var(--text-secondary)" }}>
              {f.folder}
            </span>
            <span className="caption" style={{ color: "var(--text-quaternary)", fontVariantNumeric: "tabular-nums" }}>
              {f.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Section wrapper ────────────────────────────────────────────────
function Section({ label, count, action, children }: { label: string; count?: number; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div
        className="mono-label"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "20px 32px 8px",
          color: "var(--text-tertiary)",
          letterSpacing: "0.04em",
          borderBottom: "1px solid var(--border-subtle)",
          textTransform: "uppercase",
          gap: 12,
        }}
      >
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <span>{label}</span>
          {count !== undefined && (
            <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-quaternary)" }}>
              {count}
            </span>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function SeeAllButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="focus-ring"
      style={{
        background: "transparent",
        border: "none",
        color: "var(--accent-brand)",
        cursor: "pointer",
        padding: "2px 4px",
        letterSpacing: 0,
        textTransform: "none",
      }}
    >
      <span className="caption-medium">{children}</span>
    </button>
  );
}

function ListScroll({ expanded, children }: { expanded: boolean; children: React.ReactNode }) {
  return (
    <div
      style={{
        maxHeight: expanded ? 480 : undefined,
        overflowY: expanded ? "auto" : "visible",
        transition: "max-height var(--motion-enter) var(--ease-default)",
      }}
      className="scrollbar-thin"
    >
      {children}
    </div>
  );
}

// ─── Rows ────────────────────────────────────────────────────────────
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
        padding: "0 32px",
        height: "var(--row-h-cozy)",
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      <span style={{ flexShrink: 0 }}>
        <StatusDot status={status} size={8} />
      </span>
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-primary)", fontSize: 13 }}>
        {label}
      </span>
      {detail && (
        <span className="caption" style={{ color: "var(--text-quaternary)", flexShrink: 0 }}>
          {detail}
        </span>
      )}
      <Badge variant={variant} dot>
        {pillLabel}
      </Badge>
    </div>
  );
}

function HubRow({ hub, onOpen }: { hub: HubNote; onOpen: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      className="app-row focus-ring"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "0 32px",
        height: "var(--row-h-cozy)",
        borderBottom: "1px solid var(--border-subtle)",
        cursor: "pointer",
      }}
    >
      <span style={{ width: "var(--dot-size-sm)", height: "var(--dot-size-sm)", borderRadius: "50%", background: "var(--accent-brand)", flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-primary)", fontSize: 13 }}>
        {hub.title}
      </span>
      <span className="mono-label" style={{ color: "var(--text-quaternary)", letterSpacing: "0.02em", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
        {hub.backlinks} {hub.backlinks === 1 ? "ref" : "refs"}
      </span>
    </div>
  );
}

function BrokenLinkRow({ sample, onOpen }: { sample: BrokenLinkSample; onOpen: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      className="app-row focus-ring"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "0 32px",
        height: "var(--row-h-cozy)",
        borderBottom: "1px solid var(--border-subtle)",
        cursor: "pointer",
      }}
    >
      <span style={{ width: "var(--dot-size-sm)", height: "var(--dot-size-sm)", borderRadius: "50%", background: "var(--status-warning)", flexShrink: 0 }} />
      <span style={{ minWidth: 160, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-primary)", fontSize: 13 }}>
        <span style={{ color: "var(--text-tertiary)" }}>[[</span>{sample.label}<span style={{ color: "var(--text-tertiary)" }}>]]</span>
      </span>
      <span
        className="mono-label"
        style={{
          flex: 1,
          minWidth: 0,
          color: "var(--text-quaternary)",
          letterSpacing: "0.02em",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          textAlign: "right",
        }}
      >
        {sample.from}
      </span>
    </div>
  );
}

function StaleNoteRow({ sample, onOpen }: { sample: StaleNoteSample; onOpen: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      className="app-row focus-ring"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "0 32px",
        height: "var(--row-h-cozy)",
        borderBottom: "1px solid var(--border-subtle)",
        cursor: "pointer",
      }}
    >
      <span style={{ width: "var(--dot-size-sm)", height: "var(--dot-size-sm)", borderRadius: "50%", background: "var(--text-quaternary)", flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-primary)", fontSize: 13 }}>
        {sample.title}
      </span>
      <span className="mono-label" style={{ color: "var(--text-quaternary)", letterSpacing: "0.02em", flexShrink: 0 }}>
        {sample.daysStale}d
      </span>
    </div>
  );
}

// ─── Empty / loading ────────────────────────────────────────────────
function Loading() {
  return (
    <div style={{ padding: 32 }}>
      {[0, 1, 2].map((i) => (
        <div key={i} className="animate-shimmer" style={{ height: "var(--row-h-cozy)", marginBottom: 4, borderRadius: 6, animationDelay: `${i * 0.12}s` }} />
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
