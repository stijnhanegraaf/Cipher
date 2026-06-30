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

const BACKLINKS_CAP = 12;

interface BacklinksPanelProps {
  path: string;
  onNavigate: (path: string) => void;
  variant?: "sidebar" | "block";
}

export function BacklinksPanel({ path, onNavigate, variant = "sidebar" }: BacklinksPanelProps) {
  const cacheRef = useRef<Map<string, BacklinkRow[]>>(new Map());
  // null = loading/not started; array = resolved (may be empty)
  const [rows, setRows] = useState<BacklinkRow[] | null>(null);
  // knownEmpty: true when the API returned a valid 200 with an empty backlinks array.
  const [knownEmpty, setKnownEmpty] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const load = async () => {
      if (!path) {
        if (!cancelled) { setRows(null); setKnownEmpty(false); }
        return;
      }

      const cached = cacheRef.current.get(path);
      if (cached !== undefined) {
        if (!cancelled) { setRows(cached); setKnownEmpty(cached.length === 0); }
        return;
      }

      try {
        const res = await fetch(
          `/api/vault/backlinks?path=${encodeURIComponent(path)}`,
          { signal: controller.signal }
        );
        if (!res.ok) {
          // Non-200 (incl. 409 no-vault, 500 errors) → treat as empty, degrade silently
          cacheRef.current.set(path, []);
          if (!cancelled) { setRows([]); setKnownEmpty(false); }
          return;
        }
        const json = (await res.json()) as BacklinkApiResponse;
        const isRealArray = Array.isArray(json.backlinks);
        // Defensive: if `backlinks` field missing (e.g. 500 without field) → []
        const backlinks: BacklinkRow[] = isRealArray ? (json.backlinks as BacklinkRow[]) : [];
        cacheRef.current.set(path, backlinks);
        if (!cancelled) {
          setRows(backlinks);
          // Show empty state only when API confirmed no backlinks (not when field missing).
          setKnownEmpty(isRealArray && backlinks.length === 0);
        }
      } catch {
        // AbortError or network failure — degrade silently
        if (!controller.signal.aborted && !cancelled) {
          cacheRef.current.set(path, []);
          setRows([]);
          setKnownEmpty(false);
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

  const isBlock = variant === "block";

  // No backlinks — show quiet empty state only when we know the API confirmed it.
  if (rows.length === 0) {
    if (!knownEmpty) return null;
    return (
      <div
        style={{
          marginTop: isBlock ? 32 : 24,
          paddingTop: isBlock ? 24 : 0,
          borderTop: isBlock ? "1px solid var(--border-subtle)" : "none",
        }}
      >
        <div className="mono-label" style={{ color: "var(--text-quaternary)", letterSpacing: "0.08em", marginBottom: 8 }}>
          LINKED MENTIONS
        </div>
        <p className="small" style={{ color: "var(--text-quaternary)", margin: 0 }}>
          No linked mentions yet.
        </p>
      </div>
    );
  }

  const visible = showAll ? rows : rows.slice(0, BACKLINKS_CAP);
  const hiddenCount = rows.length - visible.length;

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
        {visible.map((r) => (
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
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="focus-ring caption"
            style={{
              display: "block",
              width: "100%",
              padding: "6px 8px",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              color: "var(--text-quaternary)",
              textAlign: "left",
            }}
          >
            +{hiddenCount} more
          </button>
        )}
      </div>
    </div>
  );
}
