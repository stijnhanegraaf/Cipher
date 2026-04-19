"use client";

/**
 * Segmented pill toggle for the /browse/graph toolbar.
 * Exported MapMode is the persisted union. Parent owns state + persistence.
 */

import type { CSSProperties } from "react";

export type MapMode = "graph" | "structure";

interface Props {
  mode: MapMode;
  onChange: (next: MapMode) => void;
}

const ITEMS: Array<{ value: MapMode; label: string }> = [
  { value: "graph", label: "Graph" },
  { value: "structure", label: "Structure" },
];

export function MapModeToggle({ mode, onChange }: Props) {
  const wrapperStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    height: 26,
    padding: 2,
    background: "var(--bg-surface-alpha-2)",
    border: "1px solid var(--border-subtle)",
    borderRadius: 8,
    gap: 2,
  };

  return (
    <div role="group" aria-label="Map view mode" style={wrapperStyle}>
      {ITEMS.map((item) => {
        const active = item.value === mode;
        const itemStyle: CSSProperties = {
          height: 22,
          padding: "0 10px",
          display: "inline-flex",
          alignItems: "center",
          fontSize: 12,
          fontWeight: active ? 510 : 500,
          letterSpacing: -0.05,
          color: active ? "var(--text-primary)" : "var(--text-tertiary)",
          background: active ? "var(--bg-elevated)" : "transparent",
          boxShadow: active ? "0 1px 2px rgba(0,0,0,0.2)" : "none",
          border: "none",
          borderRadius: 6,
          cursor: active ? "default" : "pointer",
          transition:
            "background var(--motion-hover) var(--ease-default), color var(--motion-hover) var(--ease-default)",
        };
        return (
          <button
            key={item.value}
            type="button"
            aria-pressed={active}
            onClick={() => {
              if (!active) onChange(item.value);
            }}
            style={itemStyle}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
