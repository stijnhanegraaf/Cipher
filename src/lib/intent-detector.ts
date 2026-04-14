// Intent Detector — maps natural language queries to view types and vault files
// Uses vault indexes when available (server-side) and falls back to keyword matching (client-side)
// IMPORTANT: This module must NOT statically import vault-reader (which uses Node.js fs).
// The vault-reader is loaded dynamically only when running server-side.

import type { Intent, ViewType, IndexEntry, ResearchProject } from "./view-models";

export interface IntentResult {
  intent: Intent;
  viewType: ViewType;
  query: string;
  confidence: number;
  files: string[];       // vault files to read
  searchTerm?: string;   // for search_results
  entityName?: string;   // resolved entity name for entity_overview
  topicQuery?: string;   // resolved topic/project name for topic_overview
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

// ─── Entity type aliases ─────────────────────────────────────────────

const ENTITY_TYPE_ALIASES: Record<string, string> = {
  "tebi": "tebi",
  "ns": "ns",
  "stijn": "stijn-hanegraaf",
};

// ─── Fuzzy matching ──────────────────────────────────────────────────

interface FuzzyResult {
  match: string;
  score: number;
}

function fuzzyMatch(query: string, candidates: string[]): FuzzyResult | null {
  const q = query.toLowerCase();

  // Exact match
  const exact = candidates.find((c) => c.toLowerCase() === q);
  if (exact) return { match: exact, score: 1.0 };

  // Starts with
  const startsWith = candidates.find((c) => c.toLowerCase().startsWith(q));
  if (startsWith) return { match: startsWith, score: 0.85 };

  // Contains
  const contains = candidates.find((c) => c.toLowerCase().includes(q));
  if (contains) return { match: contains, score: 0.7 };

  // Query contained in candidate
  const queryContains = candidates.find((c) => q.includes(c.toLowerCase()));
  if (queryContains) return { match: queryContains, score: 0.6 };

  // Token overlap
  const queryTokens = q.split(/\s+/);
  let bestScore = 0;
  let bestMatch: string | null = null;
  for (const candidate of candidates) {
    const candidateTokens = candidate.toLowerCase().split(/[-_\s]+/);
    const overlap = queryTokens.filter((qt) => candidateTokens.some((ct) => ct.includes(qt) || qt.includes(ct)));
    const score = overlap.length / Math.max(queryTokens.length, candidateTokens.length);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  if (bestMatch && bestScore >= 0.3) {
    return { match: bestMatch, score: bestScore };
  }

  return null;
}

// ─── Keyword-only fallback (no vault indexes) ────────────────────────

function detectIntentByKeywords(query: string): IntentResult {
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
      entityName: "tebi",
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

// ─── Extract name from index entry ───────────────────────────────────

function nameFromPath(entry: IndexEntry | ResearchProject): string {
  if ("dir" in entry) return entry.name; // ResearchProject
  return entry.name; // IndexEntry
}

// ─── Main detect function ──────────────────────────────────────────────

export async function detectIntent(query: string): Promise<IntentResult> {
  const q = query.toLowerCase().trim();

  // Try to load vault indexes for smarter entity/project matching (server-side only)
  let entityFiles: IndexEntry[] = [];
  let projectFiles: IndexEntry[] = [];
  let researchDirs: ResearchProject[] = [];
  let hasVaultIndex = false;

  try {
    // Dynamic import — only resolves server-side; client gets caught by catch
    // Using a template literal prevents Turbopack from statically tracing this import
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const vrMod: typeof import("./vault-reader") = await import(/* webpackIgnore: true */ `./vault-reader`);
    [entityFiles, projectFiles, researchDirs] = await Promise.all([
      vrMod.getEntityIndex(),
      vrMod.getProjectIndex(),
      vrMod.getResearchProjects(),
    ]);
    hasVaultIndex = true;
  } catch {
    // Running on client or vault-reader unavailable — fall back to keyword-only matching
  }

  // If no vault index available, use keyword-only detection
  if (!hasVaultIndex) {
    return detectIntentByKeywords(query);
  }

  // ─── Vault-aware detection ──────────────────────────────────────────

  // Extract display names from index entries
  const entityNames = entityFiles.map(nameFromPath).filter((n) => n && n !== "entities");
  const projectNames = projectFiles.map(nameFromPath).filter((n) => n && n !== "projects" && n !== "ideas");
  const researchNames = researchDirs.map(nameFromPath);

  // ─── 1. Check entity-type aliases ──────────────────────────────────
  for (const [alias, entityName] of Object.entries(ENTITY_TYPE_ALIASES)) {
    if (q.includes(alias)) {
      const matchingFile = entityFiles.find((f) => nameFromPath(f) === entityName);
      return {
        intent: "entity_overview",
        viewType: "entity_overview",
        query,
        confidence: 0.9,
        files: matchingFile ? [matchingFile.path] : [`wiki/knowledge/entities/${entityName}.md`],
        entityName,
      };
    }
  }

  // ─── 2. Match entity names ─────────────────────────────────────────
  const entityMatch = fuzzyMatch(q, entityNames);
  if (entityMatch && entityMatch.score >= 0.5) {
    const matchingFile = entityFiles.find((f) => nameFromPath(f) === entityMatch.match);

    // Compound: entity + research/project keyword → topic_overview
    if (q.includes("research") || q.includes("project") || q.includes("overview") || q.includes("deep")) {
      const researchForEntity = researchDirs.find((d) => {
        const name = nameFromPath(d);
        return entityMatch.match.includes(name.replace(/-/g, " ")) ||
          name.includes(entityMatch.match.replace(/\s+/g, "-"));
      });
      if (researchForEntity) {
        return {
          intent: "topic_overview",
          viewType: "topic_overview",
          query,
          confidence: 0.92,
          files: [
            `${researchForEntity.dir}/executive-summary.md`,
            `${researchForEntity.dir}/deep-dive.md`,
            matchingFile ? matchingFile.path : `wiki/knowledge/entities/${entityMatch.match}.md`,
          ],
          entityName: entityMatch.match,
          topicQuery: entityMatch.match,
        };
      }
    }

    // Special: tebi entity → also include tebi-brain.md
    if (entityMatch.match === "tebi") {
      return {
        intent: "entity_overview",
        viewType: "entity_overview",
        query,
        confidence: 0.95,
        files: [
          "wiki/knowledge/tebi-brain.md",
          "wiki/knowledge/entities/tebi.md",
        ],
        entityName: "tebi",
      };
    }

    return {
      intent: "entity_overview",
      viewType: "entity_overview",
      query,
      confidence: Math.min(entityMatch.score + 0.1, 0.95),
      files: matchingFile ? [matchingFile.path] : [`wiki/knowledge/entities/${entityMatch.match}.md`],
      entityName: entityMatch.match,
    };
  }

  // ─── 3. Match project names ───────────────────────────────────────
  const projectMatch = fuzzyMatch(q, projectNames);
  if (projectMatch && projectMatch.score >= 0.5) {
    const matchingFile = projectFiles.find((f) => nameFromPath(f) === projectMatch.match);
    return {
      intent: "topic_overview",
      viewType: "topic_overview",
      query,
      confidence: Math.min(projectMatch.score + 0.1, 0.93),
      files: matchingFile ? [matchingFile.path] : [`wiki/projects/${projectMatch.match}.md`],
      topicQuery: projectMatch.match,
    };
  }

  // ─── 4. Match research project names ───────────────────────────────
  const researchMatch = fuzzyMatch(q, researchNames);
  if (researchMatch && researchMatch.score >= 0.4) {
    const matchingDir = researchDirs.find((d) => nameFromPath(d) === researchMatch.match);
    return {
      intent: "topic_overview",
      viewType: "topic_overview",
      query,
      confidence: Math.min(researchMatch.score + 0.15, 0.93),
      files: matchingDir
        ? [`${matchingDir.dir}/executive-summary.md`, `${matchingDir.dir}/deep-dive.md`]
        : [`wiki/knowledge/research/projects/${researchMatch.match}/executive-summary.md`],
      topicQuery: researchMatch.match,
    };
  }

  // ─── 5. Time-relative queries → timeline ──────────────────────────
  const timeKeywords = [
    "this week", "this month", "last week", "last month",
    "recently", "what happened", "what changed", "timeline",
    "history", "chronology", "past week", "past month",
    "days ago", "weeks ago",
  ];
  const monthNames = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
  ];

  let timeScore = 0;
  for (const kw of timeKeywords) {
    if (q.includes(kw)) timeScore += kw.length;
  }
  // Check for month names
  for (const m of monthNames) {
    if (q.includes(m)) timeScore += m.length;
  }
  if (/\b20\d{2}\b/.test(q)) timeScore += 4; // year reference

  if (timeScore > 0) {
    // Determine which month/year to reference
    const now = new Date();
    const currentYear = now.getFullYear();
    let targetMonth = monthNames[now.getMonth()]; // default current
    let targetYear = currentYear;

    for (let i = 0; i < 12; i++) {
      if (q.includes(monthNames[i])) {
        targetMonth = monthNames[i];
        targetYear = currentYear; // simple: assume current year
        break;
      }
    }

    if (q.includes("last month")) {
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      targetMonth = monthNames[lastMonth.getMonth()];
      targetYear = lastMonth.getFullYear();
    }

    return {
      intent: "timeline_synthesis",
      viewType: "timeline_synthesis",
      query,
      confidence: Math.min(0.6 + timeScore * 0.01, 0.9),
      files: [`wiki/work/log/${targetYear}/${targetMonth}.md`],
    };
  }

  // ─── 6. System/status queries → system_status ─────────────────────
  const statusKeywords = INTENT_KEYWORDS.system_status.keywords;
  let statusScore = 0;
  for (const kw of statusKeywords) {
    if (q.includes(kw)) statusScore += kw.length;
  }
  if (statusScore > 0) {
    return {
      intent: "system_status",
      viewType: "system_status",
      query,
      confidence: Math.min(0.6 + statusScore * 0.01, 0.9),
      files: INTENT_KEYWORDS.system_status.files,
    };
  }

  // ─── 7. Work/task queries → current_work ───────────────────────────
  const workKeywords = INTENT_KEYWORDS.current_work.keywords;
  let workScore = 0;
  for (const kw of workKeywords) {
    if (q.includes(kw)) workScore += kw.length;
  }
  if (workScore > 0) {
    return {
      intent: "current_work",
      viewType: "current_work",
      query,
      confidence: Math.min(0.6 + workScore * 0.01, 0.9),
      files: INTENT_KEYWORDS.current_work.files,
    };
  }

  // ─── 8. Fallback → search ─────────────────────────────────────────
  return {
    intent: "search_results",
    viewType: "search_results",
    query,
    confidence: 0.5,
    files: [],
    searchTerm: query,
  };
}