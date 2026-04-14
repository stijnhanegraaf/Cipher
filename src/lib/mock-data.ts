// Mock data layer - simulates the retrieval/orchestration layer
// In production, this would talk to the real Obsidian vault + AI backend

import { ResponseEnvelope } from "./view-models";

// ─── Real data flag ───────────────────────────────────────────────────
// When true, the app calls the /api/query endpoint to get real vault data.
// When false (or the API is unavailable), it falls back to mock data below.
export const USE_REAL_DATA = true;

const API_URL = "/api/query";

// ─── Simple cache ─────────────────────────────────────────────────────

interface CacheEntry {
  response: ResponseEnvelope;
  timestamp: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const cache = new Map<string, CacheEntry>();

function cacheKey(query: string, entityName?: string): string {
  return entityName ? `${query}::${entityName}` : query;
}

export async function fetchRealData(query: string, entityName?: string): Promise<ResponseEnvelope | null> {
  // Check cache first
  const key = cacheKey(query, entityName);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.response;
  }

  try {
    const body: Record<string, string> = { query };
    if (entityName) {
      body.entityName = entityName;
    }

    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.warn(`fetchRealData: API returned ${res.status} ${res.statusText} for query "${query}"`);
      return null;
    }

    const response: ResponseEnvelope = await res.json();

    // Cache the response
    cache.set(key, { response, timestamp: Date.now() });

    return response;
  } catch (error) {
    console.warn(`fetchRealData: Failed to fetch real data for query "${query}"`, error);
    return null;
  }
}

// ─── Mock responses ───────────────────────────────────────────────────

const currentWorkResponse: ResponseEnvelope = {
  version: "v1",
  request: {
    id: "req_001",
    intent: "current_work",
    mode: "structured",
    query: "What matters right now?",
  },
  response: {
    title: "What matters right now",
    summary: "6 active tasks across 3 domains. 2 high-priority items need attention.",
    text: "Here's your current work landscape. The AI visual brain frontend and Nova system updates are the main focus areas.",
    views: [
      {
        type: "current_work",
        viewId: "view_current_work_main",
        title: "Current Work",
        subtitle: "Grouped by domain",
        layout: "stack",
        data: {
          groups: [
            {
              label: "AI Visual Brain Frontend",
              items: [
                {
                  id: "task_1",
                  text: "Build read-only prototype",
                  status: "in_progress",
                  priority: "high",
                  links: [
                    { label: "Project Spec", path: "wiki/projects/ai-visual-brain-frontend-product-spec.md" },
                  ],
                  related: [
                    { label: "AI Visual Brain Frontend", path: "wiki/projects/ai-visual-brain-frontend.md", kind: "topic" },
                  ],
                },
                {
                  id: "task_2",
                  text: "Define component catalog",
                  status: "done",
                  priority: "medium",
                  links: [
                    { label: "Component Catalog", path: "wiki/projects/ai-visual-brain-frontend-component-catalog.md" },
                  ],
                },
                {
                  id: "task_3",
                  text: "Define UI schema",
                  status: "done",
                  priority: "medium",
                  links: [
                    { label: "UI Schema", path: "wiki/projects/ai-visual-brain-frontend-ui-schema.md" },
                  ],
                },
              ],
            },
            {
              label: "Nova / System",
              items: [
                {
                  id: "task_4",
                  text: "Improve weekly review synthesis",
                  status: "open",
                  priority: "high",
                  links: [
                    { label: "Open Work", path: "wiki/work/open.md" },
                  ],
                },
                {
                  id: "task_5",
                  text: "Stabilize vault consistency scripts",
                  status: "done",
                  priority: "medium",
                },
              ],
            },
            {
              label: "Tebi",
              items: [
                {
                  id: "task_6",
                  text: "Review architecture improvements",
                  status: "open",
                  priority: "medium",
                  related: [
                    { label: "Tebi", path: "wiki/knowledge/entities/tebi.md", kind: "entity" },
                  ],
                },
              ],
            },
          ],
          periodLinks: {
            week: { label: "This Week", path: "wiki/work/weeks/2026/W15.md" },
            month: { label: "This Month", path: "wiki/work/log/2026/april.md" },
          },
          highlights: ["6 active tasks", "2 high-priority items", "AI Visual Brain Frontend is the main focus"],
        },
        sources: [
          { label: "Open Work", path: "wiki/work/open.md", kind: "canonical_note", role: "current_state", relevance: "high" },
          { label: "Week 15", path: "wiki/work/weeks/2026/W15.md", kind: "canonical_note", role: "timeline" },
        ],
        actions: [
          { id: "action_open_work", type: "open_note", label: "Open Work Notes", target: { path: "wiki/work/open.md" }, safety: "safe" },
          { id: "action_open_week", type: "open_note", label: "View This Week", target: { path: "wiki/work/weeks/2026/W15.md" }, safety: "safe" },
        ],
        meta: { confidence: 0.88, freshness: "fresh", generatedAt: "2026-04-13T21:00:00Z", primarySourceCount: 4 },
      },
    ],
    sources: [
      { label: "Open Work", path: "wiki/work/open.md", kind: "canonical_note", role: "current_state", relevance: "high" },
      { label: "System Status", path: "wiki/system/status.md", kind: "canonical_note", role: "system" },
    ],
    meta: { confidence: 0.88, freshness: "fresh", generatedAt: "2026-04-13T21:00:00Z" },
  },
};

