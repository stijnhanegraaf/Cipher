"use client";

import { motion } from "framer-motion";
import { SystemStatusData, Status } from "@/lib/view-models";
import { CalloutBox, Badge } from "@/components/ui";

const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 },
};

// Status configuration with richer visual treatment
const statusStyles: Record<string, { bg: string; border: string; dot: string; dotRing: string; text: string; label: string }> = {
  ok: {
    bg: "bg-emerald-50/60 dark:bg-emerald-950/20",
    border: "border-emerald-200/60 dark:border-emerald-800/40",
    dot: "bg-emerald-500 dark:bg-emerald-400",
    dotRing: "ring-emerald-200 dark:ring-emerald-800/50",
    text: "text-emerald-700 dark:text-emerald-300",
    label: "Healthy",
  },
  warn: {
    bg: "bg-amber-50/60 dark:bg-amber-950/20",
    border: "border-amber-200/60 dark:border-amber-800/40",
    dot: "bg-amber-500 dark:bg-amber-400",
    dotRing: "ring-amber-200 dark:ring-amber-800/50",
    text: "text-amber-700 dark:text-amber-300",
    label: "Warning",
  },
  error: {
    bg: "bg-red-50/60 dark:bg-red-950/20",
    border: "border-red-200/60 dark:border-red-800/40",
    dot: "bg-red-500 dark:bg-red-400",
    dotRing: "ring-red-200 dark:ring-red-800/50",
    text: "text-red-700 dark:text-red-300",
    label: "Error",
  },
  stale: {
    bg: "bg-neutral-50 dark:bg-neutral-800/30",
    border: "border-neutral-200/60 dark:border-neutral-700/40",
    dot: "bg-neutral-400 dark:bg-neutral-500",
    dotRing: "ring-neutral-300 dark:ring-neutral-600",
    text: "text-neutral-600 dark:text-neutral-400",
    label: "Stale",
  },
  fresh: {
    bg: "bg-emerald-50/60 dark:bg-emerald-950/20",
    border: "border-emerald-200/60 dark:border-emerald-800/40",
    dot: "bg-emerald-500 dark:bg-emerald-400",
    dotRing: "ring-emerald-200 dark:ring-emerald-800/50",
    text: "text-emerald-700 dark:text-emerald-300",
    label: "Fresh",
  },
};

// Overall status indicator — bigger and more prominent
function OverallIndicator({ status, label }: { status: Status; label: string }) {
  const style = statusStyles[status] || statusStyles.stale;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      className={`flex items-center gap-3.5 px-4 py-3.5 rounded-xl border ${style.bg} ${style.border}`}
    >
      <div className="relative">
        <span className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded-full ${style.dot} ring-2 ${style.dotRing}`} />
        {/* Pulse animation for active statuses */}
        {(status === "ok" || status === "fresh") && (
          <span className={`absolute inset-0 w-3.5 h-3.5 rounded-full ${style.dot} animate-ping opacity-20`} />
        )}
      </div>
      <div>
        <p className={`text-sm font-semibold ${style.text}`}>{label}</p>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">Overall system health</p>
      </div>
    </motion.div>
  );
}

export function SystemStatusView({ data, view }: { data: SystemStatusData; view: any }) {
  const status = data as SystemStatusData;

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
      className="space-y-5"
    >
      {/* Overall status */}
      <motion.div variants={fadeUp} transition={{ duration: 0.35 }}>
        <OverallIndicator status={status.overall.status} label={status.overall.label} />
      </motion.div>

      {/* Checks */}
      <div className="space-y-2">
        {status.checks.map((check, i) => {
          const style = statusStyles[check.status] || statusStyles.stale;
          return (
            <motion.div
              key={i}
              variants={fadeUp}
              transition={{ duration: 0.35 }}
              className={`flex items-start gap-3 p-3.5 rounded-xl border ${style.bg} ${style.border} transition-colors duration-150`}
            >
              <span className={`inline-flex items-center justify-center w-2 h-2 rounded-full mt-1 shrink-0 ${style.dot}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={`text-sm font-medium ${style.text}`}>{check.label}</p>
                  <Badge variant={check.status === "ok" || check.status === "fresh" ? "success" : check.status === "warn" ? "warning" : "error"}>
                    {style.label}
                  </Badge>
                </div>
                {check.detail && (
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 leading-relaxed">{check.detail}</p>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Attention items */}
      {status.attention && status.attention.length > 0 && (
        <motion.div variants={fadeUp} transition={{ duration: 0.35 }}>
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