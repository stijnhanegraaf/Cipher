"use client";

/**
 * Breadcrumb header for the left tree column. Single-line, horizontally
 * scrollable on overflow so long paths don't wrap and cause layout shift
 * (per emil design rule: dynamic content = no layout shift).
 */

import Link from "next/link";
import { breadcrumbsFor, encodeVaultPath } from "@/lib/browse/path";

interface Props {
  folderPath: string;
  filePath: string | null;
}

export function PreviewHeader({ folderPath, filePath }: Props) {
  const crumbs = breadcrumbsFor(folderPath);
  const filename = filePath ? (filePath.split("/").pop() ?? null) : null;

  return (
    <nav
      aria-label="Breadcrumb"
      style={{
        padding: "8px 10px",
        borderBottom: "1px solid var(--border-subtle)",
        fontSize: 12,
        display: "flex",
        alignItems: "center",
        gap: 4,
        flexShrink: 0,
        overflowX: "auto",
        scrollbarWidth: "none",
        color: "var(--text-tertiary)",
        whiteSpace: "nowrap",
      }}
    >
      <Link href="/files" style={{ color: "var(--text-tertiary)", textDecoration: "none" }}>
        Vault
      </Link>
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
            style={{
              color: "var(--text-primary)",
              fontWeight: 500,
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "100%",
            }}
            title={filename}
          >
            {filename}
          </span>
        </>
      )}
    </nav>
  );
}
