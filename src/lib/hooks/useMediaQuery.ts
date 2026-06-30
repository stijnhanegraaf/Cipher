"use client";

import { useEffect, useState } from "react";

/**
 * SSR-safe matchMedia hook.
 *
 * Returns `false` on the server and on the first client render to avoid
 * hydration mismatches. After mount, reads the current match and subscribes
 * to `change` events, updating state reactively.
 *
 * @param query - A valid CSS media query string, e.g. "(max-width: 640px)".
 */
export function useMediaQuery(query: string): boolean {
  // Start with false — safe for SSR and first client render (avoids hydration
  // mismatch that would occur if we called matchMedia() during render).
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(query);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- post-mount initial viewport sync; one-shot read before subscribing, avoids hydration mismatch
    setMatches(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** Convenience alias: true when viewport width is ≤640px (phone). SSR-safe. */
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 640px)");
}
