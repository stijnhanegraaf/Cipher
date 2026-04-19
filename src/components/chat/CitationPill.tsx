"use client";

/**
 * CitationPill — 28px rounded pill that opens the source note in the
 * sheet overlay when clicked. ⌘+click routes to /file/<path> instead.
 */

import { useRouter } from "next/navigation";
import { useSheet } from "@/lib/hooks/useSheet";

interface Props {
  id: number;
  path: string;
  heading?: string;
  /** Brief highlight when triggered from a citation marker. */
  flashId?: number;
}

export function CitationPill({ id, path, heading, flashId }: Props) {
  const sheet = useSheet();
  const router = useRouter();
  const label = path.split("/").pop()?.replace(/\.md$/, "") || path;

  const onClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (e.metaKey || e.ctrlKey) {
      router.push(`/file/${encodeURIComponent(path)}`);
      return;
    }
    sheet.open(path, heading ? slug(heading) : undefined);
  };

  const active = flashId === id;
  return (
    <button
      type="button"
      data-citation-id={id}
      onClick={onClick}
      style={{
        height: 28,
        padding: "0 8px",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        borderRadius: "var(--radius-pill)",
        border: "1px solid var(--border-subtle)",
        background: active ? "var(--bg-surface-alpha-4)" : "var(--bg-surface-alpha-2)",
        color: "var(--text-secondary)",
        fontSize: 12,
        fontFamily: "var(--font-mono)",
        cursor: "pointer",
        transition: "background-color 180ms var(--ease-default)",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-surface-alpha-4)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = active ? "var(--bg-surface-alpha-4)" : "var(--bg-surface-alpha-2)")}
    >
      <span style={{ color: "var(--text-quaternary)" }}>[{id}]</span>
      <span>{label}</span>
      {heading && <span style={{ color: "var(--text-quaternary)" }}>· {heading}</span>}
    </button>
  );
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
