"use client";

import { useState } from "react";

/**
 * LinkDistributionChart — vertical bar chart of backlink-count buckets.
 *
 * Answers: "How connected is my vault?" Each bucket (Orphan, Light, Linked,
 * Connected, Hub) gets a bar proportional to the note count in that bucket.
 * Hover reveals the exact count and range. Hub bucket is brand-tinted to
 * visually emphasise the vault's gravity centers.
 */
interface Bucket {
  bucket: string;
  range: string;
  count: number;
}

interface Props {
  data: Bucket[];
  total: number;
}

const COLORS = [
  "var(--text-quaternary)",  // Orphan — dimmest
  "var(--text-tertiary)",    // Light
  "var(--text-secondary)",   // Linked
  "var(--accent-violet)",    // Connected
  "var(--accent-brand)",     // Hub — brightest
];

export function LinkDistributionChart({ data, total }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const peak = Math.max(1, ...data.map((d) => d.count));
  const h = 120;

  const hovered = hover !== null ? data[hover] : null;
  const hoveredPct = hovered && total > 0 ? Math.round((hovered.count / total) * 100) : 0;

  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}
      onMouseLeave={() => setHover(null)}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <div className="caption" style={{ color: "var(--text-tertiary)" }}>
          {hovered ? (
            <span>
              <span style={{ color: "var(--text-primary)", fontVariantNumeric: "tabular-nums", fontWeight: 510 }}>{hovered.count}</span>
              <span style={{ color: "var(--text-quaternary)" }}> notes · </span>
              <span>{hovered.bucket}</span>
              <span style={{ color: "var(--text-quaternary)" }}> ({hovered.range} backlinks)</span>
            </span>
          ) : (
            <span>
              <span style={{ color: "var(--text-primary)", fontVariantNumeric: "tabular-nums", fontWeight: 510 }}>{total}</span>
              <span style={{ color: "var(--text-quaternary)" }}> notes by connectivity</span>
            </span>
          )}
        </div>
        <div className="mono-label" style={{ color: "var(--text-quaternary)", letterSpacing: "0.04em" }}>
          {hovered ? `${hoveredPct}% of vault` : "backlinks per note"}
        </div>
      </div>

      {/* Bars */}
      <div
        style={{
          position: "relative",
          width: "100%",
          height: h,
          display: "grid",
          gridTemplateColumns: `repeat(${data.length}, 1fr)`,
          alignItems: "end",
          gap: 10,
        }}
      >
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
        {data.map((d, i) => {
          const bh = Math.max(4, (d.count / peak) * h);
          const isHovered = i === hover;
          return (
            <div
              key={d.bucket}
              onMouseEnter={() => setHover(i)}
              style={{
                position: "relative",
                height: bh,
                background: COLORS[i],
                borderRadius: "var(--radius-small)",
                transition: "background var(--motion-hover) var(--ease-default), transform var(--motion-hover) var(--ease-default)",
                transform: isHovered ? "scaleY(1.03)" : "scaleY(1)",
                transformOrigin: "bottom center",
                cursor: "default",
                opacity: isHovered || hover === null ? 1 : 0.65,
              }}
            >
              {/* Count label inside the bar if it fits, above if not. */}
              <span
                className="caption-medium"
                style={{
                  position: "absolute",
                  left: "50%",
                  transform: "translateX(-50%)",
                  bottom: bh > 28 ? 6 : "calc(100% + 4px)",
                  color: bh > 28 && i >= 3 ? "var(--text-on-brand)" : "var(--text-primary)",
                  fontVariantNumeric: "tabular-nums",
                  pointerEvents: "none",
                  whiteSpace: "nowrap",
                }}
              >
                {d.count}
              </span>
            </div>
          );
        })}
      </div>

      {/* Bucket labels */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${data.length}, 1fr)`,
          gap: 10,
          color: "var(--text-tertiary)",
        }}
      >
        {data.map((d, i) => (
          <div key={d.bucket} style={{ textAlign: "center", minWidth: 0 }}>
            <div
              className="mono-label"
              style={{
                color: hover === i ? "var(--text-primary)" : "var(--text-tertiary)",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                transition: "color var(--motion-hover) var(--ease-default)",
              }}
            >
              {d.bucket}
            </div>
            <div className="mono-label" style={{ color: "var(--text-quaternary)", marginTop: 2 }}>
              {d.range}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
