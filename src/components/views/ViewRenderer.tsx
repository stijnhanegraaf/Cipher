"use client";

import { motion } from "framer-motion";
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
import { SourceList, ActionBar } from "@/components/ui";

const viewComponents: Record<ViewType, React.ComponentType<{ data: any; view: ViewModel }>> = {
  current_work: CurrentWorkView,
  entity_overview: EntityOverviewView,
  topic_overview: TopicOverviewView,
  timeline_synthesis: TimelineView,
  system_status: SystemStatusView,
  search_results: SearchResultsView,
};

interface ViewRendererProps {
  view: ViewModel;
  index?: number;
}

export function ViewRenderer({ view, index = 0 }: ViewRendererProps) {
  const Component = viewComponents[view.type];

  if (!Component) {
    return (
      <div className="p-6 bg-amber-50 dark:bg-amber-950/30 rounded-2xl border border-amber-200 dark:border-amber-800">
        <p className="text-amber-800 dark:text-amber-200 text-sm font-medium">Unknown view type: {view.type}</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 shadow-sm hover:shadow-md transition-shadow duration-300 overflow-hidden"
    >
      {(view.title || view.subtitle) && (
        <div className="px-6 pt-6 pb-2">
          {view.title && (
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">{view.title}</h2>
          )}
          {view.subtitle && (
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">{view.subtitle}</p>
          )}
        </div>
      )}
      <div className="px-6 pb-6">
        <Component data={view.data} view={view} />
      </div>
      {(view.sources && view.sources.length > 0) && (
        <div className="px-6 pb-4">
          <SourceList sources={view.sources} />
        </div>
      )}
      {(view.actions && view.actions.length > 0) && (
        <div className="px-6 pb-4">
          <ActionBar actions={view.actions} />
        </div>
      )}
    </motion.div>
  );
}