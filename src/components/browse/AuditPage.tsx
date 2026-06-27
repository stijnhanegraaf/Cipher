"use client";

/**
 * /browse/audit — vault audit dashboard.
 *
 * Three states, branching on `{available}` before touching overallStatus:
 *   1. No vault (409) → connect-vault prompt.
 *   2. available:false → calm "No audits in this vault" empty state.
 *   3. available:true → full dashboard with status summary + audit cards.
 *
 * Token-only colors (no raw Tailwind palette). Auto-refreshes every 60s;
 * manual refresh via the PageShell action.
 */

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PageShell, PageAction } from "@/components/PageShell";
import { StatusDot, Badge } from "@/components/ui";
import type { AuditStatus, AuditEntry } from "@/lib/audit/parse";

// ─── API response type ───────────────────────────────────────────────

interface AuditDashboardResponse {
  available: boolean;
  overallStatus?: AuditStatus;
  audits?: AuditEntry[];
}

// ─── Status → design vocab mapping ──────────────────────────────────

function statusToBadgeVariant(status: AuditStatus): "success" | "warning" | "error" | "outline" {
  if (status === "ok") return "success";
  if (status === "warn") return "warning";
  if (status === "error") return "error";
  return "outline";
}

function statusToLabel(status: AuditStatus): string {
  if (status === "ok") return "Healthy";
  if (status === "warn") return "Warning";
  if (status === "error") return "Critical";
  return "Unknown";
}

// ─── Loading shimmer ─────────────────────────────────────────────────

function Loading() {
  return (
    <div style={{ padding: 32 }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="animate-shimmer"
          style={{ height: 52, marginBottom: 8, borderRadius: 8, animationDelay: `${i * 0.12}s` }}
        />
      ))}
    </div>
  );
}

// ─── No-vault state ──────────────────────────────────────────────────

function NoVaultBlock({ error }: { error: string }) {
  return (
    <div style={{ padding: "40px 32px" }}>
      <p className="caption-large" style={{ color: "var(--status-blocked)", marginBottom: 8 }}>
        {error.toLowerCase().includes("no vault") ? "No vault connected" : "Couldn't load audits"}
      </p>
      <p className="small" style={{ color: "var(--text-tertiary)", marginBottom: 16 }}>{error}</p>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent("cipher:open-vault-connect"))}
        className="focus-ring"
        style={{
          padding: "8px 16px",
          border: "none",
          background: "var(--accent-brand)",
          color: "var(--text-on-brand)",
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 500,
          borderRadius: "var(--radius-row)",
        }}
      >
        Connect a vault
      </button>
    </div>
  );
}

// ─── Empty state (available:false) ──────────────────────────────────

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ padding: "40px 32px" }}>
      <p className="body-medium" style={{ color: "var(--text-secondary)", marginBottom: 8 }}>
        {title}
      </p>
      <p className="small" style={{ color: "var(--text-quaternary)", maxWidth: 480, lineHeight: 1.6 }}>
        {body}
      </p>
    </div>
  );
}

// ─── Audit card ──────────────────────────────────────────────────────

