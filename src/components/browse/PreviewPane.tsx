"use client";

import { MarkdownPreview } from "./MarkdownPreview";
import { FolderGridPreview } from "./FolderGridPreview";
import { fileKindForExt } from "@/lib/browse/file-kind";

interface Props {
  folderPath: string;
  filePath: string | null;
  onOpenFile: (p: string) => void;
  onOpenFolder: (p: string) => void;
  onNavigate: (target: string) => void;
}

export function PreviewPane({ folderPath, filePath, onOpenFile, onOpenFolder, onNavigate }: Props) {
  if (!filePath) return <FolderGridPreview folderPath={folderPath} onOpenFile={onOpenFile} onOpenFolder={onOpenFolder} />;
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const kind = fileKindForExt(ext);
  if (kind === "md") return <MarkdownPreview filePath={filePath} onNavigate={onNavigate} />;
  // image / pdf / other come in Task 9.
  return <div className="caption" style={{ padding: 24, color: "var(--text-tertiary)" }}>Preview for .{ext} coming soon.</div>;
}
