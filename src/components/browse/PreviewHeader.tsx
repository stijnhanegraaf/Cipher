"use client";

/**
 * Top row for the left tree column. Purely navigational:
 * Left: breadcrumb (scrolls horizontally on overflow, no wrap).
 * Right: pin/unpin the current file or folder.
 *
 * Reading-surface controls (font, size, raw toggle, open-full) live in
 * the ReaderToolbar mounted above the markdown body — those are document
 * chrome, not folder-nav chrome.
 */

import Link from "next/link";
import type { FocusEvent } from "react";
import { useSidebarPins } from "@/lib/hooks/useSidebarPins";
import { breadcrumbsFor, encodeVaultPath } from "@/lib/browse/path";
import { IconButton } from "@/components/ui/IconButton";

interface Props {
  folderPath: string;
  filePath: string | null;
}

// Keep a focused breadcrumb visible when tabbing through a scrolled nav.
function keepInView(e: FocusEvent<HTMLAnchorElement>) {
  e.currentTarget.scrollIntoView({ inline: "nearest", block: "nearest" });
}

export function PreviewHeader({ folderPath, filePath }: Props) {
  const { pins, addPin, removePin } = useSidebarPins();
  const crumbs = breadcrumbsFor(folderPath);
  const filename = filePath ? (filePath.split("/").pop() ?? null) : null;
  // Pin target: the current file when one is selected, else the current folder.
  const pinTarget = filePath ?? folderPath;
  const pinLabel = filePath
    ? (filename?.replace(/\.md$/i, "") ?? filePath)
    : (folderPath.split("/").pop() ?? folderPath);
  const pinned = pinTarget ? pins.find((p) => p.path === pinTarget) : undefined;
  const pinIcon: "folder" | "document" = filePath ? "document" : "folder";
  const pinKind = filePath ? "file" : "folder";

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
        <Link
          href="/files"
          onFocus={keepInView}
          className="focus-ring"
          style={{ color: "var(--text-tertiary)", textDecoration: "none", borderRadius: 3 }}
        >
          Vault
        </Link>
        {crumbs.map((c, i) => {
          const isLast = i === crumbs.length - 1 && !filename;
          return (
            <span key={c.path} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ color: "var(--text-quaternary)" }}>/</span>
              <Link
                href={`/files/${encodeVaultPath(c.path)}`}
                onFocus={keepInView}
                className="focus-ring"
                style={{
                  color: isLast ? "var(--text-primary)" : "var(--text-tertiary)",
                  textDecoration: "none",
                  fontWeight: isLast ? 500 : 400,
                  borderRadius: 3,
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
      {pinTarget && (
        <IconButton
          onClick={() => {
            if (pinned) removePin(pinned.id);
            else addPin({ label: pinLabel, path: pinTarget, icon: pinIcon });
          }}
          pressed={!!pinned}
          aria-label={pinned ? `Unpin ${pinKind}` : `Pin ${pinKind}`}
          title={pinned ? `Unpin ${pinKind}` : `Pin ${pinKind}`}
        >
          <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 17v5M5 9l7-7 7 7v4l-3 2H8L5 13V9z" />
          </svg>
        </IconButton>
      )}
    </div>
  );
}
