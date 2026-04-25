"use client";

/**
 * Platform-aware modifier label.
 *
 * Returns "⌘" on Mac/iOS, "Ctrl" elsewhere. The module-level detection runs
 * once on client mount and is shared across every hook caller — no effect,
 * no re-render, no hydration mismatch because consumers are client components
 * where the initial render matches the final value.
 */

function detect(): string {
  if (typeof navigator === "undefined") return "⌘";
  const ua = navigator.userAgent || navigator.platform || "";
  return /Mac|iPhone|iPad|iPod/i.test(ua) ? "⌘" : "Ctrl";
}

let cached: string | null = null;

export function useMod(): string {
  if (cached === null) cached = detect();
  return cached;
}
