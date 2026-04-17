"use client";

import { motion } from "framer-motion";
import { cardEntrance } from "@/lib/motion";
import {
  ViewModel,
  ViewType,
} from "@/lib/view-models";
import { CurrentWorkView } from "./CurrentWorkView";
import { EntityOverviewView } from "./EntityOverviewView";
import { TopicOverviewView } from "./TopicOverviewView";
import { TimelineView } from "./TimelineView";
import { SystemStatusView } from "./SystemStatusView";
import { SearchResultsView } from "./SearchResultsView";
import { BrowseView } from "./BrowseView";
import { ActionBar } from "@/components/ui";
import { formatFreshness, formatViewType, pluralize } from "@/lib/format";
import { useVault } from "@/lib/hooks/useVault";

const viewComponents: Record<ViewType, React.ComponentType<{ data: any; view: ViewModel; onToggle?: (itemId: string, checked: boolean) => void; onAsk?: (query: string) => void; onNavigate?: (path: string) => void }>> = {
  current_work: CurrentWorkView,
  entity_overview: EntityOverviewView,
  topic_overview: TopicOverviewView,
  timeline_synthesis: TimelineView,
  system_status: SystemStatusView,
  search_results: SearchResultsView,
  browse_entities: ({ data }: { data: any; view: any }) => <BrowseView data={data} />,
  browse_projects: ({ data }: { data: any; view: any }) => <BrowseView data={data} />,
  browse_research: ({ data }: { data: any; view: any }) => <BrowseView data={data} />,
};

// Map view type to a small, stroke-2 icon for the header spine.
const viewIcons: Record<ViewType, React.ReactNode> = {
  current_work: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  ),
  entity_overview: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  ),
  topic_overview: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  ),
  timeline_synthesis: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  system_status: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  search_results: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
  browse_entities: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  browse_projects: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  ),
  browse_research: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
};

// Freshness → color + copy. "fresh" intentionally renders nothing (no noise).
const freshnessTone: Record<string, { color: string; label: string }> = {
  fresh:   { color: "",                         label: "" },
  recent:  { color: "var(--text-tertiary)",     label: "recent" },
  stale:   { color: "var(--status-warning)",    label: "stale" },
  unknown: { color: "var(--text-quaternary)",   label: "unknown" },
};

// Build the obsidian:// URL using the active vault's basename.
function getObsidianUrl(path: string, vaultName: string): string {
  return `obsidian://open?vault=${encodeURIComponent(vaultName || "Obsidian")}&file=${encodeURIComponent(path)}`;
}

interface ViewRendererProps {
  view: ViewModel;
  index?: number;
  onNavigate?: (path: string) => void;
  onToggle?: (itemId: string, checked: boolean) => void;
  /** Re-enter the chat with a preset query — used by empty-state CTAs. */
  onAsk?: (query: string) => void;
}

/**
 * ViewRenderer — Sweep-4 "flatter card".
 *
 * Gone: outer border, bg-surface tint, 5 stacked divider bands, freshness pill
 * when fresh, "Open in Obsidian" as a separate row.
 *
 * Kept: view-type icon + title spine, one single 1px header rule, inline meta
 * bar (kind · freshness · sources-disclosure · Obsidian link), actions as ghost
 * buttons inline above meta. Reads as a Linear comment, not a card.
 */
