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

// ─── Natural language todo toggle detection ────────────────────────────

export interface ToggleIntent {
  taskName: string;  // The extracted task name
  checked: boolean;  // true = mark done, false = mark undone
}

const DONE_PATTERNS = [
  /^mark\s+(.+?)\s+as\s+(?:done|complete|finished)$/i,
  /^mark\s+(.+?)\s+done$/i,
  /^i\s+(?:finished|completed|done with)\s+(.+)$/i,
  /^(.+?)\s+is\s+done$/i,
  /^check\s+off\s+(.+)$/i,
  /^complete\s+(.+)$/i,
  /^toggle\s+(.+)$/i,
  /^i\s+did\s+(.+)$/i,
  /^finished\s+(.+)$/i,
  /^done\s+with\s+(.+)$/i,
];

const UNDONE_PATTERNS = [
  /^mark\s+(.+?)\s+as\s+(?:not done|incomplete|open|undone)$/i,
  /^uncheck\s+(.+)$/i,
  /^mark\s+(.+?)\s+(?:not done|incomplete|open)$/i,
  /^reopen\s+(.+)$/i,
];

export function detectToggleIntent(query: string): ToggleIntent | null {
  const trimmed = query.trim();

  for (const pattern of DONE_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      return { taskName: match[1].trim(), checked: true };
    }
  }

  for (const pattern of UNDONE_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      return { taskName: match[1].trim(), checked: false };
    }
  }

  return null;
}

// ─── Fuzzy matching with Levenshtein distance ────────────────────────

function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[b.length][a.length];
}

function levenshteinRatio(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

interface FuzzyResult {
  match: string;
  score: number;
}

function fuzzyMatch(query: string, candidates: string[]): FuzzyResult | null {
  const q = query.toLowerCase().trim();

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

  // Token overlap with substring matching
  const queryTokens = q.split(/\s+/);
  let bestScore = 0;
  let bestMatch: string | null = null;
  for (const candidate of candidates) {
    const candidateTokens = candidate.toLowerCase().split(/[-_\s]+/);
    const overlap = queryTokens.filter((qt) =>
      candidateTokens.some((ct) => ct.includes(qt) || qt.includes(ct))
    );
    const score = overlap.length / Math.max(queryTokens.length, candidateTokens.length);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = candidate;
    }
  }
  if (bestMatch && bestScore >= 0.3) {
    return { match: bestMatch, score: bestScore };
  }

  // Levenshtein fallback — find closest candidate by edit distance
  // Only for short queries (likely entity/project names)
  if (q.length >= 3 && q.length <= 30) {
    let bestLev = 0;
    let bestLevMatch: string | null = null;
    for (const candidate of candidates) {
      const candNorm = candidate.toLowerCase().replace(/[-_]/g, " ");
      // Try full candidate and individual tokens
      const tokens = [candNorm, ...candNorm.split(/\s+/)];
      for (const token of tokens) {
        if (Math.abs(token.length - q.length) > Math.max(q.length, 2)) continue;
        const ratio = levenshteinRatio(q, token);
        if (ratio > bestLev) {
          bestLev = ratio;
          bestLevMatch = candidate;
        }
      }
    }
    if (bestLevMatch && bestLev >= 0.6) {
      return { match: bestLevMatch, score: bestLev * 0.9 }; // slight penalty vs exact
    }
  }

  return null;
}

// ─── Conversational pattern detection ────────────────────────────────

interface PatternMatch {
  intent: Intent;
  viewType: ViewType;
  files: string[];
  confidence: number;
}

