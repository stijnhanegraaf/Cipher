"use client";

/**
 * 360px preview panel for the Structure columns view.
 *
 * Lazy-fetches /api/file?path on path change, caches by path for the
 * component's lifetime, and renders header / metadata / first snippet /
 * tags / LINKED FROM / LINKS TO. Link rows call `onNavigate(path)` so
 * the parent can re-point the Miller trail in place.
 */

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { Graph, GraphNode } from "@/lib/vault-graph";
import { IconButton } from "@/components/ui/IconButton";

export interface LinkRow {
  path: string;
  title: string;
}

interface Props {
  path: string | null;
  node: GraphNode | null;
  backlinkRows: LinkRow[];
  outlinkRows: LinkRow[];
  onOpen: (path: string) => void;
  onNavigate: (path: string) => void;
}

interface FileSection {
  heading: string;
  level: number;
  body: string;
}

interface FileEnvelope {
  path: string;
  title: string;
  frontmatter: Record<string, unknown>;
  content: string;
  sections: FileSection[];
}

interface PreviewData {
  env: FileEnvelope;
  tags: string[];
  wordCount: number;
  snippetHeading: string;
  snippet: string;
}

function deriveTags(env: FileEnvelope): string[] {
  const out = new Set<string>();
  const fmTags = env.frontmatter?.["tags"];
  if (Array.isArray(fmTags)) {
    for (const t of fmTags) if (typeof t === "string" && t.trim()) out.add(t.trim());
  }
  // Inline #tags from content — basic pattern, word-boundary bounded.
  const inlineRe = /(^|\s)#([A-Za-z0-9_\-/]+)/g;
  let m: RegExpExecArray | null;
  while ((m = inlineRe.exec(env.content)) !== null) out.add(m[2]);
  return Array.from(out);
}

function wordCountOf(env: FileEnvelope): number {
  return env.content.split(/\s+/).filter(Boolean).length;
}

function snippetOf(env: FileEnvelope): { heading: string; snippet: string } {
  const first = env.sections[0];
  if (!first) return { heading: "", snippet: "" };
  return { heading: first.heading ?? "", snippet: (first.body ?? "").trim() };
}

function relTime(mtime: number): string {
  const diff = Math.max(0, Date.now() - mtime);
  const h = diff / 36e5;
  if (h < 1) return `${Math.max(1, Math.round(diff / 6e4))}m ago`;
  if (h < 24) return `${Math.round(h)}h ago`;
  const d = h / 24;
  if (d < 7) return `${Math.round(d)}d ago`;
  const w = d / 7;
  if (w < 5) return `${Math.round(w)}w ago`;
  return `${Math.round(d / 30)}mo ago`;
}

function parentFolder(id: string): string {
  const i = id.lastIndexOf("/");
  return i === -1 ? "" : id.slice(0, i);
}

function basename(id: string): string {
  const i = id.lastIndexOf("/");
  const last = i === -1 ? id : id.slice(i + 1);
  return last.replace(/\.md$/i, "");
}

