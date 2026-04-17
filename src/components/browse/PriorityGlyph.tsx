"use client";

/**
 * PriorityGlyph — Linear-style stacked 4-bar priority indicator.
 *
 * High    ▉  (all 4 bars filled red)
 * Medium  ▇  (bottom 3 filled amber)
 * Low     ▅  (bottom 2 gray)
 * None    ▁  (outline only)
 *
 * Renders in a 14×14 container so it aligns with StatusDot at the row's leading edge.
 */

export type Priority = "high" | "medium" | "low" | "none";

const priorityConfig: Record<Priority, { filled: number; color: string }> = {
  high:   { filled: 4, color: "var(--status-blocked)" },
  medium: { filled: 3, color: "var(--status-in-progress)" },
  low:    { filled: 2, color: "var(--text-tertiary)" },
  none:   { filled: 0, color: "var(--text-quaternary)" },
};

export function PriorityGlyph({ priority, size = 14 }: { priority: Priority; size?: number }) {
  const { filled, color } = priorityConfig[priority];
  const barWidth = 2;
  const barGap = 1.5;
  const totalWidth = barWidth * 4 + barGap * 3;
  const offset = (size - totalWidth) / 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-label={`priority: ${priority}`}
      style={{ display: "block" }}
    >
      {[0, 1, 2, 3].map((i) => {
        const barHeight = 3 + i * 2; // tallest bar on the right
        const x = offset + i * (barWidth + barGap);
        const y = size - 2 - barHeight;
        const isFilled = i < filled;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barWidth}
            height={barHeight}
            rx={0.5}
            fill={isFilled ? color : "transparent"}
            stroke={color}
            strokeWidth={0.75}
            opacity={isFilled ? 1 : 0.35}
          />
        );
      })}
    </svg>
  );
}
