"use client";

/**
 * BacklinksPanel — self-fetching "LINKED MENTIONS" panel for both readers.
 *
 * Fetches /api/vault/backlinks?path= on path change, cancels on unmount
 * via AbortController, caches by path for the component's lifetime.
 *
 * - Empty/loading/error degrade silently (render nothing or a quiet state).
 * - ANY non-200 response (including 500 that omits `backlinks`) → treat as
 *   empty, render nothing. The reader never shows a backlinks error.
 * - Header: "LINKED MENTIONS · N" in mono-label style.
 * - Rows: source title + 2-line-clamped snippet, click → onNavigate(sourcePath).
 *
 * Props:
 *   path       — vault-relative path of the current file
 *   onNavigate — called with sourcePath when a row is clicked
 *   variant    — "sidebar" (DetailPage, narrow) | "block" (FileFullPage, full-width)
 */

import { useEffect, useRef, useState } from "react";

interface BacklinkRow {
  sourcePath: string;
  sourceTitle: string;
  snippet: string;
}

interface BacklinkApiResponse {
  backlinks?: BacklinkRow[];
  error?: string;
}

interface BacklinksPanelProps {
  path: string;
  onNavigate: (path: string) => void;
  variant?: "sidebar" | "block";
}

export function BacklinksPanel({ path, onNavigate, variant = "sidebar" }: BacklinksPanelProps) {
  const cacheRef = useRef<Map<string, BacklinkRow[]>>(new Map());
  // null = loading/not started; array = resolved (may be empty)
  const [rows, setRows] = useState<BacklinkRow[] | null>(null);

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
          `/api/vault/backlinks?path=${encodeURIComponent(path)}`,
          { signal: controller.signal }
        );
        if (!res.ok) {
          // Non-200 (incl. 409 no-vault, 500 errors) → treat as empty
          cacheRef.current.set(path, []);
          if (!cancelled) setRows([]);
          return;
        }
        const json = (await res.json()) as BacklinkApiResponse;
        // Defensive: if `backlinks` field missing (e.g. 500 without field) → []
        const backlinks: BacklinkRow[] = Array.isArray(json.backlinks) ? json.backlinks : [];
        cacheRef.current.set(path, backlinks);
        if (!cancelled) setRows(backlinks);
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

  // No backlinks — render nothing
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
        {`LINKED MENTIONS · ${rows.length}`}
      </div>
      <div>
        {rows.map((r) => (
          <button
            key={r.sourcePath}
            type="button"
            onClick={() => onNavigate(r.sourcePath)}
            className="app-row focus-ring"
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              width: "100%",
              padding: "8px",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              textAlign: "left",
              gap: 2,
            }}
          >
            <span
              className="caption-large"
              style={{
                color: "var(--text-primary)",
                minWidth: 0,
                width: "100%",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {r.sourceTitle}
            </span>
            {r.snippet && (
              <span
                className="caption-large"
                style={{
                  color: "var(--text-secondary)",
                  minWidth: 0,
                  width: "100%",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {r.snippet}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
