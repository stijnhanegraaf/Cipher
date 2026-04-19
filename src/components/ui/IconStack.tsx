"use client";

import type { ReactNode } from "react";

/**
 * IconStack — two stacked SVGs with opacity crossfade on `fired`.
 * Used for success-icon morphs (clear → check, save → check, etc.).
 * Matches the spec's motion-slow / spring-soft timing via CSS in globals.
 */
export function IconStack({
  fired,
  idle,
  success,
  size = 14,
}: {
  fired: boolean;
  idle: ReactNode;
  success: ReactNode;
  size?: number;
}) {
  return (
    <span
      className="icon-stack"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <span className={fired ? "swap-out" : "swap-in"}>{idle}</span>
      <span className={fired ? "swap-in" : "swap-out"}>{success}</span>
    </span>
  );
}