const entityOverviewResponse: ResponseEnvelope = {
  version: "v1",
  request: {
    id: "req_002",
    intent: "entity_overview",
    mode: "structured",
    query: "Tell me about Tebi",
  },
  response: {
    title: "Tebi",
    summary: "Payments and hospitality software company — a key focus area for current review and growth work.",
    views: [
      {
        type: "entity_overview",
        viewId: "view_entity_tebi",
        title: "Tebi",
        layout: "stack",
        data: {
          entityType: "company",
          summary: "Payments and hospitality software company. Connected to current review, growth work, and architecture improvements.",
          whyNow: "Multiple active work surfaces reference Tebi — including review architecture and growth metrics.",
          relatedNotes: [
            { label: "Tebi", path: "wiki/knowledge/entities/tebi.md", kind: "entity" },
            { label: "Open Work", path: "wiki/work/open.md" },
            { label: "Performance Review 2026", path: "wiki/work/review/performance-2026.md" },
          ],
          relatedEntities: [
            { label: "Stijn Hanegraaf", path: "wiki/knowledge/entities/stijn-hanegraaf.md", kind: "person" },
          ],
          timeline: [
            { date: "2026-04-11", label: "Review architecture improved", path: "wiki/work/review/synthesis.md" },
            { date: "2026-04-08", label: "Growth metrics updated", path: "wiki/work/weeks/2026/W14.md" },
            { date: "2026-04-01", label: "Quarterly planning completed" },
          ],
        },
        sources: [
          { label: "Tebi", path: "wiki/knowledge/entities/tebi.md", kind: "canonical_note", role: "entity", relevance: "high" },
        ],
        meta: { confidence: 0.91, freshness: "recent", primarySourceCount: 3 },
      },
    ],
    meta: { confidence: 0.91, freshness: "recent" },
  },
};

const timelineResponse: ResponseEnvelope = {
  version: "v1",
  request: {
    id: "req_003",
    intent: "timeline_synthesis",
    mode: "mixed",
    query: "What changed this month?",
  },
  response: {
    title: "What changed this month",
    summary: "April has been focused on simplification and stabilization across systems.",
    text: "Three main themes emerged: browse layer simplification, review architecture improvements, and knowledge system cleanup.",
    views: [
      {
        type: "timeline_synthesis",
        viewId: "view_timeline_april",
        title: "April 2026",
        layout: "timeline",
        data: {
          range: { label: "April 2026", start: "2026-04-01", end: "2026-04-30" },
          themes: [
            {
              label: "Browse layer simplification",
              summary: "Human-facing maps were simplified and stabilized.",
              items: [
                { date: "2026-04-11", label: "Stabilized refresh and consistency scripts", path: "wiki/system/vault-consistency.md" },
                { date: "2026-04-09", label: "Cleaned up dashboard navigation structure" },
              ],
            },
            {
              label: "Review architecture improvements",
              summary: "Better synthesis and evidence collection for performance reviews.",
              items: [
                { date: "2026-04-11", label: "Improved weekly review synthesis pipeline", path: "wiki/work/review/synthesis.md" },
                { date: "2026-04-07", label: "Added value evidence tracking" },
              ],
            },
            {
              label: "AI Visual Brain Frontend",
              summary: "Research, specs, and architecture decisions for the new frontend.",
              items: [
                { date: "2026-04-12", label: "Defined UI schema and component catalog" },
                { date: "2026-04-10", label: "Completed product spec and research" },
                { date: "2026-04-08", label: "Started research on schema-driven UI rendering" },
              ],
            },
          ],
          proofGaps: ["Need more automated daily work ingestion evidence", "Timeline coverage is sparse before April 8"],
        },
        sources: [
          { label: "April Work Log", path: "wiki/work/log/2026/april.md", kind: "canonical_note", role: "timeline" },
          { label: "Week 14", path: "wiki/work/weeks/2026/W14.md", kind: "canonical_note", role: "timeline" },
          { label: "Week 15", path: "wiki/work/weeks/2026/W15.md", kind: "canonical_note", role: "timeline" },
        ],
        meta: { confidence: 0.82, freshness: "fresh" },
      },
    ],
    meta: { confidence: 0.82, freshness: "fresh" },
  },
};