export function FilePreviewPanel({ path, node, backlinkRows, outlinkRows, onOpen, onNavigate }: Props) {
  const cacheRef = useRef<Map<string, PreviewData>>(new Map());
  const [data, setData] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadedAt = performance.now();
    if (!path) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    const cached = cacheRef.current.get(path);
    if (cached) {
      setData(cached);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setData(null);
    let timer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      try {
        const res = await fetch(`/api/file?path=${encodeURIComponent(path)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const env = (await res.json()) as FileEnvelope;
        const { heading, snippet } = snippetOf(env);
        const built: PreviewData = {
          env,
          tags: deriveTags(env),
          wordCount: wordCountOf(env),
          snippetHeading: heading,
          snippet,
        };
        cacheRef.current.set(path, built);
        // Enforce a 150ms minimum loading window so the skeleton doesn't flash.
        const elapsed = performance.now() - loadedAt;
        const wait = Math.max(0, 150 - elapsed);
        timer = setTimeout(() => {
          if (cancelled) return;
          setData(built);
          setLoading(false);
        }, wait);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "fetch failed");
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [path]);

  const frameStyle: CSSProperties = {
    flex: "0 0 360px",
    width: 360,
    height: "100%",
    padding: 20,
    background: "var(--bg-marketing)",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
  };

  if (!path) {
    return (
      <aside
        style={{ ...frameStyle, alignItems: "center", justifyContent: "center" }}
        aria-label="File preview (empty)"
      >
        <span className="caption-large" style={{ color: "var(--text-quaternary)" }}>
          Select a file to preview
        </span>
      </aside>
    );
  }

  if (loading) {
    return (
      <aside style={frameStyle} aria-label="File preview (loading)">
        <div
          style={{
            height: 8,
            width: "60%",
            background: "var(--bg-surface-alpha-2)",
            borderRadius: 4,
            animation: "cipher-cursor-blink 1.2s ease-in-out infinite",
          }}
        />
        <div style={{ height: 12 }} />
        <div
          style={{
            height: 8,
            width: "90%",
            background: "var(--bg-surface-alpha-2)",
            borderRadius: 4,
            animation: "cipher-cursor-blink 1.2s ease-in-out infinite",
          }}
        />
      </aside>
    );
  }

  if (error) {
    return (
      <aside style={frameStyle} aria-label="File preview (error)">
        <span className="caption-large" style={{ color: "var(--text-quaternary)" }}>
          Couldn't load file metadata.
        </span>
      </aside>
    );
  }

  if (!data || !node) {
    return <aside style={frameStyle} aria-label="File preview" />;
  }

  return (
    <aside style={frameStyle} aria-label="File preview">
      {/* 1. Header */}
      <div style={{ marginBottom: 16 }}>
        <div
          className="mono-label"
          style={{
            color: "var(--text-quaternary)",
            letterSpacing: "0.08em",
            marginBottom: 4,
          }}
        >
          {parentFolder(path) || "/"}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h2
            className="heading-2-serif"
            style={{
              flex: 1,
              color: "var(--text-primary)",
              margin: 0,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {data.env.title}
          </h2>
          <IconButton
            aria-label="Open file in sheet"
            onClick={() => onOpen(path)}
            style={{ border: "none" }}
          >
            <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
              <path d="M5 3h6v6" />
              <path d="M11 3l-7 7" />
              <path d="M3 7v4h4" />
            </svg>
          </IconButton>
        </div>
      </div>

      {/* 2. Metadata row */}
      <div
        className="caption-large"
        style={{
          fontVariantNumeric: "tabular-nums",
          color: "var(--text-secondary)",
          marginBottom: 16,
        }}
      >
        {relTime(node.mtime)}
        <Sep />
        {node.backlinks} backlinks
        <Sep />
        {node.outlinks} outlinks
        <Sep />
        {data.wordCount} words
      </div>

      {/* 3. Snippet */}
      {(data.snippetHeading || data.snippet) && (
        <div style={{ marginBottom: 16 }}>
          {data.snippetHeading && (
            <div
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: "var(--text-primary)",
                marginBottom: 6,
              }}
            >
              {data.snippetHeading}
            </div>
          )}
          {data.snippet && (
            <div
              style={{
                display: "-webkit-box",
                WebkitLineClamp: 4,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                fontSize: 13,
                lineHeight: 1.55,
                color: "var(--text-secondary)",
              }}
            >
              {data.snippet}
            </div>
          )}
        </div>
      )}

      {/* 4. Tags */}
      {data.tags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
          {(data.tags.length > 6 ? data.tags.slice(0, 5) : data.tags).map((t) => (
            <TagChip key={t} label={t} />
          ))}
          {data.tags.length > 6 && <TagChip label={`+${data.tags.length - 5} more`} />}
        </div>
      )}

      {/* 5. LINKED FROM */}
      <LinkSection
        title={`LINKED FROM · ${node.backlinks}`}
        rows={backlinkRows}
        onNavigate={onNavigate}
      />

      {/* 6. LINKS TO */}
      <LinkSection
        title={`LINKS TO · ${node.outlinks}`}
        rows={outlinkRows}
        onNavigate={onNavigate}
      />
    </aside>
  );
}

function LinkSection({
  title,
  rows,
  onNavigate,
}: {
  title: string;
  rows: LinkRow[];
  onNavigate: (path: string) => void;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        className="mono-label"
        style={{
          color: "var(--text-quaternary)",
          letterSpacing: "0.08em",
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      {rows.length === 0 ? null : (
        <div>
          {rows.slice(0, 5).map((r) => (
            <button
              key={r.path}
              type="button"
              onClick={() => onNavigate(r.path)}
              className="app-row focus-ring"
              style={{
                display: "flex",
                alignItems: "center",
                width: "100%",
                height: "var(--row-h-compact)",
                padding: "0 8px",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                gap: 8,
                textAlign: "left",
              }}
            >
              <svg width={12} height={12} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ color: "var(--text-quaternary)", flexShrink: 0 }}>
                <path d="M3 2h4l2 2v6H3z" />
              </svg>
              <span
                className="caption-large"
                style={{
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  color: "var(--text-primary)",
                }}
              >
                {basename(r.path)}
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: "var(--text-quaternary)",
                  flexShrink: 0,
                  maxWidth: 140,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {parentFolder(r.path)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TagChip({ label }: { label: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 20,
        padding: "0 10px",
        background: "var(--bg-surface-alpha-2)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 999,
        fontSize: 12,
        color: "var(--text-tertiary)",
      }}
    >
      {label}
    </span>
  );
}

function Sep() {
  return (
    <span style={{ color: "var(--text-quaternary)", padding: "0 6px" }}>·</span>
  );
}

// Types consumed but not re-exported by the rest of the app.
export type { Graph };
