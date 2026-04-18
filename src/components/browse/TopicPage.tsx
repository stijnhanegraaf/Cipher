"use client";

/**
 * /browse/topic/[name] page — topic overview with linked notes.
 */

import { useCallback, useEffect, useState } from "react";
import { PageShell, PageAction } from "@/components/PageShell";
import { LinkList, MarkdownRenderer } from "@/components/ui";
import { useSheet } from "@/lib/hooks/useSheet";
import { useVault } from "@/lib/hooks/useVault";
import type { TopicOverviewData, ViewModel } from "@/lib/view-models";

async function fetchTopic(name: string): Promise<{ view: ViewModel | null; data: TopicOverviewData | null }> {
  const res = await fetch("/api/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: `tell me about ${name}` }),
  });
  if (!res.ok) return { view: null, data: null };
  const payload = await res.json();
  const view = payload?.response?.views?.[0] ?? null;
  return { view, data: (view?.data as TopicOverviewData) ?? null };
}

export function TopicPage({ name }: { name: string }) {
  const sheet = useSheet();
  const vault = useVault();
  const [data, setData] = useState<TopicOverviewData | null>(null);
  const [view, setView] = useState<ViewModel | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { view, data } = await fetchTopic(name);
        if (!cancelled) {
          setView(view);
          setData(data);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [name]);

  const openObsidian = useCallback(() => {
    const path = view?.sourceFile || view?.sources?.[0]?.path;
    if (!path) return;
    const vaultName = vault.name || "Obsidian";
    window.open(`obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(path)}`, "_blank");
  }, [view, vault.name]);

  const title = view?.title || name;
  const subtitle = data?.summary ? data.summary.slice(0, 120) + (data.summary.length > 120 ? "…" : "") : data?.topicType;

  return (
    <PageShell
      icon={
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="7" width="18" height="13" rx="2" />
          <path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2" />
        </svg>
      }
      title={title}
      subtitle={subtitle}
      actions={
        <PageAction label="Open in Obsidian" onClick={openObsidian}>
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </PageAction>
      }
    >
      <div style={{ padding: "24px 32px 80px", maxWidth: 880, margin: "0 auto" }}>
        {loading && <p className="small" style={{ color: "var(--text-quaternary)" }}>Loading…</p>}
        {!loading && data && (
          <>
            {data.currentState && (
              <section style={{ marginBottom: 32 }}>
                <SubHeader label="Current state" />
                <div
                  style={{
                    padding: "12px 16px",
                    borderRadius: 8,
                    background: "color-mix(in srgb, var(--status-done) 4%, transparent)",
                    borderLeft: "2px solid var(--status-done)",
                  }}
                >
                  <div className="small" style={{ color: "var(--text-secondary)", lineHeight: 1.6 }}>
                    <MarkdownRenderer content={data.currentState} onNavigate={sheet.open} />
                  </div>
                </div>
              </section>
            )}

            {data.keyQuestions && data.keyQuestions.length > 0 && (
              <section style={{ marginBottom: 32 }}>
                <SubHeader label="Open questions" count={data.keyQuestions.length} />
                {data.keyQuestions.map((q, i) => (
                  <div
                    key={i}
                    className="app-row"
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 12,
                      padding: "10px 12px",
                      margin: "0 -12px",
                      borderBottom: "1px solid var(--border-subtle)",
                    }}
                  >
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--status-warning)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 3 }}>
                      <path d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="small" style={{ color: "var(--text-secondary)", lineHeight: 1.5, margin: 0 }}>
                      {q}
                    </p>
                  </div>
                ))}
              </section>
            )}

            {data.nextSteps && data.nextSteps.length > 0 && (
              <section style={{ marginBottom: 32 }}>
                <SubHeader label="Next steps" count={data.nextSteps.length} />
                {data.nextSteps.map((s, i) => (
                  <div
                    key={i}
                    className="app-row"
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 12,
                      padding: "10px 12px",
                      margin: "0 -12px",
                      borderBottom: "1px solid var(--border-subtle)",
                    }}
                  >
                    <span
                      className="mono-label"
                      style={{
                        width: 18,
                        height: 18,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: "50%",
                        background: "color-mix(in srgb, var(--status-done) 12%, transparent)",
                        color: "var(--status-done)",
                        fontWeight: 590,
                        flexShrink: 0,
                        marginTop: 1,
                      }}
                    >
                      {i + 1}
                    </span>
                    <p className="small" style={{ color: "var(--text-secondary)", lineHeight: 1.5, margin: 0 }}>
                      {s}
                    </p>
                  </div>
                ))}
              </section>
            )}

            {data.relatedNotes && data.relatedNotes.length > 0 && (
              <section style={{ marginBottom: 32 }}>
                <SubHeader label="Related notes" count={data.relatedNotes.length} />
                <LinkList items={data.relatedNotes} onNavigate={sheet.open} />
              </section>
            )}
          </>
        )}
      </div>
    </PageShell>
  );
}

function SubHeader({ label, count }: { label: string; count?: number }) {
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
      {count != null && (
        <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-quaternary)" }}>{count}</span>
      )}
    </div>
  );
}
