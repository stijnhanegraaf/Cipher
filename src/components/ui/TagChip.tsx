import type { CSSProperties } from "react";
import Link from "next/link";

/**
 * Clickable tag chip that navigates to the tag's browse page.
 *
 * Renders as a Next <Link> so keyboard navigation, middle-click
 * (open in new tab), and cmd-click all work. The `.chip` class
 * supplies all visual states; `--sc` is set to `--hue-tag` so the
 * chip uses the canonical violet tag colour without any raw hex.
 *
 * The target route `/browse/tag/[tag]` is implemented in T6.
 * Until then clicks will 404 — this is expected and correct.
 */
export function TagChip({ tag }: { tag: string }) {
  return (
    <Link
      href={`/browse/tag/${encodeURIComponent(tag)}`}
      className="chip"
      style={{ "--sc": "var(--hue-tag)" } as CSSProperties}
    >
      #{tag}
    </Link>
  );
}
