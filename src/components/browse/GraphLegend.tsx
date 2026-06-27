"use client";

/**
 * GraphLegend — tag legend + filter for the vault graph.
 *
 * Renders chip rows (one per distinct primary tag) positioned over the
 * canvas. Clicking a chip toggles its tag's membership in `visibleTags`.
 * When visibleTags is empty, all nodes are visible (no filter active).
 *
 * Color: each chip uses `--sc: var(--hue-*)` — the same token the canvas
 * resolves for node fill, so legend swatches always match node colors.
 */

import type React from "react";
import { tagColor } from "@/lib/color/tag-color";

export interface TagCount {
  tag: string;   // normalized tag string, or "" for untagged
  count: number; // number of nodes with this as primary tag
}

interface Props {
  tags: TagCount[];
  visibleTags: Set<string>;
  onToggle: (tag: string) => void;
}

export function GraphLegend({ tags, visibleTags, onToggle }: Props) {
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
      }}
      aria-label="Filter graph nodes by tag"
    >
      {tags.map(({ tag, count }) => {
        const token = tagColor(tag);
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
