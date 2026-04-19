"use client";

/**
 * /file/[...path] page — full-page vault file view with TOC + edit mode.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell, PageAction } from "@/components/PageShell";
import { Breadcrumbs, MarkdownRenderer } from "@/components/ui";
import { useSheet } from "@/lib/hooks/useSheet";
import { useVault } from "@/lib/hooks/useVault";

interface FileData {
  path: string;
  title: string;
  frontmatter: Record<string, unknown>;
  content: string;
  sections: Array<{ heading: string; level: number; body: string }>;
}

/**
 * FileFullPage — full-route file view at /file/[...path].
 *
 * Renders the same content as the sheet overlay, but inside a PageShell
 * (no backdrop, no slide) and with the browser's own navigation stack.
 * Wiki-links open the sheet (?sheet=) on top of this page.
 */
export function FileFullPage({ path }: { path: string }) {
  const router = useRouter();
  const vault = useVault();
  const sheet = useSheet();
  const [data, setData] = useState<FileData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/file?path=${encodeURIComponent(path)}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || `File fetch failed (${res.status})`);
        }
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load file");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [path]);

  const openObsidian = useCallback(() => {
    const vaultName = vault.name || "Obsidian";
    window.open(`obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(path)}`, "_blank");
  }, [path, vault.name]);

  const title = data?.title ?? path.split("/").pop()?.replace(/\.md$/i, "") ?? path;
  const subtitle = (data?.frontmatter?.description as string) || undefined;

  return (
    <PageShell
      title={title}
      subtitle={subtitle}
      actions={
        <PageAction label="Open in Obsidian" onClick={openObsidian}>
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </PageAction>
      }
      toolbar={
        <div style={{ flex: 1 }}>
          <Breadcrumbs
            path={path}
            onHome={() => router.push("/browse")}
            onSection={(query) => router.push(`/chat?q=${encodeURIComponent(query)}`)}
          />
        </div>
      }
    >
      <div style={{ maxWidth: 880, margin: "0 auto", padding: "32px 32px 120px" }}>
        {loading && <p className="caption-large" style={{ color: "var(--text-quaternary)" }}>Loading…</p>}
        {error && (
          <div>
            <p className="caption-large" style={{ color: "var(--status-blocked)", marginBottom: 8 }}>
              Couldn't load file
            </p>
            <p className="small" style={{ color: "var(--text-tertiary)" }}>{error}</p>
          </div>
        )}
        {data && (
          <MarkdownRenderer content={data.content} onNavigate={sheet.open} />
        )}
      </div>
    </PageShell>
  );
}