export function ViewRenderer({ view, index = 0, onNavigate, onToggle, onAsk }: ViewRendererProps) {
  const { name: vaultName } = useVault();
  const Component = viewComponents[view.type];

  if (!Component) {
    return (
      <div
        className="p-6 rounded-[8px]"
        style={{
          background: "color-mix(in srgb, var(--status-warning) 6%, transparent)",
          border: "1px solid color-mix(in srgb, var(--status-warning) 15%, transparent)",
        }}
      >
        <p className="caption-large" style={{ color: "var(--status-warning)", fontWeight: 510 }}>
          Unknown view type: {view.type}
        </p>
      </div>
    );
  }

  const sourceFile = view.sourceFile || (view.sources && view.sources.length > 0 ? view.sources[0].path : undefined);
  const freshness = view.meta?.freshness;
  const showFreshness = freshness && freshness !== "fresh";
  const freshnessCfg = showFreshness ? freshnessTone[freshness] : null;

  // Compact meta atoms — joined by middle dots.
  const metaAtoms: { key: string; content: React.ReactNode }[] = [];
  metaAtoms.push({ key: "type", content: formatViewType(view.type) });
  if (view.meta?.generatedAt) {
    metaAtoms.push({ key: "freshness", content: formatFreshness(view.meta.generatedAt) });
  }
  if (view.meta?.confidence !== undefined) {
    metaAtoms.push({ key: "conf", content: `${Math.round(view.meta.confidence * 100)}% confidence` });
  }

  return (
    <motion.div variants={cardEntrance} initial="hidden" animate="show" exit="exit">
      {/* ── Header spine ─────────────────────────────────────────────
          No outer border, no bg. Icon at title's first-line baseline
          (via items-center on the icon+title row). One 1px rule below. */}
      {(view.title || view.subtitle) && (
        <div
          className="flex items-start justify-between gap-3 pb-4"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <div className="flex items-start gap-3 min-w-0">
            <span
              className="flex items-center justify-center shrink-0 text-text-quaternary"
              style={{ width: 20, height: 20, marginTop: 2 }}
            >
              {viewIcons[view.type]}
            </span>
            <div className="min-w-0">
              {view.title && (
                <h2 className="heading-3 text-text-primary">
                  {view.title}
                </h2>
              )}
              {view.subtitle && (
                <p className="caption text-text-tertiary mt-0.5">
                  {view.subtitle}
                </p>
              )}
            </div>
          </div>
          {showFreshness && freshnessCfg && (
            <span
              className="mono-label shrink-0 mt-1 px-2 py-0.5 rounded-[4px]"
              style={{
                color: freshnessCfg.color,
                background: `color-mix(in srgb, ${freshnessCfg.color} 8%, transparent)`,
                border: `1px solid color-mix(in srgb, ${freshnessCfg.color} 15%, transparent)`,
                letterSpacing: "0.04em",
              }}
            >
              {freshnessCfg.label}
            </span>
          )}
        </div>
      )}

      {/* ── Content — indented under the spine ─────────────────── */}
      <div className="pt-4 pl-8 pr-0">
        <Component
          data={view.data}
          view={view}
          onToggle={view.type === "current_work" ? onToggle : undefined}
          onAsk={onAsk}
          onNavigate={onNavigate}
        />
      </div>

      {/* ── Inline actions (no divider) ─────────────────────────── */}
      {view.actions && view.actions.length > 0 && (
        <div className="mt-4 pl-8">
          <ActionBar actions={view.actions} onNavigate={onNavigate} onAsk={onAsk} />
        </div>
      )}

      {/* ── Compact meta row ────────────────────────────────────
          kind · freshness · [▸ sources disclosure] · Open in Obsidian
          One line, mono-label, text-quaternary. No divider above. */}
      {(metaAtoms.length > 0 || (view.sources && view.sources.length > 0) || sourceFile) && (
        <div className="mt-3 pl-8 flex items-center gap-2 flex-wrap mono-label text-text-quaternary" style={{ letterSpacing: "0.02em" }}>
          {metaAtoms.map((atom, i) => (
            <span key={atom.key} className="flex items-center gap-2">
              {i > 0 && <span style={{ opacity: 0.5 }}>·</span>}
              <span>{atom.content}</span>
            </span>
          ))}
          {view.sources && view.sources.length > 0 && (
            <>
              <span style={{ opacity: 0.5 }}>·</span>
              <details className="group">
                <summary
                  className="inline-flex items-center gap-1 cursor-pointer hover:text-text-secondary transition-colors duration-150"
                  style={{ listStyle: "none" }}
                >
                  <svg className="w-2.5 h-2.5 transition-transform duration-150 group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  {pluralize(view.sources.length, "source")}
                </summary>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {view.sources.map((source, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => onNavigate?.(source.path)}
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] label-medium text-text-tertiary hover:text-text-secondary hover:bg-[var(--bg-surface-alpha-4)] transition-colors duration-150"
                      style={{
                        background: "var(--bg-surface-alpha-2)",
                        border: "1px solid var(--border-subtle)",
                        cursor: onNavigate ? "pointer" : "default",
                      }}
                      disabled={!onNavigate}
                    >
                      {source.label}
                    </button>
                  ))}
                </div>
              </details>
            </>
          )}
          {sourceFile && (
            <>
              <span style={{ opacity: 0.5 }}>·</span>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  if (onNavigate) {
                    onNavigate(sourceFile);
                  } else {
                    window.open(getObsidianUrl(sourceFile, vaultName), "_blank");
                  }
                }}
                className="inline-flex items-center gap-1 hover:text-text-secondary transition-colors duration-150 cursor-pointer"
                style={{ textDecoration: "none" }}
              >
                Open in Obsidian
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </>
          )}
        </div>
      )}
    </motion.div>
  );
}
