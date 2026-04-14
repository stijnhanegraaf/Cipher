// Internal view-model types - the contract between AI/retrieval and UI
// These are app-owned, not renderer-owned

// ─── Vault index types (shared with intent-detector) ──────────────────

export interface IndexEntry {
  name: string;
  path: string;
  area?: string;
  type?: string;
}

export interface ResearchProject {
  name: string;
  dir: string;
}

export type Intent =
  | "current_work"
  | "entity_overview"
  | "topic_overview"
  | "timeline_synthesis"
  | "system_status"
  | "search_results"
  | "browse_entities"
  | "browse_projects"
  | "browse_research"
  | "system_detail"
  | "knowledge_topic"
  | "mixed";

export type Mode = "text" | "structured" | "mixed";

export type Freshness = "fresh" | "recent" | "stale" | "unknown";

export type ViewType =
  | "current_work"
  | "entity_overview"
  | "topic_overview"
  | "timeline_synthesis"
  | "system_status"
  | "search_results"
  | "browse_entities"
  | "browse_projects"
  | "browse_research";

export type Status = "ok" | "warn" | "error" | "stale" | "fresh";
export type Priority = "high" | "medium" | "low";
export type Tone = "info" | "warning" | "success" | "error" | "neutral";

export interface LinkRef {
  label: string;
  path: string;
  kind?: string;
}

export interface TaskItem {
  id: string;
  text: string;
  status: "open" | "in_progress" | "done" | "blocked";
  priority?: Priority;
  links?: LinkRef[];
  related?: LinkRef[];
  lineIndex?: number;
}

export interface TaskGroup {
  label: string;
  items: TaskItem[];
}

export interface TimelineItem {
  date: string;
  label: string;
  summary?: string;
  path?: string;
}

export interface ThemeGroup {
  label: string;
  summary: string;
  items: TimelineItem[];
}

export interface StatusItem {
  label: string;
  status: Status;
  detail?: string;
}

export interface SourceRef {
  label: string;
  path: string;
  kind: "canonical_note" | "derived_index" | "runtime_status" | "generated_summary";
  role?: string;
  excerpt?: string;
  relevance?: "high" | "medium" | "low";
}

export interface ActionRef {
  id: string;
  type: "open_note" | "open_view" | "filter_view" | "retry_query" | "show_sources";
  label: string;
  target?: { path?: string; view?: string };
  safety: "safe";
}

export interface ViewMeta {
  confidence?: number;
  freshness?: Freshness;
  generatedAt?: string;
  primarySourceCount?: number;
}

export interface CurrentWorkData {
  groups: TaskGroup[];
  periodLinks?: {
    week?: LinkRef;
    month?: LinkRef;
  };
  highlights?: string[];
}

export interface EntityOverviewData {
  entityType: string;
  summary: string;
  whyNow?: string;
  relatedNotes?: LinkRef[];
  relatedEntities?: LinkRef[];
  timeline?: TimelineItem[];
}

export interface TopicOverviewData {
  topicType: string;
  currentState?: string;
  keyQuestions?: string[];
  nextSteps?: string[];
  summary: string;
  whyNow?: string;
  relatedNotes?: LinkRef[];
  relatedEntities?: LinkRef[];
  timeline?: TimelineItem[];
}

export interface TimelineSynthesisData {
  range: {
    label: string;
    start: string;
    end: string;
  };
  themes: ThemeGroup[];
  proofGaps?: string[];
}

export interface SystemStatusData {
  overall: {
    label: string;
    status: Status;
  };
  checks: StatusItem[];
  attention?: string[];
}

export interface SearchResultsData {
  query: string;
  results: {
    label: string;
    path: string;
    excerpt?: string;
    kind?: string;
  }[];
  suggestedViews?: { intent: Intent; label: string }[];
}

export interface BrowseIndexData {
  indexType: "entities" | "projects" | "research";
  items: IndexEntry[];
  researchItems?: ResearchProject[];
}

export type ViewData =
  | CurrentWorkData
  | EntityOverviewData
  | TopicOverviewData
  | TimelineSynthesisData
  | SystemStatusData
  | SearchResultsData
  | BrowseIndexData;

export interface ViewModel {
  type: ViewType;
  viewId: string;
  title?: string;
  subtitle?: string;
  layout?: "stack" | "split" | "grid" | "timeline";
  data: ViewData;
  sources?: SourceRef[];
  actions?: ActionRef[];
  meta?: ViewMeta;
  sourceFile?: string; // Path to the original Obsidian file for "Open in Obsidian" links
}

export interface ResponseEnvelope {
  version: "v1";
  request: {
    id: string;
    intent: Intent;
    mode: Mode;
    query?: string;
    entityName?: string;
  };
  response: {
    title: string;
    summary: string;
    text?: string;
    views: ViewModel[];
    sources?: SourceRef[];
    actions?: ActionRef[];
    meta?: ViewMeta;
  };
}