function AuditCard({ audit, expanded, onToggle }: {
  audit: AuditEntry;
  expanded: boolean;
  onToggle: () => void;
}) {
  const variant = statusToBadgeVariant(audit.status);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        borderRadius: 8,
        border: "1px solid var(--border-subtle)",
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="focus-ring"
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          transition: "background var(--motion-hover) var(--ease-default)",
          gap: 12,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-surface-alpha-2)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
          <StatusDot status={audit.status} size={8} />
          <span
            className="body-medium"
            style={{ color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {audit.name}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          {audit.lastRun && (
            <span className="caption" style={{ color: "var(--text-quaternary)" }}>
              {audit.lastRun}
            </span>
          )}
          <Badge variant={variant} dot>
            {statusToLabel(audit.status)}
          </Badge>
          {/* Inline SVG chevron — matches the icon language of Sidebar/PageShell. */}
          <motion.span
            aria-hidden="true"
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
            style={{ display: "inline-flex", alignItems: "center", color: "var(--text-quaternary)" }}
          >
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </motion.span>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="details"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
            style={{ overflow: "hidden" }}
          >
            <div
              style={{
                padding: "8px 16px 12px",
                borderTop: "1px solid var(--border-subtle)",
              }}
            >
              {audit.details ? (
                <p className="small" style={{ color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
                  {audit.details}
                </p>
              ) : (
                <p className="small" style={{ color: "var(--text-quaternary)", fontStyle: "italic", margin: 0 }}>
                  No details available.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Summary row ─────────────────────────────────────────────────────

function StatusSummary({ audits }: { audits: AuditEntry[] }) {
  const ok = audits.filter((a) => a.status === "ok").length;
  const warn = audits.filter((a) => a.status === "warn").length;
  const error = audits.filter((a) => a.status === "error").length;
  const unknown = audits.filter((a) => a.status === "unknown").length;

  return (
    <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
      {ok > 0 && (
        <span className="caption" style={{ color: "var(--status-done)", display: "flex", alignItems: "center", gap: 6 }}>
          <StatusDot status="ok" size={6} />
          {ok} healthy
        </span>
      )}
      {warn > 0 && (
        <span className="caption" style={{ color: "var(--status-in-progress)", display: "flex", alignItems: "center", gap: 6 }}>
          <StatusDot status="warn" size={6} />
          {warn} warning
        </span>
      )}
      {error > 0 && (
        <span className="caption" style={{ color: "var(--status-blocked)", display: "flex", alignItems: "center", gap: 6 }}>
          <StatusDot status="error" size={6} />
          {error} critical
        </span>
      )}
      {unknown > 0 && (
        <span className="caption" style={{ color: "var(--text-quaternary)", display: "flex", alignItems: "center", gap: 6 }}>
          <StatusDot status="stale" size={6} />
          {unknown} unknown
        </span>
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────

export function AuditPage() {
  const [response, setResponse] = useState<AuditDashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedAudit, setExpandedAudit] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch("/api/audit-dashboard");
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as Record<string, unknown>;
        throw new Error((body.error as string) || `HTTP ${res.status}`);
      }
      const json = (await res.json()) as AuditDashboardResponse;
      setResponse(json);
      setError(null);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 60_000);
    return () => clearInterval(interval);
  }, [fetchDashboard]);

  const refresh = useCallback(() => {
    setLoading(true);
    setExpandedAudit(null);
    fetchDashboard();
  }, [fetchDashboard]);

  const audits = response?.audits ?? [];
  const subtitle = response?.available
    ? `${audits.length} audit${audits.length !== 1 ? "s" : ""} · refreshed ${lastRefresh.toLocaleTimeString()}`
    : undefined;

  return (
    <PageShell
      title="Audits"
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

      {!loading && error && <NoVaultBlock error={error} />}

      {/* available:false — no audits folder in this vault (the common case). */}
      {!loading && !error && response && !response.available && (
        <EmptyState
          title="No audits in this vault"
          body={
            "Audits are an optional convention: a folder (e.g. system/audits) with a " +
            "dashboard.md and optional latest-*.md files. None were found in this vault."
          }
        />
      )}

      {/* available:true, but no rows yet. */}
      {!loading && !error && response?.available && audits.length === 0 && (
        <EmptyState
          title="Audits folder found, no entries yet"
          body="Add rows to dashboard.md in your audits folder to track individual audits here."
        />
      )}

      {/* available:true with audit rows. */}
      {!loading && !error && response?.available && audits.length > 0 && (
        <div style={{ padding: "24px 32px 48px", display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Overall status summary */}
          <div
            style={{
              padding: "16px 20px",
              borderRadius: 10,
              border: "1px solid var(--border-subtle)",
              background: "var(--bg-surface-alpha-2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <StatusDot status={response.overallStatus ?? "unknown"} size={10} />
              <div>
                <span className="body-medium" style={{ color: "var(--text-primary)" }}>
                  System Health
                </span>
                <span className="caption" style={{ color: "var(--text-tertiary)", marginLeft: 8 }}>
                  Overall: {statusToLabel(response.overallStatus ?? "unknown")}
                </span>
              </div>
            </div>
            <StatusSummary audits={audits} />
          </div>

          {/* Audit cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {audits.map((audit) => (
              <AuditCard
                key={audit.name}
                audit={audit}
                expanded={expandedAudit === audit.name}
                onToggle={() =>
                  setExpandedAudit((prev) => (prev === audit.name ? null : audit.name))
                }
              />
            ))}
          </div>

          {/* Footer */}
          <p className="caption" style={{ color: "var(--text-quaternary)", marginTop: 4 }}>
            Auto-refreshes every 60s
          </p>
        </div>
      )}
    </PageShell>
  );
}
