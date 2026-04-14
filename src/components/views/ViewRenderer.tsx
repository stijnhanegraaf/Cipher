"use client";

import { motion } from "framer-motion";
import { fadeSlideUp } from "@/lib/motion";
import {
  CurrentWorkData,
  EntityOverviewData,
  TopicOverviewData,
  TimelineSynthesisData,
  SystemStatusData,
  SearchResultsData,
  ViewModel,
  ViewType,
} from "@/lib/view-models";
import { CurrentWorkView } from "./CurrentWorkView";
import { EntityOverviewView } from "./EntityOverviewView";
import { TopicOverviewView } from "./TopicOverviewView";
import { TimelineView } from "./TimelineView";
import { SystemStatusView } from "./SystemStatusView";
import { SearchResultsView } from "./SearchResultsView";
import { SourceList, ActionBar, Badge } from "@/components/ui";

// Design tokens
const tokens = {
  bg: {
    surface: "#191a1b",
    secondary: "#28282c",
  },
  text: {
    primary: "#f7f8f8",
    secondary: "#d0d6e0",
    tertiary: "#8a8f98",
    quaternary: "#62666d",
  },
  brand: {
    indigo: "#5e6ad2",
    violet: "#7170ff",
  },
  border: {
    subtle: "rgba(255,255,255,0.05)",
    standard: "rgba(255,255,255,0.08)",
  },
};

const fontFamily = {
  inter: "'Inter Variable', 'SF Pro Display', -apple-system, system-ui, sans-serif",
};

const viewComponents: Record<ViewType, React.ComponentType<{ data: any; view: ViewModel }>> = {
  current_work: CurrentWorkView,
  entity_overview: EntityOverviewView,
  topic_overview: TopicOverviewView,
  timeline_synthesis: TimelineView,
  system_status: SystemStatusView,
  search_results: SearchResultsView,
};

// Map view type to an icon for the header
const viewIcons: Record<ViewType, React.ReactNode> = {
  current_work: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  ),
  entity_overview: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  ),
  topic_overview: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  ),
  timeline_synthesis: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  system_status: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  search_results: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
};

// Map freshness to badge variant
const freshnessVariant: Record<string, "success" | "warning" | "default" | "outline"> = {
  fresh: "success",
  recent: "outline",
  stale: "warning",
  unknown: "default",
};

// Obsidian URL builder
function getObsidianUrl(path: string): string {
  return `obsidian://open?vault=Obsidian&file=${encodeURIComponent(path)}`;
}

interface ViewRendererProps {
  view: ViewModel;
  index?: number;
}

export function ViewRenderer({ view, index = 0 }: ViewRendererProps) {
  const Component = viewComponents[view.type];

  if (!Component) {
    return (
      <div
        className="p-6 rounded-[12px]"
        style={{
          background: "rgba(245,158,11,0.06)",
          border: "1px solid rgba(245,158,11,0.15)",
        }}
      >
        <p
          className="text-[14px] font-[510]"
          style={{
            color: "#f59e0b",
            fontFamily: fontFamily.inter,
            fontFeatureSettings: '"cv01", "ss03"',
          }}
        >
          Unknown view type: {view.type}
        </p>
      </div>
    );
  }

  // Determine the Obsidian source file
  const sourceFile = view.sourceFile || (view.sources && view.sources.length > 0 ? view.sources[0].path : undefined);

  return (
    <motion.div
      variants={fadeSlideUp}
      initial="hidden"
      animate="show"
      transition={{ delay: index * 0.12 }}
      className="rounded-[12px] overflow-hidden"
      style={{
        background: tokens.bg.surface,
        border: `1px solid ${tokens.border.standard}`,
      }}
    >
      {/* View header */}
      {(view.title || view.subtitle) && (
        <div
          className="px-7 pt-7 pb-4"
          style={{ borderBottom: `1px solid ${tokens.border.subtle}` }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="flex items-center justify-center w-8 h-8 rounded-[6px] shrink-0"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  color: tokens.text.tertiary,
                }}
              >
                {viewIcons[view.type]}
              </div>
              <div className="min-w-0">
                {view.title && (
                  <h2
                    className="text-[20px] font-[590] tracking-[-0.24px]"
                    style={{
                      color: tokens.text.primary,
                      fontFamily: fontFamily.inter,
                      fontFeatureSettings: '"cv01", "ss03"',
                      lineHeight: "1.33",
                    }}
                  >
                    {view.title}
                  </h2>
                )}
                {view.subtitle && (
                  <p
                    className="text-[13px] mt-1"
                    style={{
                      color: tokens.text.tertiary,
                      fontFamily: fontFamily.inter,
                      fontFeatureSettings: '"cv01", "ss03"',
                    }}
                  >
                    {view.subtitle}
                  </p>
                )}
              </div>
            </div>
            {view.meta?.freshness && (
              <Badge variant={freshnessVariant[view.meta.freshness] || "outline"}>
                {view.meta.freshness}
              </Badge>
            )}
          </div>
        </div>
      )}

      {/* View content */}
      <div className="px-7 py-6">
        <Component data={view.data} view={view} />
      </div>

      {/* Sources footer */}
      {view.sources && view.sources.length > 0 && (
        <div
          className="px-7 pb-5 pt-2"
          style={{ borderTop: `1px solid ${tokens.border.subtle}` }}
        >
          <SourceList sources={view.sources} />
        </div>
      )}

      {/* Actions footer */}
      {view.actions && view.actions.length > 0 && (
        <div
          className="px-7 pb-5 pt-2"
          style={{ borderTop: `1px solid ${tokens.border.subtle}` }}
        >
          <ActionBar actions={view.actions} />
        </div>
      )}

      {/* Meta footer — confidence, timestamp, and "Open in Obsidian" link */}
      <div
        className="px-7 pb-5 pt-2 flex items-center justify-between"
        style={{
          fontFamily: fontFamily.inter,
          fontFeatureSettings: '"cv01", "ss03"',
        }}
      >
        <div
          className="flex items-center gap-4"
          style={{
            color: tokens.text.quaternary,
            fontSize: "11px",
            fontWeight: 510,
          }}
        >
          {view.meta?.confidence !== undefined && (
            <span>Confidence: {Math.round(view.meta.confidence * 100)}%</span>
          )}
          {view.meta?.generatedAt && (
            <span>
              Generated {new Date(view.meta.generatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          {view.meta?.primarySourceCount !== undefined && (
            <span>{view.meta.primarySourceCount} sources</span>
          )}
        </div>
        {sourceFile && (
          <a
            href={getObsidianUrl(sourceFile)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 transition-colors duration-150"
            style={{
              color: tokens.text.quaternary,
              fontSize: "11px",
              fontWeight: 400,
              letterSpacing: "0.02em",
              textDecoration: "none",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = tokens.text.tertiary;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = tokens.text.quaternary;
            }}
          >
            <svg
              className="w-3 h-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Open in Obsidian
          </a>
        )}
      </div>
    </motion.div>
  );
}