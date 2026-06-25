"use client";

/**
 * useAnchorScroll — once `ready` flips to true, scrolls the container to
 * the anchor element (heading or block) and briefly flashes it with the
 * "anchor-highlight" CSS class.
 *
 * Extracted from DetailPage.tsx (H, lines 276-314) — the view-side effect
 * that was entangled with the fetch .then() chain.
 *
 * Split rationale: the fetch chain owned both data loading AND the DOM
 * scroll/flash. We separated them by having useFileContent set data
 * (which React renders), and then useAnchorScroll reacts to `ready` (data
 * non-null) with a useEffect that fires after paint via two rAF ticks —
 * preserving the identical effect dependency / ordering as the original.
 */

import { useEffect } from "react";

export function useAnchorScroll(
  containerRef: React.RefObject<HTMLDivElement | null>,
  /** True once file data has been set and the DOM is ready to scroll. */
  ready: boolean,
  anchor: string | undefined,
): void {
  useEffect(() => {
    if (!ready || !anchor) return;

    // Two rAF ticks so MarkdownRenderer has painted — identical to the
    // original double-rAF in the fetch .then() chain.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const container = containerRef.current;
        if (!container) return;

        let el: HTMLElement | null = null;

        if (anchor.startsWith("^")) {
          // Block anchor: find the rendered element whose text ends with
          // the Obsidian block marker ` ^<id>`.
          const blockId = anchor.slice(1);
          const markerRe = new RegExp(`\\^${CSS.escape(blockId)}\\s*$`);
          const candidates = container.querySelectorAll("p, li, td, th, h1, h2, h3, h4, h5, h6");
          for (const node of candidates) {
            if (markerRe.test((node as HTMLElement).innerText ?? "")) {
              el = node as HTMLElement;
              break;
            }
          }
        } else {
          // Heading anchor: use the existing `id="heading-<slug>"` convention.
          const id = `heading-${anchor}`;
          el = container.querySelector(`#${CSS.escape(id)}`) as HTMLElement | null;
        }

        if (!el) return;
        el.scrollIntoView({ block: "start", behavior: "smooth" });
        // Retrigger animation each time the path/anchor combination changes
        // by toggling the class — identical to original behaviour.
        el.classList.remove("anchor-highlight");
        void el.offsetWidth;
        el.classList.add("anchor-highlight");
        window.setTimeout(() => el!.classList.remove("anchor-highlight"), 2100);
      })
    );
  }, [ready, anchor, containerRef]);
}
