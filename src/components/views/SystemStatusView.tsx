"use client";

import { SystemStatusData } from "@/lib/view-models";
import { CalloutBox } from "@/components/ui";

const statusColors: Record<string, { bg: string; dot: string; text: string }> = {
  ok: { bg: "bg-emerald-50 dark:bg-emerald-950/30", dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-300" },
  warn: { bg: "bg-amber-50 dark:bg-amber-950/30", dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-300" },
  error: { bg: "bg-red-50 dark:bg-red-950/30", dot: "bg-red-500", text: "text-red-700 dark:text-red-300" },
  stale: { bg: "bg-neutral-50 dark:bg-neutral-800", dot: "bg-neutral-400", text: "text-neutral-600 dark:text-neutral-400" },
  fresh: { bg: "bg-emerald-50 dark:bg-emerald-950/30", dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-300" },
};

export function SystemStatusView({ data, view }: { data: SystemStatusData; view: any }) {
  const status = data as SystemStatusData;

  return (
    <div className="space-y-4">
      {/* Overall status */}
      <div className="flex items-center gap-3">
        <div className={`w-3 h-3 rounded-full ${statusColors[status.overall.status]?.dot || "bg-neutral-400"}`} />
        <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{status.overall.label}</span>
      </div>

      {/* Checks */}
      <div className="space-y-2">
        {status.checks.map((check, i) => {
          const colors = statusColors[check.status] || statusColors.stale;
          return (
            <div key={i} className={`flex items-start gap-3 p-3 rounded-xl ${colors.bg}`}>
              <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${colors.dot}`} />
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${colors.text}`}>{check.label}</p>
                {check.detail && (
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{check.detail}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Attention items */}
      {status.attention && status.attention.length > 0 && (
        <CalloutBox
          tone="warning"
          title="Needs attention"
          body={status.attention.join("; ") + "."}
        />
      )}
    </div>
  );
}