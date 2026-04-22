"use client";

import Link from "next/link";
import { useSidebarPins } from "@/lib/hooks/useSidebarPins";
import { breadcrumbsFor, encodeVaultPath } from "@/lib/browse/path";

interface Props {
  folderPath: string;
  filePath: string | null;
}

export function PreviewHeader({ folderPath, filePath }: Props) {
  const { pins, addPin, removePin } = useSidebarPins();
  const crumbs = breadcrumbsFor(folderPath);
  const pinned = pins.find((p) => p.path === folderPath);
  const name = filePath ? filePath.split("/").pop() : (folderPath.split("/").pop() || "Vault");

  return (
    <header style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "8px 16px",
      borderBottom: "1px solid var(--border-subtle)",
      fontSize: 12,
      flexShrink: 0,
    }}>
      <nav style={{ display: "flex", alignItems: "center", gap: 4, flex: 1, minWidth: 0, overflow: "hidden", whiteSpace: "nowrap" }}>
        <Link href="/files" style={{ color: "var(--text-tertiary)", textDecoration: "none" }}>Vault</Link>
        {crumbs.map((c) => (
          <span key={c.path} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ color: "var(--text-quaternary)" }}>/</span>
            <Link href={`/files/${encodeVaultPath(c.path)}`} style={{ color: "var(--text-tertiary)", textDecoration: "none" }}>{c.name}</Link>
          </span>
        ))}
        {filePath && (
          <>
            <span style={{ color: "var(--text-quaternary)" }}>/</span>
            <span style={{ color: "var(--text-primary)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
          </>
        )}
      </nav>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        {folderPath && (
          <button
            type="button"
            onClick={() => {
              if (pinned) removePin(pinned.id);
              else addPin({ label: folderPath.split("/").pop() ?? folderPath, path: folderPath, icon: "folder" });
            }}
            className="focus-ring caption"
            style={{
              padding: "4px 8px", borderRadius: 6,
              border: "1px solid var(--border-subtle)",
              background: pinned ? "var(--bg-surface-alpha-4)" : "transparent",
              color: "var(--text-primary)",
              cursor: "pointer",
            }}
          >
            {pinned ? "Pinned" : "Pin folder"}
          </button>
        )}
        {filePath && filePath.toLowerCase().endsWith(".md") && (
          <Link
            href={`/file/${encodeVaultPath(filePath)}`}
            className="focus-ring caption"
            style={{
              padding: "4px 8px", borderRadius: 6,
              border: "1px solid var(--border-subtle)",
              textDecoration: "none", color: "var(--text-primary)",
            }}
          >
            Open full view
          </Link>
        )}
      </div>
    </header>
  );
}
