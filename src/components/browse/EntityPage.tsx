"use client";

/**
 * /browse/entity/[name] page — entity overview with linked notes + facts.
 */

import { useCallback, useEffect, useState } from "react";
import { PageShell, PageAction } from "@/components/PageShell";
import { LinkList, MarkdownRenderer } from "@/components/ui";
import { useSheet } from "@/lib/hooks/useSheet";
import { useVault } from "@/lib/hooks/useVault";
import type { EntityOverviewData, ViewModel } from "@/lib/view-models";

async function fetchEntity(name: string): Promise<{ view: ViewModel | null; data: EntityOverviewData | null }> {
  const res = await fetch("/api/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: `tell me about ${name}`, entityName: name }),
  });
  if (!res.ok) return { view: null, data: null };
  const payload = await res.json();
  const view = payload?.response?.views?.[0] ?? null;
  return { view, data: (view?.data as EntityOverviewData) ?? null };
}

export function EntityPage({ name }: { name: string }) {
  const sheet = useSheet();
  const vault = useVault();
  const [data, setData] = useState<EntityOverviewData | null>(null);
  const [view, setView] = useState<ViewModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { view, data } = await fetchEntity(name);
        if (!cancelled) {
          setView(view);
          setData(data);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load entity");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [name]);

  const openObsidian = useCallback(() => {
    const path = view?.sourceFile || view?.sources?.[0]?.path;
    if (!path) return;
    const vaultName = vault.name || "Obsidian";
    window.open(`obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(path)}`, "_blank");
  }, [view, vault.name]);

  const title = view?.title || name;
  const subtitle = data?.summary ? data.summary.slice(0, 120) + (data.summary.length > 120 ? "…" : "") : data?.entityType;

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
    >
      <div style={{ padding: "24px 32px 80px" }}>
        {loading && <p className="small" style={{ color: "var(--text-quaternary)" }}>Loading…</p>}
        {!loading && error && (
          <p className="small" style={{ color: "var(--status-blocked)" }}>{error}</p>
        )}
        {!loading && !error && data && (
          <>
            {data.whyNow && (
              <div
                style={{
                  marginBottom: 24,
                  padding: "12px 16px",
                  borderRadius: 8,
                  background: "color-mix(in srgb, var(--accent-brand) 6%, transparent)",
                  borderLeft: "2px solid var(--accent-brand)",
                }}
              >
                <div className="small" style={{ color: "var(--text-secondary)", lineHeight: 1.6 }}>
                  <MarkdownRenderer content={data.whyNow} onNavigate={sheet.open} />
                </div>
              </div>
            )}

            <section style={{ marginBottom: 32 }}>
              <div className="mono-label" style={{ color: "var(--text-tertiary)", letterSpacing: "0.04em", marginBottom: 12 }}>
                SUMMARY
              </div>
              <div className="small" style={{ color: "var(--text-secondary)", lineHeight: 1.6 }}>
                <MarkdownRenderer content={data.summary} onNavigate={sheet.open} />
              </div>
            </section>

            {data.relatedEntities && data.relatedEntities.length > 0 && (
              <section style={{ marginBottom: 32 }}>
                <SubHeader label="Connected" count={data.relatedEntities.length} />
                <LinkList items={data.relatedEntities} onNavigate={sheet.open} />
              </section>
            )}
            {data.relatedNotes && data.relatedNotes.length > 0 && (
              <section style={{ marginBottom: 32 }}>
                <SubHeader label="Related notes" count={data.relatedNotes.length} />
                <LinkList items={data.relatedNotes} onNavigate={sheet.open} />
              </section>
            )}

            {data.timeline && data.timeline.length > 0 && (
              <section>
                <SubHeader label="Recent activity" count={data.timeline.length} />
                {data.timeline.map((item, i) => (
                  <div
                    key={i}
                    className="app-row"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "0 12px",
                      margin: "0 -12px",
                      height: 32,
                      borderBottom: "1px solid var(--border-subtle)",
                    }}
                  >
                    <span className="mono-label" style={{ width: 64, color: "var(--text-quaternary)", letterSpacing: "0.04em", flexShrink: 0 }}>
                      {item.date}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-secondary)", fontSize: 13 }}>
                      {item.label}
                    </span>
                  </div>
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </PageShell>
  );
}

function SubHeader({ label, count }: { label: string; count: number }) {
  return (
    <div
      className="mono-label"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 12,
        paddingBottom: 6,
        borderBottom: "1px solid var(--border-subtle)",
        color: "var(--text-tertiary)",
        letterSpacing: "0.04em",
      }}
    >
      <span>{label.toUpperCase()}</span>
      <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-quaternary)" }}>{count}</span>
    </div>
  );
}