const systemStatusResponse: ResponseEnvelope = {
  version: "v1",
  request: {
    id: "req_004",
    intent: "system_status",
    mode: "structured",
    query: "System health check",
  },
  response: {
    title: "System Status",
    summary: "Overall healthy with active maintenance in progress.",
    views: [
      {
        type: "system_status",
        viewId: "view_system_status",
        title: "System Health",
        layout: "stack",
        data: {
          overall: { label: "Healthy with active maintenance", status: "ok" },
          checks: [
            { label: "Cron board", status: "ok", detail: "Weekly maintenance and travel jobs recovered." },
            { label: "Vault consistency", status: "ok", detail: "Duplicate guards passing." },
            { label: "Daily work ingestion", status: "warn", detail: "Needs stronger automation — currently manual." },
            { label: "Security audit", status: "ok", detail: "Last run 3 days ago, no issues." },
            { label: "Git sync", status: "ok", detail: "Vault syncing normally." },
          ],
          attention: ["Daily work ingestion still needs stronger automation", "Consider scheduling security audit for next week"],
        },
        sources: [
          { label: "System Status", path: "wiki/system/status.md", kind: "canonical_note", role: "system" },
        ],
        actions: [
          { id: "action_open_status", type: "open_note", label: "Open System Status", target: { path: "wiki/system/status.md" }, safety: "safe" },
        ],
        meta: { confidence: 0.95, freshness: "fresh", generatedAt: "2026-04-13T21:00:00Z", primarySourceCount: 2 },
      },
    ],
    meta: { confidence: 0.95, freshness: "fresh" },
  },
};

const searchResultsResponse: ResponseEnvelope = {
  version: "v1",
  request: {
    id: "req_005",
    intent: "search_results",
    mode: "structured",
    query: "review prep",
  },
  response: {
    title: "Results for \"review prep\"",
    summary: "Found 4 relevant notes across work, review, and project contexts.",
    views: [
      {
        type: "search_results",
        viewId: "view_search_review",
        title: "Search Results",
        layout: "stack",
        data: {
          query: "review prep",
          results: [
            { label: "Performance Review 2026", path: "wiki/work/review/performance-2026.md", kind: "canonical_note", excerpt: "Annual performance review preparation and evidence collection." },
            { label: "Review Synthesis", path: "wiki/work/review/synthesis.md", kind: "canonical_note", excerpt: "Architecture for weekly review synthesis pipeline." },
            { label: "Tebi", path: "wiki/knowledge/entities/tebi.md", kind: "entity", excerpt: "Key company connected to review and growth work." },
            { label: "Open Work", path: "wiki/work/open.md", kind: "canonical_note", excerpt: "Current active work items including review architecture improvements." },
          ],
          suggestedViews: [
            { intent: "entity_overview", label: "View Tebi entity page" },
            { intent: "current_work", label: "View current work" },
          ],
        },
      },
    ],
    meta: { confidence: 0.75, freshness: "recent" },
  },
};

