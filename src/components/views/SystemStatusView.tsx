"use client";

import { motion } from "framer-motion";
import { stagger, fadeSlideUp } from "@/lib/motion";
import { SystemStatusData, Status } from "@/lib/view-models";
import { CalloutBox, Badge } from "@/components/ui";

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

// Status visual configuration — green/amber/red status indicators
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

// Overall status indicator — bigger and more prominent
function OverallIndicator({ status, label }: { status: Status; label: string }) {
  const style = statusStyles[status] || statusStyles.stale;

  return (
    <motion.div
      variants={fadeSlideUp}
      className="flex items-center gap-3.5 px-4 py-3.5 rounded-[8px]"
      style={{
        background: style.bg,
        border: `1px solid ${style.border}`,
      }}
    >
      <div className="relative">
        <span
          className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full"
          style={{ background: style.color }}
        />
        {/* Pulse animation for active statuses */}
        {(status === "ok" || status === "fresh") && (
          <span
            className="absolute inset-0 w-3.5 h-3.5 rounded-full animate-ping"
            style={{ background: style.color, opacity: 0.2 }}
          />
        )}
      </div>
      <div>
        <p
          className="text-[14px] font-[590]"
          style={{
            color: style.color,
            fontFamily: fontFamily.inter,
            fontFeatureSettings: '"cv01", "ss03"',
          }}
        >
          {label}
        </p>
        <p
          className="text-[12px] mt-0.5"
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
      variants={stagger.container(0.08)}
      initial="hidden"
      animate="show"
      className="space-y-5"
    >
      {/* Overall status */}
      <OverallIndicator status={status.overall.status} label={status.overall.label} />

      {/* Checks */}
      <div className="space-y-2">
        {status.checks.map((check, i) => {
          const style = statusStyles[check.status] || statusStyles.stale;
          const badgeVariant = check.status === "ok" || check.status === "fresh" ? "success" : check.status === "warn" ? "warning" : "error";

          return (
            <motion.div
              key={i}
              variants={fadeSlideUp}
              className="flex items-start gap-3 p-3.5 rounded-[8px] transition-colors duration-150"
              style={{
                background: style.bg,
                border: `1px solid ${style.border}`,
              }}
            >
              <span
                className="inline-flex items-center justify-center w-2 h-2 rounded-full mt-1.5 shrink-0"
                style={{ background: style.color }}
              />
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
                  <p
                    className="text-[13px] mt-1 leading-[1.5]"
                    style={{
                      color: tokens.text.quaternary,
                      fontFamily: fontFamily.inter,
                      fontFeatureSettings: '"cv01", "ss03"',
                    }}
                  >
                    {check.detail}
                  </p>
                )}
              </div>
            </motion.div>
          );
        })}
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