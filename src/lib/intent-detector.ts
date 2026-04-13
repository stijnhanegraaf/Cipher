// Intent Detector — maps natural language queries to view types and vault files

import type { Intent, ViewType } from "./view-models";

export interface IntentResult {
  intent: Intent;
  viewType: ViewType;
  query: string;
  confidence: number;
  files: string[];       // vault files to read
  searchTerm?: string;   // for search_results
}

// ─── Keyword sets per intent ──────────────────────────────────────────

const INTENT_KEYWORDS: Record<string, { keywords: string[]; files: string[] }> = {
  current_work: {
    keywords: [
      "work", "todo", "todos", "task", "tasks", "active", "current",
      "what matters", "open work", "doing", "working on", "priorities",
      "now", "today", "focus", "dashboard",
    ],
    files: [
      "wiki/work/open.md",
      "wiki/work/waiting-for.md",
    ],
  },
  entity_overview: {
    keywords: [
      "tebi", "company", "entity", "organization", "startup",
      "about tebi", "tell me about", "who is", "what is",
    ],
    files: [
      "wiki/knowledge/tebi-brain.md",
    ],
  },
  system_status: {
    keywords: [
      "system", "health", "status", "broken", "stale", "check",
      "systems", "cron", "agent", "agents", "runtime", "ops",
    ],
    files: [
      "wiki/system/status.md",
      "wiki/system/open-loops.md",
    ],
  },
  timeline_synthesis: {
    keywords: [
      "timeline", "changed", "recently", "this month", "this week",
      "history", "what happened", "what changed", "when", "chronology",
      "april", "march", "2026",
    ],
    files: [
      "wiki/work/log/2026/april.md",
    ],
  },
  topic_overview: {
    keywords: [
      "project", "topic", "research", "overview", "about the",
      "what is the", "brain frontend", "frontend project",
      "ai visual", "visual brain",
    ],
    files: [
      "wiki/projects/ai-visual-brain-frontend.md",
      "wiki/projects/ai-visual-brain-frontend-product-spec.md",
    ],
  },
  search_results: {
    keywords: [
      "search", "find", "lookup", "where is", "look up",
      "show me", "anything about",
    ],
    files: [],
  },
};

// ─── Detect intent ────────────────────────────────────────────────────

export function detectIntent(query: string): IntentResult {
  const q = query.toLowerCase().trim();

  // Score each intent by keyword overlap
  const scores: { intent: string; score: number }[] = [];

  for (const [intent, config] of Object.entries(INTENT_KEYWORDS)) {
    let score = 0;
    for (const kw of config.keywords) {
      if (q.includes(kw)) {
        // Longer keyword matches are worth more
        score += kw.length;
      }
    }
    if (score > 0) {
      scores.push({ intent, score });
    }
  }

  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);

  // Special case: "tebi" with research/project context → topic_overview
  if (q.includes("tebi") && (q.includes("research") || q.includes("project") || q.includes("pos"))) {
    return {
      intent: "topic_overview",
      viewType: "topic_overview",
      query,
      confidence: 0.92,
      files: ["wiki/knowledge/research/projects/tebi-pos/executive-summary.md"],
    };
  }

  // Special case: "tebi" alone → entity_overview
  if (q.includes("tebi")) {
    return {
      intent: "entity_overview",
      viewType: "entity_overview",
      query,
      confidence: 0.95,
      files: INTENT_KEYWORDS.entity_overview.files,
    };
  }

  // If we have a clear winner
  if (scores.length > 0 && scores[0].score > 0) {
    const best = scores[0];
    const confidence = Math.min(0.6 + best.score * 0.02, 0.95);

    // If it's a search intent, keep the query as searchTerm
    if (best.intent === "search_results") {
      return {
        intent: "search_results",
        viewType: "search_results",
        query,
        confidence,
        files: [],
        searchTerm: query,
      };
    }

    const viewType = best.intent as ViewType;
    return {
      intent: best.intent as Intent,
      viewType,
      query,
      confidence,
      files: INTENT_KEYWORDS[best.intent].files,
    };
  }

  // Default: search_results with the original query
  return {
    intent: "search_results",
    viewType: "search_results",
    query,
    confidence: 0.5,
    files: [],
    searchTerm: query,
  };
}