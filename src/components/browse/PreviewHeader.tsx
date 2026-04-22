"use client";

/**
 * Top row for the left tree column.
 * Left: breadcrumb (scrolls horizontally on overflow, no wrap).
 * Right: contextual actions — Pin (folder), Source toggle + Open-full
 *        (both only when a .md file is selected).
 *
 * App-level concerns (theme, reader settings) intentionally live in the
 * main sidebar's Appearance affordance, not here.
 */

import Link from "next/link";
import { useSidebarPins } from "@/lib/hooks/useSidebarPins";
import { breadcrumbsFor, encodeVaultPath } from "@/lib/browse/path";

interface Props {
  folderPath: string;
  filePath: string | null;
  mode: "rendered" | "source";
  onToggleMode: () => void;
}

const iconBtn: React.CSSProperties = {
  width: 24,
  height: 22,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  borderRadius: 5,
  border: "1px solid var(--border-subtle)",
  background: "transparent",
  color: "var(--text-tertiary)",
  cursor: "pointer",
  flexShrink: 0,
};

export function PreviewHeader({ folderPath, filePath, mode, onToggleMode }: Props) {
  const { pins, addPin, removePin } = useSidebarPins();
  const crumbs = breadcrumbsFor(folderPath);
  const filename = filePath ? (filePath.split("/").pop() ?? null) : null;
  const isMd = !!filePath && filePath.toLowerCase().endsWith(".md");
  // Pin target: the current file when one is selected, else the current folder.
  const pinTarget = filePath ?? folderPath;
  const pinLabel = filePath
    ? (filename?.replace(/\.md$/i, "") ?? filePath)
    : (folderPath.split("/").pop() ?? folderPath);
  const pinned = pinTarget ? pins.find((p) => p.path === pinTarget) : undefined;
  const pinIcon: "folder" | "document" = filePath ? "document" : "folder";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 8px",
        borderBottom: "1px solid var(--border-subtle)",
        fontSize: 12,
        flexShrink: 0,
        minWidth: 0,
      }}
    >
      <nav
        aria-label="Breadcrumb"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          flex: 1,
          minWidth: 0,
          overflowX: "auto",
          scrollbarWidth: "none",
          whiteSpace: "nowrap",
          color: "var(--text-tertiary)",
        }}
      >
        <Link href="/files" style={{ color: "var(--text-tertiary)", textDecoration: "none" }}>Vault</Link>
        {crumbs.map((c, i) => {
          const isLast = i === crumbs.length - 1 && !filename;
          return (
            <span key={c.path} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ color: "var(--text-quaternary)" }}>/</span>
              <Link
                href={`/files/${encodeVaultPath(c.path)}`}
                style={{
                  color: isLast ? "var(--text-primary)" : "var(--text-tertiary)",
                  textDecoration: "none",
                  fontWeight: isLast ? 500 : 400,
                }}
              >
                {c.name}
              </Link>
            </span>
          );
        })}
        {filename && (
          <>
            <span style={{ color: "var(--text-quaternary)" }}>/</span>
            <span
              style={{ color: "var(--text-primary)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis" }}
              title={filename}
            >
              {filename}
            </span>
          </>
        )}
      </nav>
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
        {pinTarget && (
          <button
            type="button"
            onClick={() => {
              if (pinned) removePin(pinned.id);
              else addPin({ label: pinLabel, path: pinTarget, icon: pinIcon });
            }}
            aria-label={pinned ? `Unpin ${filePath ? "file" : "folder"}` : `Pin ${filePath ? "file" : "folder"}`}
            title={pinned ? `Unpin ${filePath ? "file" : "folder"}` : `Pin ${filePath ? "file" : "folder"}`}
            className="focus-ring"
            style={{
              ...iconBtn,
              background: pinned ? "var(--bg-surface-alpha-4)" : "transparent",
              color: pinned ? "var(--text-primary)" : "var(--text-tertiary)",
            }}
          >
            <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 17v5M5 9l7-7 7 7v4l-3 2H8L5 13V9z" />
            </svg>
          </button>
        )}
        {isMd && (
          <button
            type="button"
            onClick={onToggleMode}
            aria-pressed={mode === "source"}
            aria-label={mode === "source" ? "Show rendered" : "Show source"}
            title="Toggle source (⌘⇧M)"
            className="focus-ring"
            style={{
              ...iconBtn,
              background: mode === "source" ? "var(--bg-surface-alpha-4)" : "transparent",
              color: mode === "source" ? "var(--text-primary)" : "var(--text-tertiary)",
            }}
          >
            <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
          </button>
        )}
        {isMd && (
          <Link
            href={`/file/${encodeVaultPath(filePath!)}`}
            aria-label="Open full view"
            title="Open full view"
            className="focus-ring"
            style={{ ...iconBtn, textDecoration: "none" }}
          >
            <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h6v6M10 14L21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
            </svg>
          </Link>
        )}
      </div>
    </div>
  );
}
