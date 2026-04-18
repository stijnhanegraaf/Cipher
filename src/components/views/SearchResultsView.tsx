"use client";

/** Renders SearchResultsData in the chat-summary variant. */

import { motion } from "framer-motion";
import { stagger, fadeSlideUp } from "@/lib/motion";
import { SearchResultsData, ViewModel } from "@/lib/view-models";
import { Badge } from "@/components/ui";

// Kind → display label & badge variant
const kindConfig: Record<string, { label: string; variant: "default" | "success" | "warning" | "error" | "indigo" | "outline" }> = {
  canonical_note:    { label: "Note",    variant: "indigo" },
  entity:            { label: "Entity",  variant: "outline" },
  topic:             { label: "Topic",   variant: "outline" },
  derived_index:     { label: "Index",   variant: "default" },
  runtime_status:    { label: "Status",  variant: "warning" },
  generated_summary: { label: "Summary", variant: "default" },
};

// Group results by kind for cleaner display
function groupByKind(results: SearchResultsData["results"]) {
  const groups: Record<string, SearchResultsData["results"]> = {};
  for (const r of results) {
    const kind = r.kind || "other";
    if (!groups[kind]) groups[kind] = [];
    groups[kind].push(r);
  }
  return groups;
}

export function SearchResultsView({ data, view, onAsk, onNavigate }: { data: unknown; view: ViewModel; onAsk?: (query: string) => void; onNavigate?: (path: string) => void }) {
  const search = data as SearchResultsData;
  const groups = groupByKind(search.results);
  const kindOrder = ["canonical_note", "entity", "topic", "derived_index", "runtime_status", "generated_summary", "other"];

  return (
    <motion.div
      variants={stagger.container(0.04)}
      initial="hidden"
      animate="show"
      className="space-y-8"
    >
      {/* Search context */}
      <motion.div variants={fadeSlideUp} className="flex items-center gap-2.5">
        <svg
          className="w-4 h-4 shrink-0 text-text-quaternary"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span className="caption-large text-text-tertiary">
          Results for{" "}
          <span className="text-text-primary" style={{ fontWeight: 590 }}>
            &ldquo;{search.query}&rdquo;
          </span>
        </span>
        <Badge variant="outline">{search.results.length} results</Badge>
      </motion.div>

      {/* Empty state */}
      {search.results.length === 0 && (
        <motion.div variants={fadeSlideUp} className="flex flex-col items-center justify-center py-16">
          <motion.svg
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.3 }}
            transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
            width={48}
            height={48}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mb-4 text-text-quaternary"
          >
            <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </motion.svg>
          <p className="caption-large text-text-quaternary mb-3" style={{ lineHeight: 1.6 }}>
            No matches for &ldquo;{search.query}&rdquo;.
          </p>
          {onAsk && (
            <button
              onClick={() => onAsk(`search broadly for ${search.query}`)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] caption-medium text-text-primary cursor-pointer transition-colors duration-150 hover:bg-[var(--bg-surface-alpha-4)]"
              style={{
                background: "var(--bg-surface-alpha-2)",
                border: "1px solid var(--border-standard)",
              }}
            >
              Try a broader search
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </motion.div>
      )}

      {/* Grouped results */}
      {kindOrder.map((kind) => {
        const items = groups[kind];
        if (!items || items.length === 0) return null;
        const config = kindConfig[kind] || { label: kind, variant: "outline" as const };

        return (
          <motion.div key={kind} variants={fadeSlideUp} className="space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="micro uppercase tracking-[0.08em] text-text-quaternary">
                {config.label}
              </h3>
            </div>
            <div className="space-y-1">
              {items.map((result, i) => {
                const clickable = !!(result.path && onNavigate);
                const body = (
                  <>
                    <div className="mt-0.5 shrink-0">
                      <svg
                        className="w-4 h-4 text-text-quaternary"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="caption-large text-text-primary truncate">{result.label}</p>
                      {result.excerpt && (
                        <p
                          className="caption text-text-quaternary mt-0.5"
                          style={{
                            lineHeight: 1.5,
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          {result.excerpt}
                        </p>
                      )}
                    </div>
                    {clickable && (
                      <svg
                        className="w-3.5 h-3.5 shrink-0 mt-0.5 text-text-quaternary"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    )}
                  </>
                );
                if (!clickable) {
                  return (
                    <div key={i} className="app-row flex items-start gap-3 p-3 rounded-[8px]" style={{ cursor: "default" }}>
                      {body}
                    </div>
                  );
                }
                return (
                  <a
                    key={i}
                    href={`vault://${result.path}`}
                    onClick={(e) => {
                      e.preventDefault();
                      onNavigate!(result.path!);
                    }}
                    className="app-row flex items-start gap-3 p-3 rounded-[8px] transition-colors duration-150 cursor-pointer hover:bg-[var(--bg-surface-alpha-2)]"
                  >
                    {body}
                  </a>
                );
              })}
            </div>
          </motion.div>
        );
      })}

      {/* Suggested views */}
      {search.suggestedViews && search.suggestedViews.length > 0 && (
        <motion.div variants={fadeSlideUp} className="pt-2">
          <h3 className="micro uppercase tracking-[0.08em] text-text-quaternary mb-3">
            Related views
          </h3>
          <div className="flex flex-wrap gap-2">
            {search.suggestedViews.map((sv, i) => {
              // Map a suggested view intent back into a natural-language query so
              // the existing chat/intent pipeline can re-resolve it end-to-end.
              const queryForIntent = (intent: string): string => {
                switch (intent) {
                  case "current_work": return "what matters now";
                  case "system_status": return "system health";
                  case "timeline_synthesis": return "what changed this month";
                  case "entity_overview": return sv.label;
                  case "topic_overview": return sv.label;
                  case "search_results": return sv.label;
                  default: return sv.label;
                }
              };
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => onAsk?.(queryForIntent(sv.intent))}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] label-medium text-accent-violet cursor-pointer transition-colors duration-150 hover:brightness-110"
                  style={{
                    background: "color-mix(in srgb, var(--accent-brand) 8%, transparent)",
                    border: "1px solid color-mix(in srgb, var(--accent-brand) 15%, transparent)",
                  }}
                >
                  {sv.label}
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              );
            })}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
