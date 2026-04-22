"use client";

import { useEffect, useState } from "react";
import { fetchChildren, type TreeChild } from "@/lib/browse/vault-tree-client";
import { fileKindForExt } from "@/lib/browse/file-kind";
import { FileKindIcon } from "./FileKindIcon";

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
  if (children.length === 0) return <div className="caption" style={{ padding: 24, color: "var(--text-tertiary)" }}>Empty folder.</div>;

  return (
    <div style={{ padding: "16px 24px", maxWidth: 720, margin: "0 auto" }}>
      {children.map((c) => {
        const isFolder = c.type === "folder";
        return (
          <button
            key={c.path}
            type="button"
            onClick={() => isFolder ? onOpenFolder(c.path) : onOpenFile(c.path)}
            className="focus-ring"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              width: "100%",
              padding: "8px 10px",
              border: "none",
              background: "transparent",
              color: "var(--text-primary)",
              textAlign: "left",
              fontSize: 13,
              borderRadius: 6,
              cursor: "pointer",
              transition: "background var(--motion-hover) var(--ease-default)",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-surface-alpha-2)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <span style={{ width: 18, display: "inline-flex", alignItems: "center", justifyContent: "center", color: isFolder ? "var(--text-tertiary)" : "var(--text-quaternary)", flexShrink: 0 }}>
              <FileKindIcon kind={isFolder ? "folder" : fileKindForExt(c.ext)} size={14} />
            </span>
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
            <span className="caption" style={{ color: "var(--text-quaternary)", flexShrink: 0, fontSize: 11 }}>
              {new Date(c.mtime).toLocaleDateString()}
            </span>
          </button>
        );
      })}
    </div>
  );
}
