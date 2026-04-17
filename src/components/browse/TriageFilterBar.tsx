"use client";

export type TriageFilter =
  | "all"
  | "open"
  | "blocked"
  | "changed24h"
  | "mentions"
  | "highlights";

interface Props {
  active: TriageFilter;
  counts: {
    all: number;
    open: number;
    blocked: number;
    changed24h: number;
    mentions: number;
    highlights: number;
  } | null;
  onChange: (f: TriageFilter) => void;
}

const order: { key: TriageFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "blocked", label: "Blocked" },
  { key: "changed24h", label: "Changed 24h" },
  { key: "mentions", label: "Mentions" },
  { key: "highlights", label: "Highlights" },
];

export function TriageFilterBar({ active, counts, onChange }: Props) {
  return (
    <div
      className="flex flex-wrap gap-1.5"
      role="group"
      aria-label="Triage filters"
    >
      {order.map(({ key, label }) => {
        const count = counts ? counts[key] : null;
        if (key !== "all" && count === 0) return null;
        return (
          <button
            key={key}
            type="button"
            className="filter-chip focus-ring"
            data-active={active === key ? "true" : undefined}
            aria-pressed={active === key}
            onClick={() => onChange(key)}
          >
            <span>{label}</span>
            {count != null && (
              <span
                className="mono-label"
                style={{
                  opacity: 0.6,
                  letterSpacing: "0.02em",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
