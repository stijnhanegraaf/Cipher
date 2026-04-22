"use client";

import { useEffect, useState } from "react";
import { fetchChildren, type TreeChild } from "@/lib/browse/vault-tree-client";
import { fileKindForExt } from "@/lib/browse/file-kind";
import { iconForFileKind } from "@/lib/browse/icon-for-file";

interface Props {
  folderPath: string;
  onOpenFile: (p: string) => void;
  onOpenFolder: (p: string) => void;
}

export function FolderGridPreview({ folderPath, onOpenFile, onOpenFolder }: Props) {
  const [children, setChildren] = useState<TreeChild[] | null>(null);
  useEffect(() => {
    let alive = true;
    fetchChildren(folderPath)
      .then((kids) => { if (alive) setChildren(kids); })
      .catch(() => { if (alive) setChildren([]); });
    return () => { alive = false; };
  }, [folderPath]);

  if (!children) return <div className="caption" style={{ padding: 24, color: "var(--text-tertiary)" }}>Loading…</div>;
  return (
    <div style={{ padding: 24, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
      {children.map((c) => (
        <button
          key={c.path}
          type="button"
          onClick={() => c.type === "folder" ? onOpenFolder(c.path) : onOpenFile(c.path)}
          className="focus-ring"
          style={{
            textAlign: "left", padding: 12, border: "1px solid var(--border-subtle)",
            borderRadius: 8, background: "var(--bg-surface-alpha-2)", color: "var(--text-secondary)",
            fontSize: 12, cursor: "pointer",
          }}
        >
          <div style={{ fontSize: 18, marginBottom: 4 }}>
            {c.type === "folder" ? "📁" : iconForFileKind(fileKindForExt(c.ext))}
          </div>
          <div style={{ color: "var(--text-primary)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
          <div className="caption" style={{ marginTop: 4, color: "var(--text-quaternary)" }}>
            {new Date(c.mtime).toLocaleDateString()}
          </div>
        </button>
      ))}
      {children.length === 0 && (
        <div className="caption" style={{ color: "var(--text-tertiary)" }}>Empty folder.</div>
      )}
    </div>
  );
}