const topicOverviewResponse: ResponseEnvelope = {
  version: "v1",
  request: {
    id: "req_006",
    intent: "topic_overview",
    mode: "structured",
    query: "What is the AI Visual Brain Frontend project about?",
  },
  response: {
    title: "AI Visual Brain Frontend",
    summary: "A chat-native interface that turns a canonical markdown brain into a usable operating system for work, memory, and context.",
    views: [
      {
        type: "topic_overview",
        viewId: "view_topic_avbf",
        title: "AI Visual Brain Frontend",
        layout: "stack",
        data: {
          topicType: "project",
          currentState: "Research and specification phase — read-only prototype next",
          summary: "A private, chat-native interface that renders structured visual views over a canonical markdown brain. Not a notes app with an AI sidebar, not a graph toy — an AI-native operating layer.",
          whyNow: "The research is done. Specs and architecture are defined. Time to build the read-only prototype.",
          keyQuestions: [
            "Should the product feel like one continuous chat canvas, or chat plus a persistent app shell?",
            "How much local-first behavior is required in the first believable version?",
          ],
          nextSteps: [
            "Build read-only prototype with Next.js + json-render",
            "Validate the UI model with real vault data",
            "Define the retrieval API contract",
          ],
          relatedNotes: [
            { label: "Product Spec", path: "wiki/projects/ai-visual-brain-frontend-product-spec.md", kind: "topic" },
            { label: "Research Notes", path: "wiki/projects/ai-visual-brain-frontend-research.md", kind: "topic" },
            { label: "UI Schema", path: "wiki/projects/ai-visual-brain-frontend-ui-schema.md", kind: "topic" },
            { label: "Component Catalog", path: "wiki/projects/ai-visual-brain-frontend-component-catalog.md", kind: "topic" },
            { label: "Retrieval Contract", path: "wiki/projects/ai-visual-brain-frontend-retrieval-contract.md", kind: "topic" },
          ],
          relatedEntities: [
            { label: "Stijn Hanegraaf", path: "wiki/knowledge/entities/stijn-hanegraaf.md", kind: "person" },
            { label: "Nova", path: "wiki/knowledge/entities/nova.md", kind: "tool" },
          ],
          timeline: [
            { date: "2026-04-12", label: "Defined UI schema and component catalog" },
            { date: "2026-04-10", label: "Completed product spec" },
            { date: "2026-04-08", label: "Started research" },
          ],
        },
        sources: [
          { label: "AI Visual Brain Frontend", path: "wiki/projects/ai-visual-brain-frontend.md", kind: "canonical_note", role: "topic", relevance: "high" },
          { label: "Product Spec", path: "wiki/projects/ai-visual-brain-frontend-product-spec.md", kind: "canonical_note", role: "topic" },
        ],
        meta: { confidence: 0.93, freshness: "fresh" },
      },
    ],
    meta: { confidence: 0.93, freshness: "fresh" },
  },
};

// Map of intent -> mock response for quick lookup
const mockResponses: Record<string, ResponseEnvelope> = {
  current_work: currentWorkResponse,
  entity_overview: entityOverviewResponse,
  topic_overview: topicOverviewResponse,
  timeline_synthesis: timelineResponse,
  system_status: systemStatusResponse,
  search_results: searchResultsResponse,
};

// Intent detection is now handled by the real intent-detector module.
// This fallback is only used when USE_REAL_DATA is false.
export function detectIntentFallback(query: string): string {
  const q = query.toLowerCase();
  if (q.includes("status") || q.includes("health") || q.includes("system") || q.includes("broken") || q.includes("stale")) {
    return "system_status";
  }
  if (q.includes("changed") || q.includes("timeline") || q.includes("recently") || q.includes("this month") || q.includes("this week")) {
    return "timeline_synthesis";
  }
  if (q.includes("what matters") || q.includes("current") || q.includes("active") || q.includes("working on") || q.includes("todo") || q.includes("work")) {
    return "current_work";
  }
  if (q.includes("tebi")) {
    return "entity_overview";
  }
  if (q.includes("ai visual brain") || q.includes("frontend project") || q.includes("project about")) {
    return "topic_overview";
  }
  return "current_work"; // default
}

// Re-export the real intent detector for components that import from here
export { detectIntent } from "./intent-detector";

export function getMockResponse(viewType: string): ResponseEnvelope {
  return mockResponses[viewType] || currentWorkResponse;
}

export function getAllMockResponses(): Record<string, ResponseEnvelope> {
  return mockResponses;
}