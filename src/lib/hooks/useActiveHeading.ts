"use client";

/**
 * useActiveHeading — tracks which heading is currently scrolled into view
 * via an IntersectionObserver, returning its DOM id.
 *
 * Extracted from DetailPage.tsx (J: IntersectionObserver active-heading
 * tracking). Used by TableOfContents to highlight the current section.
 */

import { useState, useEffect } from "react";
import { slugify } from "@/lib/slug";

interface Section {
  heading: string;
  level: number;
}

export function useActiveHeading(
  containerRef: React.RefObject<HTMLDivElement | null>,
  sections: Section[],
): string | null {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (sections.length < 4) return;

    const container = containerRef.current;
    if (!container) return;

    const headingElements = sections
      .map((s) => {
        const id = `heading-${slugify(s.heading)}`;
        return document.getElementById(id);
      })
      .filter(Boolean) as HTMLElement[];

    if (headingElements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      {
        root: container,
        rootMargin: "-80px 0px -60% 0px",
        threshold: 0,
      }
    );

    headingElements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections, containerRef]);

  return activeId;
}
