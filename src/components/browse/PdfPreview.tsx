"use client";
export function PdfPreview({ filePath }: { filePath: string }) {
  const src = `/api/vault/asset?path=${encodeURIComponent(filePath)}`;
  return <iframe src={src} title={filePath} style={{ width: "100%", height: "100%", border: 0 }} />;
}
