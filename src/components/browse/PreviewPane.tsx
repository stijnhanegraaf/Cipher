"use client";

import { MarkdownPreview } from "./MarkdownPreview";
import { FolderGridPreview } from "./FolderGridPreview";
import { ImagePreview } from "./ImagePreview";
import { PdfPreview } from "./PdfPreview";
import { GenericPreview } from "./GenericPreview";
import { fileKindForExt } from "@/lib/browse/file-kind";

interface Props {
  folderPath: string;
  filePath: string | null;
  mode: "rendered" | "source";
  onOpenFile: (p: string) => void;
  onOpenFolder: (p: string) => void;
  onNavigate: (target: string) => void;
}

export function PreviewPane({ folderPath, filePath, mode, onOpenFile, onOpenFolder, onNavigate }: Props) {
  if (!filePath) return <FolderGridPreview folderPath={folderPath} onOpenFile={onOpenFile} onOpenFolder={onOpenFolder} />;
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const kind = fileKindForExt(ext);
  if (kind === "md") return <MarkdownPreview filePath={filePath} mode={mode} onNavigate={onNavigate} />;
  if (kind === "image") return <ImagePreview filePath={filePath} />;
  if (kind === "pdf") return <PdfPreview filePath={filePath} />;
  return <GenericPreview filePath={filePath} />;
}
