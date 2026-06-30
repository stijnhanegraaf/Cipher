"use client";

/**
 * TableOfContents — sticky sidebar TOC with active-heading highlighting.
 *
 * Extracted from DetailPage.tsx (D: TOC rendering, K: scrollToHeading).
 * The IntersectionObserver logic lives in useActiveHeading (J).
 *
 * Usage:
 *   const activeId = useActiveHeading(scrollRef, data.sections);
 *   <TableOfContents sections={...} activeId={activeId} scrollRef={scrollRef} />
 */

import { useCallback } from "react";
import { theme } from "@/components/detail/detail-theme";
import { slugify } from "@/lib/slug";

interface TocSection {
  heading: string;
  level: number;
}

interface TableOfContentsProps {
  sections: TocSection[];
  activeId: string | null;
}

export function TableOfContents({ sections, activeId }: TableOfContentsProps) {
  // scrollToHeading — extracted from DetailPage (K).
  const scrollToHeading = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  return (
    <nav
      style={{
        position: "sticky",
        top: 64,
        maxHeight: "calc(100vh - 96px)",
        overflowY: "auto",
        width: 180,
        flexShrink: 0,
      }}
    >
      <p
        style={{
          fontSize: 11,
          fontWeight: 510,
          letterSpacing: "0.08em",
          textTransform: "uppercase" as const,
          color: theme.text.quaternary,
          marginBottom: 12,
        }}
      >
        On this page
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {sections.map((section) => {
          const id = `heading-${slugify(section.heading)}`;
          const isActive = activeId === id;
          const paddingLeft = (section.level - 1) * 16;

          return (
            <button
              key={id}
              onClick={() => scrollToHeading(id)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: `4px ${12 + paddingLeft}px`,
                fontSize: 12,
                fontWeight: isActive ? 510 : 400,
                lineHeight: 1.5,
                color: isActive ? theme.text.secondary : theme.text.quaternary,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                borderRadius: 8,
                transition: "color var(--motion-hover) var(--ease-default), background var(--motion-hover) var(--ease-default)",
                textOverflow: "ellipsis",
                overflow: "hidden",
                whiteSpace: "nowrap" as const,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = theme.text.secondary;
                e.currentTarget.style.background = "var(--bg-surface-alpha-2)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = isActive ? theme.text.secondary : theme.text.quaternary;
                e.currentTarget.style.background = "transparent";
              }}
            >
              {section.heading}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
