"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface AuditEntry {
  name: string;
  status: "green" | "yellow" | "red";
  lastRun: string;
  details: string;
}

interface AuditData {
  overallStatus: "green" | "yellow" | "red" | "unknown";
  audits: AuditEntry[];
}

const statusColors: Record<string, { bg: string; border: string; text: string; dot: string; label: string }> = {
  green: {
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    text: "text-emerald-400",
    dot: "bg-emerald-400",
    label: "Healthy",
  },
  yellow: {
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    text: "text-amber-400",
    dot: "bg-amber-400",
    label: "Warning",
  },
  red: {
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    text: "text-red-400",
    dot: "bg-red-400",
    label: "Critical",
  },
  unknown: {
    bg: "bg-zinc-500/10",
    border: "border-zinc-500/30",
    text: "text-zinc-400",
    dot: "bg-zinc-400",
    label: "Unknown",
  },
};

function StatusDot({ status, size = "sm" }: { status: string; size?: "sm" | "lg" }) {
  const s = statusColors[status] || statusColors.unknown;
  const dim = size === "lg" ? "w-3 h-3" : "w-2 h-2";
  return (
    <span className={`inline-block ${dim} rounded-full ${s.dot} ${size === "lg" ? "animate-pulse" : ""}`} />
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = statusColors[status] || statusColors.unknown;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.border} border ${s.text}`}>
      <StatusDot status={status} />
      {s.label}
    </span>
  );
}

function AuditCard({ audit, onToggle, expanded }: {
  audit: AuditEntry;
  onToggle: () => void;
  expanded: boolean;
}) {
  const s = statusColors[audit.status] || statusColors.unknown;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-lg border ${s.border} ${s.bg} overflow-hidden`}
    >
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-white/[0.03] transition-colors"
      >
        <div className="flex items-center gap-3">
          <StatusDot status={audit.status} />
          <span className="text-sm font-medium text-zinc-200">{audit.name}</span>
        </div>
        <div className="flex items-center gap-3">
          {audit.lastRun && (
            <span className="text-xs text-zinc-500">{audit.lastRun}</span>
          )}
          <StatusBadge status={audit.status} />
          <motion.span
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="text-zinc-500 text-xs"
          >
            ▼
          </motion.span>
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 pt-1 border-t border-white/5">
              {audit.details ? (
                <p className="text-xs text-zinc-400 leading-relaxed">{audit.details}</p>
              ) : (
                <p className="text-xs text-zinc-600 italic">No details available</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function AuditDashboard() {
  const [data, setData] = useState<AuditData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedAudit, setExpandedAudit] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch("/api/audit-dashboard");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const json: AuditData = await res.json();
      setData(json);
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
    const interval = setInterval(fetchDashboard, 60000);
    return () => clearInterval(interval);
  }, [fetchDashboard]);

  const overallS = statusColors[data?.overallStatus || "unknown"];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2 text-zinc-500 text-sm">
          <span className="w-2 h-2 rounded-full bg-zinc-500 animate-pulse" />
          Loading audit dashboard...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-red-400 text-sm mb-2">Failed to load audit dashboard</p>
          <p className="text-zinc-500 text-xs mb-4">{error}</p>
          <button
            onClick={fetchDashboard}
            className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 text-xs hover:bg-zinc-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const greenCount = data?.audits.filter(a => a.status === "green").length || 0;
  const yellowCount = data?.audits.filter(a => a.status === "yellow").length || 0;
  const redCount = data?.audits.filter(a => a.status === "red").length || 0;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Overall status */}
      <div className={`rounded-xl border ${overallS.border} ${overallS.bg} p-6`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <StatusDot status={data?.overallStatus || "unknown"} size="lg" />
            <div>
              <h2 className="text-lg font-semibold text-zinc-100">System Health</h2>
              <p className={`text-sm ${overallS.text}`}>
                Overall: {overallS.label}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="flex gap-3 text-xs">
              {greenCount > 0 && <span className="text-emerald-400">{greenCount} ok</span>}
              {yellowCount > 0 && <span className="text-amber-400">{yellowCount} warn</span>}
              {redCount > 0 && <span className="text-red-400">{redCount} crit</span>}
            </div>
            <p className="text-xs text-zinc-600 mt-1">
              {data?.audits.length || 0} audits tracked
            </p>
          </div>
        </div>
      </div>

      {/* Audit cards */}
      <div className="space-y-2">
        {data?.audits.map(audit => (
          <AuditCard
            key={audit.name}
            audit={audit}
            expanded={expandedAudit === audit.name}
            onToggle={() => setExpandedAudit(prev => prev === audit.name ? null : audit.name)}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-zinc-600 pt-2">
        <span>Auto-refreshes every 60s</span>
        <span>Last refresh: {lastRefresh.toLocaleTimeString()}</span>
      </div>
    </div>
  );
}