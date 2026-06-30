"use client";

/**
 * PropertiesPanel — renders frontmatter badges + tags row for the Detail view.
 *
 * Badge rendering is a faithful move of the inline JSX that previously lived
 * in DetailPage.tsx (~877-933). Tags row is new: shown only when the note
 * has at least one tag, rendered as clickable TagChip links.
 */

import { useMemo } from "react";
import { selectFrontmatterBadges } from "@/lib/markdown/frontmatter-badges";
import { extractTags } from "@/lib/markdown/tags";
import { TagChip } from "@/components/ui/TagChip";
import { theme } from "@/components/detail/detail-theme";

interface PropsPanelProps {
  frontmatter: Record<string, unknown>;
  content: string;
}

export function PropertiesPanel({ frontmatter, content }: PropsPanelProps) {
  const badges = useMemo(() => selectFrontmatterBadges(frontmatter), [frontmatter]);
  const tags = useMemo(() => extractTags(content, frontmatter), [content, frontmatter]);

  const hasBadges = badges.length > 0;
  const hasTags = tags.length > 0;

  if (!hasBadges && !hasTags) return null;

  return (
    <div>
      {/* ── Frontmatter badges ─────────────────────────────────────────── */}
      {hasBadges && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap" as const,
            gap: 8,
            marginTop: 16,
          }}
        >
          {badges.map((badge) => (
            <span
              key={badge.key}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 12px",
                borderRadius: 9999,
                fontSize: 12,
                fontWeight: 510,
                lineHeight: 1.4,
                background:
                  badge.variant === "success"
                    ? "color-mix(in srgb, var(--status-done) 12%, transparent)"
                    : badge.variant === "warning"
                      ? "color-mix(in srgb, var(--status-warning) 12%, transparent)"
                      : badge.variant === "indigo"
                        ? "color-mix(in srgb, var(--accent-brand) 12%, transparent)"
                        : "transparent",
                color:
                  badge.variant === "success"
                    ? "var(--status-done)"
                    : badge.variant === "warning"
                      ? "var(--status-warning)"
                      : badge.variant === "indigo"
                        ? theme.brand.violet
                        : theme.text.tertiary,
                border:
                  badge.variant === "outline"
                    ? `1px solid ${theme.border.subtle}`
                    : badge.variant === "default"
                      ? `1px solid ${theme.border.solid}`
                      : badge.variant === "success"
                        ? "1px solid color-mix(in srgb, var(--status-done) 20%, transparent)"
                        : badge.variant === "warning"
                          ? "1px solid color-mix(in srgb, var(--status-warning) 20%, transparent)"
                          : "1px solid color-mix(in srgb, var(--accent-brand) 20%, transparent)",
              }}
            >
              {badge.value}
            </span>
          ))}
        </div>
      )}

      {/* ── Tags row ───────────────────────────────────────────────────── */}
      {hasTags && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            marginTop: hasBadges ? 8 : 16,
          }}
        >
          {tags.map((tag) => (
            <TagChip key={tag} tag={tag} />
          ))}
        </div>
      )}
    </div>
  );
}
