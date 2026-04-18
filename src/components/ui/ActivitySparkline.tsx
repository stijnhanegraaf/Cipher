"use client";

import { useState } from "react";

/**
 * ActivitySparkline — 30-day edit histogram with hover detail.
 *
 * Fills its container (responsive). Bar height is proportional to that day's
 * edit count. Today is the rightmost bar, highlighted in brand; past days
 * gradient from quaternary → tertiary by recency. Baseline day-of-week ticks
 * underneath help scanning weekly rhythm. Hovering a bar pops a tooltip with
 * the exact date + count.
 */
interface Props {
  /** Per-day edit counts, oldest → newest. Length: 30. */
  days: number[];
  /** Max value for normalization (so multiple charts can share scale). */
  peak: number;
  /** Total edits — rendered inline as a secondary label. */
  total: number;
}

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function formatDate(offsetFromToday: number): string {
  const d = new Date();
  d.setDate(d.getDate() - offsetFromToday);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function ActivitySparkline({ days, peak, total }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const safePeak = peak > 0 ? peak : 1;
  const h = 120;
  const n = days.length;

  // Figure out today's weekday for the label strip underneath.
  const today = new Date().getDay();
  const weekdayForIndex = (i: number) => {
    // i = 29 is today, i = 0 is 29 days ago.
    const offset = n - 1 - i;
    return (today - offset + 7 * 100) % 7;
  };

  const hoverDate = hover !== null ? formatDate(n - 1 - hover) : null;
  const hoverCount = hover !== null ? days[hover] : 0;

  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}
      onMouseLeave={() => setHover(null)}
    >
      {/* Header row: title + tooltip replacement when hovering. */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <div className="caption" style={{ color: "var(--text-tertiary)" }}>
          {hover !== null ? (
            <span>
              <span style={{ color: "var(--text-primary)", fontVariantNumeric: "tabular-nums", fontWeight: 510 }}>{hoverCount}</span>
              <span style={{ color: "var(--text-quaternary)" }}> edit{hoverCount === 1 ? "" : "s"} · </span>
              <span>{hoverDate}</span>
            </span>
          ) : (
            <span>
              <span style={{ color: "var(--text-primary)", fontVariantNumeric: "tabular-nums", fontWeight: 510 }}>{total}</span>
              <span style={{ color: "var(--text-quaternary)" }}> edits in last 30 days</span>
            </span>
          )}
        </div>
        <div className="mono-label" style={{ color: "var(--text-quaternary)", letterSpacing: "0.04em" }}>
          peak {peak}/day
        </div>
      </div>

      {/* Bars — stretch to container width. */}
      <div
        style={{
          position: "relative",
          width: "100%",
          height: h,
          display: "grid",
          gridTemplateColumns: `repeat(${n}, 1fr)`,
          alignItems: "end",
          gap: 3,
        }}
      >
        {/* Subtle horizontal baselines at 25/50/75/100%. */}
        {[0.25, 0.5, 0.75].map((t) => (
          <div
            key={t}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: `${t * 100}%`,
              borderTop: "1px dashed var(--border-subtle)",
              pointerEvents: "none",
            }}
          />
        ))}
        {days.map((v, i) => {
          const bh = Math.max(2, (v / safePeak) * h);
          const isToday = i === n - 1;
          const isHovered = i === hover;
          const recency = i / (n - 1);
          const fill = isToday
            ? "var(--accent-brand)"
            : isHovered
            ? "var(--accent-brand)"
            : v > 0
            ? (recency > 0.75 ? "var(--text-secondary)" : "var(--text-tertiary)")
            : "var(--border-standard)";
          return (
            <div
              key={i}
              onMouseEnter={() => setHover(i)}
              style={{
                height: bh,
                background: fill,
                borderRadius: 2,
                opacity: v > 0 ? 1 : 0.55,
                transition: "background var(--motion-hover) var(--ease-default), transform var(--motion-hover) var(--ease-default)",
                transform: isHovered ? "scaleY(1.04)" : "scaleY(1)",
                transformOrigin: "bottom center",
                cursor: "default",
              }}
            />
          );
        })}
      </div>

      {/* Day-of-week strip. Shows only at Sunday/Wednesday intervals so it
          doesn't crowd at 30 columns. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${n}, 1fr)`,
          gap: 3,
          color: "var(--text-quaternary)",
          fontSize: 10,
          fontFamily: "var(--font-mono)",
          letterSpacing: "0.04em",
          textAlign: "center",
        }}
      >
        {days.map((_, i) => {
          const wd = weekdayForIndex(i);
          const show = wd === 0; // Sunday marker only
          return (
            <span key={i} style={{ opacity: show ? 1 : 0 }}>
              {DAY_LABELS[wd]}
            </span>
          );
        })}
      </div>
    </div>
  );
}
