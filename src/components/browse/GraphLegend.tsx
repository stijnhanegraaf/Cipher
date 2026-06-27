"use client";

/**
 * GraphLegend — tag legend + filter + colour-mode toggle for the vault graph.
 *
 * Renders chip rows (one per distinct primary tag) positioned over the
 * canvas. Clicking a chip toggles its tag's membership in `visibleTags`.
 * When visibleTags is empty, all nodes are visible (no filter active).
 *
 * Also renders a "Colors" segmented toggle that switches the graph between
 * the restrained mono + status-hues default and the full semantic rainbow.
 *
 * Color: each chip uses `--sc: var(--hue-*)` — the same token the canvas
 * resolves for node fill, so legend swatches always match node colors.
 */

import type React from "react";
import { tagColor, statusTagColor } from "@/lib/color/tag-color";

export interface TagCount {
  tag: string;   // normalized tag string, or "" for untagged
  count: number; // number of nodes with this as primary tag
}

interface Props {
  tags: TagCount[];
  visibleTags: Set<string>;
  onToggle: (tag: string) => void;
  /** Whether the rainbow (full semantic) palette is active. */
  rainbow?: boolean;
  /** Called to flip the rainbow toggle. */
  onRainbowToggle?: () => void;
}

export function GraphLegend({ tags, visibleTags, onToggle, rainbow = false, onRainbowToggle }: Props) {
  if (tags.length === 0) return null;

  const hasFilter = visibleTags.size > 0;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 40,
        right: 12,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        alignItems: "flex-end",
        maxHeight: "calc(100% - 80px)",
        overflowY: "auto",
        pointerEvents: "auto",
        zIndex: 1,
      }}
      aria-label="Filter graph nodes by tag"
    >
      {/* Colour-mode toggle */}
      {onRainbowToggle && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            marginBottom: 4,
            padding: "2px 4px",
            borderRadius: 6,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-standard)",
          }}
        >
          <span
            style={{
              fontSize: "0.72rem",
              color: "var(--text-quaternary)",
              paddingLeft: 2,
              letterSpacing: "0.02em",
              userSelect: "none",
            }}
          >
            Colors:
          </span>
          <button
            type="button"
            onClick={!rainbow ? undefined : onRainbowToggle}
            aria-pressed={!rainbow}
            style={
              {
                fontSize: "0.72rem",
                padding: "1px 6px",
                borderRadius: 4,
                border: "none",
                background: !rainbow ? "var(--accent-brand)" : "transparent",
                color: !rainbow ? "var(--bg-marketing)" : "var(--text-tertiary)",
                cursor: rainbow ? "pointer" : "default",
                userSelect: "none",
              } as React.CSSProperties
            }
          >
            Status
          </button>
          <button
            type="button"
            onClick={rainbow ? undefined : onRainbowToggle}
            aria-pressed={rainbow}
            style={
              {
                fontSize: "0.72rem",
                padding: "1px 6px",
                borderRadius: 4,
                border: "none",
                background: rainbow ? "var(--accent-brand)" : "transparent",
                color: rainbow ? "var(--bg-marketing)" : "var(--text-tertiary)",
                cursor: !rainbow ? "pointer" : "default",
                userSelect: "none",
              } as React.CSSProperties
            }
          >
            Tags
          </button>
        </div>
      )}

      {tags.map(({ tag, count }) => {
        // Match the canvas: mono + status hues by default, full rainbow when toggled.
        const token = rainbow ? tagColor(tag) : statusTagColor(tag);
        const label = tag || "untagged";
        const isSelected = hasFilter ? visibleTags.has(tag) : false;

        return (
          <button
            key={tag}
            type="button"
            className="chip"
            aria-pressed={isSelected}
            data-selected={isSelected ? "true" : undefined}
            onClick={() => onToggle(tag)}
            style={
              {
                "--sc": `var(${token})`,
                display: "flex",
                alignItems: "center",
                gap: 6,
                cursor: "pointer",
                userSelect: "none",
              } as React.CSSProperties
            }
          >
            {label}
            <span
              style={{
                opacity: 0.6,
                fontSize: "0.85em",
              }}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
