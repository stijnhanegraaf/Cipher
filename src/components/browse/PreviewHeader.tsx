"use client";

/**
 * LeftPaneHeader — breadcrumb above the file tree. Lives in the left column
 * so the right preview area can stay pure content with no chrome.
 */

import Link from "next/link";
import { breadcrumbsFor, encodeVaultPath } from "@/lib/browse/path";

interface Props {
  folderPath: string;
  filePath: string | null;
}

export function PreviewHeader({ folderPath, filePath }: Props) {
  const crumbs = breadcrumbsFor(folderPath);
  const name = filePath ? filePath.split("/").pop() : null;
  return (
    <div
      style={{
        padding: "8px 10px",
        borderBottom: "1px solid var(--border-subtle)",
        fontSize: 12,
        display: "flex",
        alignItems: "center",
        gap: 4,
        flexWrap: "wrap",
        color: "var(--text-tertiary)",
      }}
    >
      <Link href="/files" style={{ color: "var(--text-tertiary)", textDecoration: "none" }}>Vault</Link>
      {crumbs.map((c, i) => (
        <span key={c.path} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span style={{ color: "var(--text-quaternary)" }}>/</span>
          <Link
            href={`/files/${encodeVaultPath(c.path)}`}
            style={{
              color: i === crumbs.length - 1 && !filePath ? "var(--text-primary)" : "var(--text-tertiary)",
              textDecoration: "none",
              fontWeight: i === crumbs.length - 1 && !filePath ? 500 : 400,
            }}
          >
            {c.name}
          </Link>
        </span>
      ))}
      {name && (
        <>
          <span style={{ color: "var(--text-quaternary)" }}>/</span>
          <span
            style={{
              color: "var(--text-primary)",
              fontWeight: 500,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: "100%",
            }}
          >
            {name}
          </span>
        </>
      )}
    </div>
  );
}
