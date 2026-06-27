"use client";

/**
 * GraphLegend — tag filter panel + colour-mode toggle for the vault graph.
 *
 * Renders chip rows (one per distinct primary tag) positioned over the
 * canvas. Clicking a chip toggles its tag's membership in `visibleTags`.
 * When visibleTags is empty, all nodes are visible (no filter active).
 *
 * Chip swatches use `tagArcColor` — the same color the canvas uses for
 * per-tag rim arcs, so the legend always matches the on-node arcs.
 *
 * When a filter is active, a "Clear" affordance empties the filter set.
 *
 * Also renders a "Colors" segmented toggle that switches the graph between
 * the restrained mono + status-hues default and the full semantic rainbow.
 * (The rainbow toggle controls node body color only; arc/swatch color is
 * always tagArcColor regardless of that setting.)
 */

import type React from "react";
import { tagArcColor } from "@/lib/color/tag-color";

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
  /** Called to clear all active tag filters (empties visibleTags). */
  onClearFilter?: () => void;
}

export function GraphLegend({ tags, visibleTags, onToggle, rainbow = false, onRainbowToggle, onClearFilter }: Props) {
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

      {/* Clear filter affordance — visible only when a filter is active */}
      {hasFilter && onClearFilter && (
        <button
          type="button"
          onClick={onClearFilter}
          style={{
            fontSize: "0.72rem",
            padding: "2px 8px",
            borderRadius: 4,
            border: "1px solid var(--border-standard)",
            background: "var(--bg-elevated)",
            color: "var(--text-tertiary)",
            cursor: "pointer",
            userSelect: "none",
            alignSelf: "flex-end",
          }}
        >
          Clear filter
        </button>
      )}

      {tags.map(({ tag, count }) => {
        // Arc color — always tagArcColor so swatch matches the on-node rim arcs,
        // independent of the Status|Tags rainbow body-color toggle.
        const token = tagArcColor(tag);
        const label = tag || "untagged";
        const isSelected = visibleTags.has(tag);

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
                // When a filter is active, dim excluded tags to make inclusion obvious.
                opacity: hasFilter && !isSelected ? 0.4 : 1,
                transition: "opacity 0.15s",
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
