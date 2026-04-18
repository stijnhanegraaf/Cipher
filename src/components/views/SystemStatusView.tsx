"use client";

/** Renders SystemStatusData in the chat-summary variant. */

import { motion } from "framer-motion";
import { stagger, fadeSlideUp } from "@/lib/motion";
import { SystemStatusData, Status, ViewModel } from "@/lib/view-models";
import { CalloutBox, Badge, StatusDot, MarkdownRenderer } from "@/components/ui";

// Status visual configuration — derived from status CSS vars.
const statusStyles: Record<string, { color: string; bg: string; border: string; label: string }> = {
  ok:    { color: "var(--status-done)",        bg: "color-mix(in srgb, var(--status-done) 6%, transparent)",        border: "color-mix(in srgb, var(--status-done) 15%, transparent)",        label: "Healthy" },
  warn:  { color: "var(--status-in-progress)", bg: "color-mix(in srgb, var(--status-in-progress) 6%, transparent)", border: "color-mix(in srgb, var(--status-in-progress) 15%, transparent)", label: "Warning" },
  error: { color: "var(--status-blocked)",     bg: "color-mix(in srgb, var(--status-blocked) 6%, transparent)",     border: "color-mix(in srgb, var(--status-blocked) 15%, transparent)",     label: "Error" },
  stale: { color: "var(--text-quaternary)",    bg: "var(--bg-surface-alpha-2)",                                      border: "var(--border-subtle)",                                            label: "Stale" },
  fresh: { color: "var(--status-done)",        bg: "color-mix(in srgb, var(--status-done) 6%, transparent)",        border: "color-mix(in srgb, var(--status-done) 15%, transparent)",        label: "Fresh" },
};

// Status dot — uses CSS .pulse-subtle on first mount for a calm breathe, not a scale pop.
function PulseStatusDot({ status, size = 14 }: { status: Status; size?: number }) {
  return (
    <span className="pulse-subtle" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
      <StatusDot status={status} size={size} />
    </span>
  );
}

// Overall status indicator
function OverallIndicator({ status, label }: { status: Status; label: string }) {
  const style = statusStyles[status] || statusStyles.stale;

  return (
    <motion.div
      variants={fadeSlideUp}
      className="flex items-center gap-3 p-4 rounded-[8px]"
      style={{
        background: style.bg,
        border: `1px solid ${style.border}`,
      }}
    >
      <div className="relative" style={{ width: 14, height: 14 }}>
        <PulseStatusDot status={status} size={14} />
      </div>
      <div>
        <p className="body-emphasis" style={{ color: style.color }}>
          {label}
        </p>
        <p className="caption text-text-quaternary mt-0.5">
          Overall system health
        </p>
      </div>
    </motion.div>
  );
}

export function SystemStatusView({ data, view, onNavigate }: { data: unknown; view: ViewModel; onNavigate?: (path: string) => void }) {
  const status = data as SystemStatusData;

  return (
    <motion.div
      variants={stagger.container(0.04)}
      initial="hidden"
      animate="show"
      className="space-y-8"
    >
      {/* Overall status */}
      <OverallIndicator status={status.overall.status} label={status.overall.label} />

      {/* Checks */}
      <div className="space-y-3">
        <h3 className="micro uppercase tracking-[0.08em] text-text-quaternary">
          Checks
        </h3>
        {status.checks.length === 0 ? (
          <motion.div variants={fadeSlideUp} className="flex flex-col items-center justify-center py-16">
            <motion.svg
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.3 }}
              transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
              width={48}
              height={48}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mb-4 text-text-quaternary"
            >
              <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </motion.svg>
            <p className="caption-large text-text-quaternary" style={{ lineHeight: 1.6 }}>
              No checks configured.
            </p>
          </motion.div>
        ) : (
          <>
            {status.checks.map((check, i) => {
              const style = statusStyles[check.status] || statusStyles.stale;
              const badgeVariant = check.status === "ok" || check.status === "fresh" ? "success" : check.status === "warn" ? "warning" : "error";

              return (
                <motion.div
                  key={i}
                  variants={fadeSlideUp}
                  className="flex items-start gap-3 p-4 rounded-[8px] transition-colors duration-150 group"
                  style={{
                    background: style.bg,
                    border: `1px solid ${style.border}`,
                    cursor: "default",
                  }}
                >
                  <div className="mt-1 shrink-0">
                    <PulseStatusDot status={check.status} size={6} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="caption-large" style={{ color: style.color }}>
                        {check.label}
                      </p>
                      <Badge variant={badgeVariant} dot>{style.label}</Badge>
                    </div>
                    {check.detail && (
                      <div className="caption text-text-quaternary mt-1.5" style={{ lineHeight: 1.5 }}>
                        <MarkdownRenderer content={check.detail} onNavigate={onNavigate} />
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </>
        )}
      </div>

      {/* Attention items */}
      {status.attention && status.attention.length > 0 && (
        <motion.div variants={fadeSlideUp}>
          <CalloutBox
            tone="warning"
            title="Needs attention"
            body={status.attention.join(". ") + "."}
            onNavigate={onNavigate}
          />
        </motion.div>
      )}
    </motion.div>
  );
}