const CONVERSATIONAL_PATTERNS: { patterns: RegExp[]; match: PatternMatch }[] = [
  // Current work / attention queries
  {
    patterns: [
      /what am i working on/i,
      /what('?s| is) on my plate/i,
      /what needs my attention/i,
      /anything blocked/i,
      /what('?s| is) blocking/i,
      /show me my (?:open )?tasks/i,
      /my todos/i,
      /what should i (?:focus|do|work) on/i,
      /current priorities/i,
      /what('?s| is) active/i,
      /waiting for/i,
      /what am i waiting for/i,
      /anything waiting/i,
      /what('?s| is) pending/i,
      /mark done/i,
      /show details for (?:current )?work/i,
      /show details for (?:my )?(?:tasks|todos|priorities)/i,
    ],
    match: {
      intent: "current_work",
      viewType: "current_work",
      files: ["wiki/work/open.md", "wiki/work/waiting-for.md"],
      confidence: 0.92,
    },
  },
  // Open loops / system attention
  {
    patterns: [
      /show me my open loops/i,
      /my open loops/i,
      /open loops/i,
      /unresolved (?:issues|items|threads)/i,
      /anything (?:stale|outstanding)/i,
    ],
    match: {
      intent: "system_status",
      viewType: "system_status",
      files: ["wiki/system/status.md", "wiki/system/open-loops.md"],
      confidence: 0.90,
    },
  },
  // Timeline / history queries
  {
    patterns: [
      /what did i do (?:last|this|past) week/i,
      /what happened (?:last|this|past) week/i,
      /what (?:have i|did i) been (?:doing|working on)/i,
      /recent activity/i,
      /what changed recently/i,
      /my week(?:ly)? (?:summary|review)/i,
      /what did i do (?:last|this|past) month/i,
    ],
    match: {
      intent: "timeline_synthesis",
      viewType: "timeline_synthesis",
      files: [],
      confidence: 0.90,
    },
  },
  // Browse entities
  {
    patterns: [
      /(?:show|list|browse|view) (?:me )?(?:my |all )?entities/i,
      /what entities (?:do i|are)/i,
      /entity (?:list|index|catalog)/i,
      /who(?:'s| is) in (?:my|the) vault/i,
    ],
    match: {
      intent: "browse_entities",
      viewType: "browse_entities",
      files: [],
      confidence: 0.92,
    },
  },
  // Browse projects
  {
    patterns: [
      /(?:show|list|browse|view) (?:me )?(?:my |all )?projects/i,
      /what projects (?:do i|are)/i,
      /project (?:list|index|catalog)/i,
      /(?:my |all )?projects/i,
    ],
    match: {
      intent: "browse_projects",
      viewType: "browse_projects",
      files: [],
      confidence: 0.92,
    },
  },
  // Browse research
  {
    patterns: [
      /(?:show|list|browse|view) (?:me )?(?:my |all )?research/i,
      /what research (?:do i|have|is)/i,
      /research (?:list|index|catalog)/i,
      /(?:my |all )?research projects/i,
    ],
    match: {
      intent: "browse_research",
      viewType: "browse_research",
      files: [],
      confidence: 0.92,
    },
  },
  // System status
  {
    patterns: [
      /how(?:'s| is) (?:the |my )?(?:system|vault|setup)/i,
      /is everything (?:ok|healthy|working)/i,
      /system (?:check|health|status)/i,
      /open loops/i,
      /open loops and issues/i,
    ],
    match: {
      intent: "system_status",
      viewType: "system_status",
      files: ["wiki/system/status.md", "wiki/system/open-loops.md"],
      confidence: 0.92,
    },
  },
];

// ─── Entity type aliases ─────────────────────────────────────────────

const ENTITY_TYPE_ALIASES: Record<string, string> = {
  "tebi": "tebi",
  "ns": "ns",
  "stijn": "stijn-hanegraaf",
  "nova": "nova",
  "obsidian": "obsidian",
  "anthropic": "anthropic",
  "openai": "openai",
  "openclaw": "openclaw",
};

// ─── Keyword sets per intent (fallback) ──────────────────────────────

const INTENT_KEYWORDS: Record<string, { keywords: string[]; files: string[] }> = {
  current_work: {
    keywords: [
      "work", "todo", "todos", "task", "tasks", "active", "current",
      "what matters", "open work", "doing", "working on", "priorities",
      "now", "today", "focus", "dashboard", "attention", "blocked",
      "waiting", "pending",
    ],
    files: [
      "wiki/work/open.md",
      "wiki/work/waiting-for.md",
    ],
  },
  entity_overview: {
    keywords: [
      "entity", "organization", "startup", "company",
      "about", "tell me about", "who is", "what is",
    ],
    files: [],
  },
  system_status: {
    keywords: [
      "system", "health", "status", "broken", "stale", "check",
      "systems", "cron", "agent", "agents", "runtime", "ops",
      "open loops", "open-loops",
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
      "april", "march", "2026", "last week", "past week",
    ],
    files: [],
  },
  topic_overview: {
    keywords: [
      "project", "topic", "research", "overview", "about the",
      "what is the", "brain frontend", "frontend project",
      "ai visual", "visual brain",
    ],
    files: [],
  },
  browse_entities: {
    keywords: ["entities", "who"],
    files: [],
  },
  browse_projects: {
    keywords: ["projects"],
    files: [],
  },
  browse_research: {
    keywords: ["research list", "all research"],
    files: [],
  },
  search_results: {
    keywords: [
      "search", "find", "lookup", "where is", "look up",
      "anything about",
    ],
    files: [],
  },
};

// ─── Extract name from index entry ───────────────────────────────────

function nameFromPath(entry: IndexEntry | ResearchProject): string {
  if ("dir" in entry) return entry.name; // ResearchProject
  return entry.name; // IndexEntry
}

// ─── Keyword-only fallback (no vault indexes) ────────────────────────

function detectIntentByKeywords(query: string): IntentResult {
  const q = query.toLowerCase().trim();

  // Check context-rich follow-up queries (from quick reply pills)
  const followUpMatch = q.match(/(?:tell me more about|show (?:me )?(?:more )?(?:details|related) (?:to |for |about )?|find more about|go deeper (?:into |on |about )?|more (?:about|details|on))\s+(.+)/i);
  if (followUpMatch) {
    const subject = followUpMatch[1].trim();
    // Check entity aliases
    for (const [alias, entityName] of Object.entries(ENTITY_TYPE_ALIASES)) {
      if (subject === alias || subject.includes(alias)) {
        return {
          intent: "entity_overview",
          viewType: "entity_overview",
          query,
          confidence: 0.9,
          files: [`wiki/knowledge/entities/${entityName}.md`],
          entityName,
        };
      }
    }
    // Check keywords in subject
    if (subject.includes("tebi")) {
      return {
        intent: "entity_overview",
        viewType: "entity_overview",
        query,
        confidence: 0.9,
        files: ["wiki/knowledge/tebi-brain.md", "wiki/knowledge/entities/tebi.md"],
        entityName: "tebi",
      };
    }
    // Fallback to search
    return {
      intent: "search_results",
      viewType: "search_results",
      query,
      confidence: 0.7,
      files: [],
      searchTerm: subject,
    };
  }

  // Check conversational patterns first
  for (const group of CONVERSATIONAL_PATTERNS) {
    for (const pattern of group.patterns) {
      if (pattern.test(q)) {
        return {
          intent: group.match.intent,
          viewType: group.match.viewType,
          query,
          confidence: group.match.confidence,
          files: group.match.files,
          ...(group.match.viewType === "search_results" ? { searchTerm: query } : {}),
        };
      }
    }
  }

  // Score each intent by keyword overlap
  const scores: { intent: string; score: number }[] = [];

  for (const [intent, config] of Object.entries(INTENT_KEYWORDS)) {
    let score = 0;
    for (const kw of config.keywords) {
      if (q.includes(kw)) {
        score += kw.length;
      }
    }
    if (score > 0) {
      scores.push({ intent, score });
    }
  }

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
      files: ["wiki/knowledge/tebi-brain.md", "wiki/knowledge/entities/tebi.md"],
      entityName: "tebi",
    };
  }

  if (scores.length > 0 && scores[0].score > 0) {
    const best = scores[0];
    const confidence = Math.min(0.6 + best.score * 0.02, 0.95);

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

  return {
    intent: "search_results",
    viewType: "search_results",
    query,
    confidence: 0.5,
    files: [],
    searchTerm: query,
  };
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
    // Dynamic import — only resolves server-side
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const vrMod: typeof import("./vault-reader") = await import(/* webpackIgnore: true */ `./vault-reader`);
    [entityFiles, projectFiles, researchDirs] = await Promise.all([
      vrMod.getEntityIndex(),
      vrMod.getProjectIndex(),
      vrMod.getResearchProjects(),
    ]);
    hasVaultIndex = true;
  } catch {
    // Running on client or vault-reader unavailable
  }

  // If no vault index, use keyword-only detection
  if (!hasVaultIndex) {
    return detectIntentByKeywords(query);
  }

  // ─── Vault-aware detection ──────────────────────────────────────────

  const entityNames = entityFiles.map(nameFromPath).filter((n) => n && n !== "entities");
  const projectNames = projectFiles.map(nameFromPath).filter((n) => n && n !== "projects" && n !== "ideas");
  const researchNames = researchDirs.map(nameFromPath);

  // ─── 0.5. Context-rich follow-up queries (from quick replies) ──────
  // These come from pills like "Tell me more about X" and need to resolve X
  const followUpMatch = q.match(/(?:tell me more about|show (?:me )?(?:more )?(?:details|related) (?:to |for |about )?|find more about|go deeper (?:into |on |about )?|more (?:about|details|on))\s+(.+)/i);
  if (followUpMatch) {
    const subject = followUpMatch[1].trim();
    // Try to match subject against known entities, projects, research
    const entityMatch2 = fuzzyMatch(subject, entityNames);
    const projectMatch2 = fuzzyMatch(subject, projectNames);
    const researchMatch2 = fuzzyMatch(subject, researchNames);

    const bestMatch = [
      entityMatch2 ? { type: 'entity' as const, match: entityMatch2 } : null,
      projectMatch2 ? { type: 'project' as const, match: projectMatch2 } : null,
      researchMatch2 ? { type: 'research' as const, match: researchMatch2 } : null,
    ].filter(Boolean).sort((a, b) => (b?.match.score || 0) - (a?.match.score || 0))[0];

    if (bestMatch && bestMatch.match.score >= 0.4) {
      if (bestMatch.type === 'entity') {
        const matchingFile = entityFiles.find((f) => nameFromPath(f) === bestMatch.match.match);
        return {
          intent: "entity_overview",
          viewType: "entity_overview",
          query,
          confidence: Math.min(bestMatch.match.score + 0.1, 0.95),
          files: matchingFile ? [matchingFile.path] : [`wiki/knowledge/entities/${bestMatch.match.match}.md`],
          entityName: bestMatch.match.match,
        };
      } else if (bestMatch.type === 'research') {
        const matchingDir = researchDirs.find((d) => nameFromPath(d) === bestMatch.match.match);
        return {
          intent: "topic_overview",
          viewType: "topic_overview",
          query,
          confidence: Math.min(bestMatch.match.score + 0.15, 0.93),
          files: matchingDir
            ? [`${matchingDir.dir}/executive-summary.md`, `${matchingDir.dir}/deep-dive.md`]
            : [`wiki/knowledge/research/projects/${bestMatch.match.match}/executive-summary.md`],
          topicQuery: bestMatch.match.match,
        };
      } else {
        const matchingFile = projectFiles.find((f) => nameFromPath(f) === bestMatch.match.match);
        return {
          intent: "topic_overview",
          viewType: "topic_overview",
          query,
          confidence: Math.min(bestMatch.match.score + 0.1, 0.93),
          files: matchingFile ? [matchingFile.path] : [`wiki/projects/${bestMatch.match.match}.md`],
          topicQuery: bestMatch.match.match,
        };
      }
    }

    // If no vault match, try search
    return {
      intent: "search_results",
      viewType: "search_results",
      query,
      confidence: 0.7,
      files: [],
      searchTerm: subject,
    };
  }

  // ─── 0. Check conversational patterns first (highest priority) ──────
  for (const group of CONVERSATIONAL_PATTERNS) {
    for (const pattern of group.patterns) {
      if (pattern.test(q)) {
        const result: IntentResult = {
          intent: group.match.intent,
          viewType: group.match.viewType,
          query,
          confidence: group.match.confidence,
          files: group.match.files,
        };

        // Resolve timeline files dynamically
        if (group.match.viewType === "timeline_synthesis") {
          const now = new Date();
          const monthNames = [
            "january", "february", "march", "april", "may", "june",
            "july", "august", "september", "october", "november", "december",
          ];
          result.files = [`wiki/work/log/${now.getFullYear()}/${monthNames[now.getMonth()]}.md`];
          // If "last week/month", also include previous period
          if (q.includes("last") || q.includes("past")) {
            const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            result.files.push(`wiki/work/log/${prev.getFullYear()}/${monthNames[prev.getMonth()]}.md`);
          }
        }

        return result;
      }
    }
  }

  // ─── 1. Check entity-type aliases ──────────────────────────────────
  for (const [alias, entityName] of Object.entries(ENTITY_TYPE_ALIASES)) {
    if (q === alias || q.startsWith(alias + " ") || q.endsWith(" " + alias)) {
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

  // ─── 2. Match entity names (with Levenshtein) ──────────────────────
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

    // Special: tebi entity
    if (entityMatch.match === "tebi") {
      return {
        intent: "entity_overview",
        viewType: "entity_overview",
        query,
        confidence: 0.95,
        files: ["wiki/knowledge/tebi-brain.md", "wiki/knowledge/entities/tebi.md"],
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

  // ─── 3. Match research project names (with Levenshtein) ───────────
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

  // ─── 4. Match project names ───────────────────────────────────────
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
  for (const m of monthNames) {
    if (q.includes(m)) timeScore += m.length;
  }
  if (/\b20\d{2}\b/.test(q)) timeScore += 4;

  if (timeScore > 0) {
    const now = new Date();
    const currentYear = now.getFullYear();
    let targetMonth = monthNames[now.getMonth()];
    let targetYear = currentYear;

    for (let i = 0; i < 12; i++) {
      if (q.includes(monthNames[i])) {
        targetMonth = monthNames[i];
        targetYear = currentYear;
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