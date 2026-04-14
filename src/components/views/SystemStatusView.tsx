"use client";

import { motion } from "framer-motion";
import { useState, useEffect, useRef } from "react";
import { stagger, fadeSlideUp, springs } from "@/lib/motion";
import { SystemStatusData, Status } from "@/lib/view-models";
import { CalloutBox, Badge, StatusDot, MarkdownRenderer } from "@/components/ui";

// Design tokens
const tokens = {
  text: { primary: "#f7f8f8", secondary: "#d0d6e0", tertiary: "#8a8f98", quaternary: "#62666d" },
  status: { success: "#27a644", emerald: "#10b981", warning: "#f59e0b", error: "#ef4444" },
  bg: { surface: "#191a1b" },
  border: { subtle: "rgba(255,255,255,0.05)", standard: "rgba(255,255,255,0.08)", solid: "#23252a" },
};

const fontFamily = {
  inter: "'Inter Variable', 'SF Pro Display', -apple-system, system-ui, sans-serif",
};

// Status visual configuration
const statusStyles: Record<string, { color: string; bg: string; border: string; label: string }> = {
  ok: {
    color: tokens.status.emerald,
    bg: "rgba(16,185,129,0.06)",
    border: "rgba(16,185,129,0.15)",
    label: "Healthy",
  },
  warn: {
    color: tokens.status.warning,
    bg: "rgba(245,158,11,0.06)",
    border: "rgba(245,158,11,0.15)",
    label: "Warning",
  },
  error: {
    color: tokens.status.error,
    bg: "rgba(239,68,68,0.06)",
    border: "rgba(239,68,68,0.15)",
    label: "Error",
  },
  stale: {
    color: tokens.text.quaternary,
    bg: "rgba(255,255,255,0.02)",
    border: "rgba(255,255,255,0.05)",
    label: "Stale",
  },
  fresh: {
    color: tokens.status.emerald,
    bg: "rgba(16,185,129,0.06)",
    border: "rgba(16,185,129,0.15)",
    label: "Fresh",
  },
};

// E3: Status dot that pulses once on first mount
function PulseStatusDot({ status, size = 14 }: { status: Status; size?: number }) {
  const [hasPulsed, setHasPulsed] = useState(false);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    setHasPulsed(true);
    const timer = setTimeout(() => setHasPulsed(false), 600);
    return () => clearTimeout(timer);
  }, []);

  return (
    <motion.span
      initial={{ scale: 1 }}
      animate={hasPulsed ? { scale: [1, 1.5, 1] } : { scale: 1 }}
      transition={hasPulsed ? { duration: 0.6, ease: "easeInOut" } : { duration: 0 }}
      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}
    >
      <StatusDot status={status} size={size} />
    </motion.span>
  );
}

// Overall status indicator
function OverallIndicator({ status, label }: { status: Status; label: string }) {
  const style = statusStyles[status] || statusStyles.stale;

  return (
    <motion.div
      variants={fadeSlideUp}
      className="flex items-center gap-4 px-5 py-5 rounded-[8px]"
      style={{
        background: style.bg,
        border: `1px solid ${style.border}`,
      }}
    >
      <div className="relative" style={{ width: 14, height: 14 }}>
        <PulseStatusDot status={status} size={14} />
      </div>
      <div>
        <p
          className="text-[16px] font-[590]"
          style={{
            color: style.color,
            fontFamily: fontFamily.inter,
            fontFeatureSettings: '"cv01", "ss03"',
          }}
        >
          {label}
        </p>
        <p
          className="text-[13px] mt-0.5"
          style={{
            color: tokens.text.quaternary,
            fontFamily: fontFamily.inter,
            fontFeatureSettings: '"cv01", "ss03"',
          }}
        >
          Overall system health
        </p>
      </div>
    </motion.div>
  );
}

export function SystemStatusView({ data, view }: { data: SystemStatusData; view: any }) {
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
        <h3
          className="text-[11px] font-[510] uppercase tracking-[0.08em]"
          style={{
            color: tokens.text.quaternary,
            fontFamily: fontFamily.inter,
            fontFeatureSettings: '"cv01", "ss03"',
          }}
        >
          Checks
        </h3>
        {status.checks.length === 0 ? (
          <motion.div variants={fadeSlideUp} className="flex flex-col items-center justify-center py-16">
            <motion.svg
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 0.3, scale: 1 }}
              transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
              width={48}
              height={48}
              viewBox="0 0 24 24"
              fill="none"
              stroke="#62666d"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ marginBottom: 16 }}
            >
              <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </motion.svg>
            <p
              className="text-[14px]"
              style={{
                color: "#62666d",
                fontFamily: fontFamily.inter,
                fontFeatureSettings: '"cv01", "ss03"',
                lineHeight: 1.6,
              }}
            >
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
                  className="flex items-start gap-3 p-5 rounded-[8px] transition-colors duration-150 group"
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
                      <p
                        className="text-[14px] font-[510]"
                        style={{
                          color: style.color,
                          fontFamily: fontFamily.inter,
                          fontFeatureSettings: '"cv01", "ss03"',
                        }}
                      >
                        {check.label}
                      </p>
                      <Badge variant={badgeVariant} dot>{style.label}</Badge>
                    </div>
                    {check.detail && (
                      <div
                        className="text-[13px] mt-1.5 leading-[1.5]"
                        style={{
                          color: tokens.text.quaternary,
                          fontFamily: fontFamily.inter,
                          fontFeatureSettings: '"cv01", "ss03"',
                        }}
                      >
                        <MarkdownRenderer content={check.detail} />
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
          />
        </motion.div>
      )}
    </motion.div>
  );
}