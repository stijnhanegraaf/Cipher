"use client";

/**
 * OutgoingLinksPanel — self-fetching forward-links panel for both readers.
 *
 * Fetches /api/file/links?path= on path change, cancels on unmount via
 * AbortController, caches by path for the component's lifetime.
 *
 * The key differentiator vs BacklinksPanel: outgoing links can be BROKEN
 * (the target note does not exist). Broken links are shown non-interactively
 * in a muted style with a small "broken" chip.
 *
 * Props:
 *   path       — vault-relative path of the current file
 *   onNavigate — called with resolvedPath when a resolved link is clicked
 *   variant    — "sidebar" (DetailPage, narrow) | "block" (FileFullPage)
 */

import { useEffect, useRef, useState } from "react";
import type { OutgoingLink } from "@/lib/links/outgoing";

interface OutgoingLinkApiResponse {
  links?: OutgoingLink[];
  error?: string;
}

interface OutgoingLinksPanelProps {
  path: string;
  onNavigate: (path: string) => void;
  variant?: "sidebar" | "block";
}

function basename(p: string): string {
  const i = p.lastIndexOf("/");
  const last = i === -1 ? p : p.slice(i + 1);
  return last.replace(/\.md$/i, "");
}

function parentFolder(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? "" : p.slice(0, i);
}

/** Small inline chip used to flag broken links. Token-only colors. */
function BrokenChip() {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 18,
        padding: "0 7px",
        background: "var(--bg-surface-alpha-4)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 999,
        fontSize: 10,
        color: "var(--text-quaternary)",
        flexShrink: 0,
        letterSpacing: "0.04em",
      }}
    >
      broken
    </span>
  );
}

export function OutgoingLinksPanel({
  path,
  onNavigate,
  variant = "sidebar",
}: OutgoingLinksPanelProps) {
  const cacheRef = useRef<Map<string, OutgoingLink[]>>(new Map());
  // null = loading/not started; array = resolved (may be empty)
  const [rows, setRows] = useState<OutgoingLink[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const load = async () => {
      if (!path) {
        if (!cancelled) setRows(null);
        return;
      }

      const cached = cacheRef.current.get(path);
      if (cached !== undefined) {
        if (!cancelled) setRows(cached);
        return;
      }

      try {
        const res = await fetch(
          `/api/file/links?path=${encodeURIComponent(path)}`,
          { signal: controller.signal },
        );
        if (!res.ok) {
          // Non-200 (incl. 409 no-vault, 404 not found) → treat as empty
          cacheRef.current.set(path, []);
          if (!cancelled) setRows([]);
          return;
        }
        const json = (await res.json()) as OutgoingLinkApiResponse;
        // Defensive: if links field missing → []
        const links: OutgoingLink[] = Array.isArray(json.links) ? json.links : [];
        cacheRef.current.set(path, links);
        if (!cancelled) setRows(links);
      } catch {
        // AbortError or network failure — degrade silently
        if (!controller.signal.aborted && !cancelled) {
          cacheRef.current.set(path, []);
          setRows([]);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [path]);

  // Still loading — render nothing to avoid flash
  if (rows === null) return null;

  // No outgoing links — render nothing
  if (rows.length === 0) return null;

  const isBlock = variant === "block";

  return (
    <div
      style={{
        marginTop: isBlock ? 32 : 24,
        paddingTop: isBlock ? 24 : 0,
        borderTop: isBlock ? "1px solid var(--border-subtle)" : "none",
      }}
    >
      <div
        className="mono-label"
        style={{
          color: "var(--text-quaternary)",
          letterSpacing: "0.08em",
          marginBottom: 8,
        }}
      >
        {`LINKS · ${rows.length}`}
      </div>
      <div>
        {rows.map((r) =>
          r.broken ? (
            // Broken link: non-interactive span with muted style + broken chip
            <div
              key={`broken:${r.target}`}
              style={{
                display: "flex",
                alignItems: "center",
                width: "100%",
                height: "var(--row-h-compact)",
                padding: "0 8px",
                gap: 8,
              }}
            >
              {/* File icon — muted */}
              <svg
                width={12}
                height={12}
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                style={{ color: "var(--text-quaternary)", flexShrink: 0 }}
              >
                <path d="M3 2h4l2 2v6H3z" />
              </svg>
              <span
                className="caption-large"
                style={{
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  color: "var(--text-quaternary)",
                }}
              >
                {r.label !== r.target ? r.label : r.target}
              </span>
              <BrokenChip />
            </div>
          ) : (
            // Resolved link: clickable button → onNavigate
            <button
              key={r.resolvedPath}
              type="button"
              onClick={() => {
                if (r.resolvedPath) onNavigate(r.resolvedPath);
              }}
              className="app-row focus-ring"
              style={{
                display: "flex",
                alignItems: "center",
                width: "100%",
                height: "var(--row-h-compact)",
                padding: "0 8px",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                gap: 8,
                textAlign: "left",
              }}
            >
              <svg
                width={12}
                height={12}
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                style={{ color: "var(--text-quaternary)", flexShrink: 0 }}
              >
                <path d="M3 2h4l2 2v6H3z" />
              </svg>
              <span
                className="caption-large"
                style={{
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  color: "var(--text-primary)",
                }}
              >
                {r.label !== r.target ? r.label : basename(r.resolvedPath ?? r.target)}
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: "var(--text-quaternary)",
                  flexShrink: 0,
                  maxWidth: 140,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {r.resolvedPath ? parentFolder(r.resolvedPath) : ""}
              </span>
            </button>
          ),
        )}
      </div>
    </div>
  );
}
