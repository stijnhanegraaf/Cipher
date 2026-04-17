"use client";

/**
 * ActivitySparkline — compact 30-day edit histogram.
 *
 * Renders a row of 30 vertical bars. Bar height is proportional to that day's
 * edit count (peak = full height). Today is the rightmost bar; 29 days ago is
 * leftmost. Quiet days render a 1px baseline tick so the shape stays readable
 * at a glance.
 */
interface Props {
  /** Per-day edit counts, oldest → newest. Length: 30. */
  days: number[];
  /** Max value for normalization (so multiple sparklines can share scale). */
  peak: number;
  /** Total edits — rendered inline as a secondary label. */
  total: number;
}

export function ActivitySparkline({ days, peak, total }: Props) {
  const safePeak = peak > 0 ? peak : 1;
  const h = 44;
  const barW = 4;
  const gap = 2;
  const w = days.length * (barW + gap) - gap;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
        {days.map((v, i) => {
          const bh = Math.max(1, Math.round((v / safePeak) * h));
          const x = i * (barW + gap);
          const y = h - bh;
          // Today (last bar) gets brand color; others are subtle.
          const isToday = i === days.length - 1;
          const color = isToday
            ? "var(--accent-brand)"
            : v > 0
            ? "var(--text-tertiary)"
            : "var(--border-subtle)";
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={barW}
              height={bh}
              rx={1}
              fill={color}
              opacity={v > 0 ? 1 : 0.6}
            />
          );
        })}
      </svg>
      <div className="mono-label" style={{ color: "var(--text-quaternary)", letterSpacing: "0.04em", display: "flex", gap: 12 }}>
        <span>Last 30 days</span>
        <span style={{ color: "var(--text-tertiary)" }}>{total} edits</span>
        <span style={{ color: "var(--text-quaternary)" }}>peak {peak}/day</span>
      </div>
    </div>
  );
}
