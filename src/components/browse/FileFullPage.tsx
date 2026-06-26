"use client";

/**
 * /file/[...path] page — full-page vault file view with TOC + edit mode.
 */

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { PageShell, PageAction } from "@/components/PageShell";
import { Breadcrumbs, MarkdownRenderer } from "@/components/ui";
import { useSheet } from "@/lib/hooks/useSheet";
import { useVault } from "@/lib/hooks/useVault";
import { useFileContent } from "@/lib/hooks/useFileContent";
import { BacklinksPanel } from "@/components/browse/BacklinksPanel";
import { OutgoingLinksPanel } from "@/components/browse/OutgoingLinksPanel";

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
  const { data, loading, error } = useFileContent(path);

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
      contentMaxWidth={880}
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
      <div style={{ padding: "32px 32px 120px" }}>
        {loading && <p className="caption-large" style={{ color: "var(--text-quaternary)" }}>Loading…</p>}
        {error && (
          <div>
            <p className="caption-large" style={{ color: "var(--status-blocked)", marginBottom: 8 }}>
              Couldn&#39;t load file
            </p>
            <p className="small" style={{ color: "var(--text-tertiary)" }}>{error}</p>
          </div>
        )}
        {data && (
          <MarkdownRenderer content={data.content} onNavigate={sheet.open} />
        )}
        {data && (
          <OutgoingLinksPanel path={path} onNavigate={sheet.open} variant="block" />
        )}
        {data && (
          <BacklinksPanel path={path} onNavigate={sheet.open} variant="block" />
        )}
      </div>
    </PageShell>
  );
}
