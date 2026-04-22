"use client";

import { memo, useEffect, useState } from "react";
import { MarkdownRenderer } from "@/components/ui/MarkdownRenderer";
import { SourceView } from "./SourceView";

interface FileData { path: string; title: string; content: string }

const LRU_MAX = 20;
const lru = new Map<string, FileData>();
function lruGet(path: string): FileData | undefined {
  const v = lru.get(path);
  if (v) { lru.delete(path); lru.set(path, v); }
  return v;
}
function lruSet(path: string, data: FileData) {
  if (lru.has(path)) lru.delete(path);
  lru.set(path, data);
  while (lru.size > LRU_MAX) {
    const oldest = lru.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    lru.delete(oldest);
  }
}

interface Props {
  filePath: string;
  mode: "rendered" | "source";
  onNavigate: (target: string) => void;
}

export const MarkdownPreview = memo(function MarkdownPreview({ filePath, mode, onNavigate }: Props) {
  const [data, setData] = useState<FileData | null>(() => lruGet(filePath) ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const cached = lruGet(filePath);
    if (cached) { setData(cached); setError(null); return () => { alive = false; }; }
    setData(null); setError(null);
    fetch(`/api/file?path=${encodeURIComponent(filePath)}`)
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(`file ${r.status}`)))
      .then((j) => {
        if (!alive) return;
        const d = j as FileData;
        lruSet(filePath, d);
        setData(d);
      })
      .catch((e: Error) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [filePath]);

  if (error) return <div className="caption" style={{ padding: 24, color: "var(--status-danger, #c0392b)" }}>Couldn't load file: {error}</div>;
  if (!data) return <div className="caption" style={{ padding: 24, color: "var(--text-tertiary)" }}>Loading…</div>;
  if (mode === "source") return <SourceView content={data.content} />;
  return (
    <div className="markdown-content" style={{ maxWidth: "72ch", margin: "0 auto", padding: "32px 24px" }}>
      <MarkdownRenderer content={data.content} onNavigate={onNavigate} />
    </div>
  );
});
