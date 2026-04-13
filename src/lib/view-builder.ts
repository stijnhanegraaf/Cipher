// View Builder — builds typed view-models from vault data

import type {
  ViewModel,
  CurrentWorkData,
  EntityOverviewData,
  SystemStatusData,
  TimelineSynthesisData,
  TopicOverviewData,
  SearchResultsData,
  TaskItem,
  TaskGroup,
  StatusItem,
  TimelineItem,
  ThemeGroup,
  SourceRef,
  LinkRef,
  ViewType,
  Status,
  Priority,
  Intent,
} from "./view-models";
import {
  readVaultFile,
  parseCheckboxes,
  parseKeyValuePairs,
  getSection,
  searchVault,
  listVaultFiles,
} from "./vault-reader";

// ─── Helpers ──────────────────────────────────────────────────────────

let counter = 0;
function uid(prefix: string): string {
  return `${prefix}_${Date.now()}_${++counter}`;
}

function toStatus(s: string): Status {
  const lower = s.toLowerCase();
  if (lower.includes("error") || lower.includes("fail") || lower.includes("critical")) return "error";
  if (lower.includes("warn") || lower.includes("degraded") || lower.includes("needs")) return "warn";
  if (lower.includes("ok") || lower.includes("green") || lower.includes("healthy") || lower.includes("good") || lower.includes("passing") || lower.includes("active")) return "ok";
  if (lower.includes("stale") || lower.includes("old") || lower.includes("outdated")) return "stale";
  return "ok";
}

function inferTaskStatus(checked: boolean, text: string): TaskItem["status"] {
  if (checked) return "done";
  if (/\bblocked\b/i.test(text)) return "blocked";
  if (/\bin.?progress\b|\bactive\b|\bdoing\b/i.test(text)) return "in_progress";
  return "open";
}

function inferPriority(text: string): Priority | undefined {
  if (/\bhigh\b|\burgent\b|\bcritical\b/i.test(text)) return "high";
  if (/\blow\b|\bminor\b/i.test(text)) return "low";
  return undefined;
}

function extractLinksFromCheckbox(text: string): LinkRef[] {
  const links: LinkRef[] = [];
  const re = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    links.push({
      path: match[1].trim(),
      label: (match[2] || match[1]).trim(),
    });
  }
  return links;
}

function sourceRef(label: string, path: string, role?: string, relevance?: string): SourceRef {
  return {
    label,
    path,
    kind: "canonical_note" as const,
    role,
    relevance: (relevance || "high") as "high" | "medium" | "low",
  };
}

// ─── Current Work ─────────────────────────────────────────────────────

export async function buildCurrentWork(): Promise<ViewModel> {
  const openFile = await readVaultFile("wiki/work/open.md");
  const waitingFile = await readVaultFile("wiki/work/waiting-for.md");

  const groups: TaskGroup[] = [];

  if (openFile) {
    // Find the index of the "Active now" section, then collect all ### sub-sections
    const activeIdx = openFile.sections.findIndex(
      (s) => s.heading.toLowerCase() === "active now"
    );

    if (activeIdx !== -1) {
      // Collect all ### level sections after "Active now" until the next ## or #
      for (let i = activeIdx + 1; i < openFile.sections.length; i++) {
        const section = openFile.sections[i];
        // Stop at a section that is the same or higher level (## or #)
        if (section.level <= openFile.sections[activeIdx].level) break;
        // Only process ### (level 3) sub-sections
        if (section.level !== 3) continue;

        const checkboxes = parseCheckboxes(section.body);
        if (checkboxes.length === 0) continue;

        const items: TaskItem[] = checkboxes.map((cb) => ({
          id: uid("task"),
          text: cb.text.replace(/\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g, (_, p, l) => l || p),
          status: inferTaskStatus(cb.checked, cb.text),
          priority: inferPriority(cb.text),
          links: extractLinksFromCheckbox(cb.text),
        }));

        groups.push({ label: section.heading, items });
      }
    }

    // If no sub-sections were found, try parsing all checkboxes as one group
    if (groups.length === 0) {
      const allCheckboxes = parseCheckboxes(openFile.content);
      if (allCheckboxes.length > 0) {
        const items: TaskItem[] = allCheckboxes.map((cb) => ({
          id: uid("task"),
          text: cb.text.replace(/\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g, (_, p, l) => l || p),
          status: inferTaskStatus(cb.checked, cb.text),
          priority: inferPriority(cb.text),
          links: extractLinksFromCheckbox(cb.text),
        }));
        groups.push({ label: "Active Work", items });
      }
    }
  }

  // Add waiting-for items
  if (waitingFile) {
    const waitingItems = parseCheckboxes(waitingFile.content);
    if (waitingItems.length > 0) {
      groups.push({
        label: "Waiting For",
        items: waitingItems
          .filter((cb) => !cb.checked)
          .map((cb) => ({
            id: uid("task"),
            text: cb.text.replace(/\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g, (_, p, l) => l || p),
            status: "blocked" as const,
            links: extractLinksFromCheckbox(cb.text),
          })),
      });
    }
  }

  // Compute highlights
  const totalTasks = groups.reduce((sum, g) => sum + g.items.length, 0);
  const doneTasks = groups.reduce((sum, g) => sum + g.items.filter((i) => i.status === "done").length, 0);
  const highPriority = groups.reduce((sum, g) => sum + g.items.filter((i) => i.priority === "high").length, 0);
  const blockedTasks = groups.reduce((sum, g) => sum + g.items.filter((i) => i.status === "blocked").length, 0);

  const highlights: string[] = [];
  if (totalTasks > 0) highlights.push(`${totalTasks} tasks across ${groups.length} areas`);
  if (doneTasks > 0) highlights.push(`${doneTasks} completed`);
  if (highPriority > 0) highlights.push(`${highPriority} high-priority`);
  if (blockedTasks > 0) highlights.push(`${blockedTasks} blocked`);

  const data: CurrentWorkData = {
    groups,
    highlights,
  };

  return {
    type: "current_work",
    viewId: uid("view_cw"),
    title: "Current Work",
    subtitle: "From your open work items",
    layout: "stack",
    data,
    sources: [
      sourceRef("Open Work", "wiki/work/open.md", "current_state"),
      sourceRef("Waiting For", "wiki/work/waiting-for.md", "blocked_items"),
    ],
    actions: [
      { id: uid("act"), type: "open_note", label: "Open Work Notes", target: { path: "wiki/work/open.md" }, safety: "safe" },
    ],
    meta: { confidence: 0.9, freshness: "fresh", generatedAt: new Date().toISOString(), primarySourceCount: groups.length },
  };
}

// ─── Entity Overview ──────────────────────────────────────────────────

export async function buildEntityOverview(): Promise<ViewModel> {
  const file = await readVaultFile("wiki/knowledge/tebi-brain.md");

  if (!file) {
    return {
      type: "entity_overview",
      viewId: uid("view_ent"),
      title: "Entity Not Found",
      layout: "stack",
      data: { entityType: "unknown", summary: "Could not load entity data." } as EntityOverviewData,
      meta: { confidence: 0.2, freshness: "stale" },
    };
  }

  // Extract summary from the Quick Snapshot section (table-based) or first meaningful paragraph
  const quickSnapshot = getSection(file, "Quick Snapshot");
  let summary = "";
  if (quickSnapshot) {
    // Try to extract the "What" row from the table, which usually has the best one-liner summary
    for (const line of quickSnapshot.body.split("\n")) {
      const tableMatch = line.match(/^\|\s*\*{0,2}What\*{0,2}\s*\|\s*(.+?)\s*\|/i);
      if (tableMatch) {
        summary = tableMatch[1].replace(/\*\*/g, "").trim();
        break;
      }
    }
    // If no "What" row, try first non-table, non-separator, non-quote line
    if (!summary) {
      for (const line of quickSnapshot.body.split("\n")) {
        const t = line.trim();
        if (t && !t.startsWith("|") && !t.startsWith(">") && !t.startsWith("---") && t.length > 20) {
          summary = t;
          break;
        }
      }
    }
  }
  // Fallback: first meaningful line from the whole file
  if (!summary) {
    summary = file.content.split("\n").find((l) => l.trim().length > 20 && !l.trim().startsWith("#") && !l.trim().startsWith("|"))?.trim() || "";
  }

  // Extract timeline from the Timeline section
  const timelineSection = getSection(file, "Timeline");
  const timeline: TimelineItem[] = [];
  if (timelineSection) {
    for (const line of timelineSection.body.split("\n")) {
      const tableMatch = line.match(/^\|\s*(.+?)\s*\|\s*(.+?)\s*\|/);
      if (tableMatch && !tableMatch[1].includes("---") && tableMatch[1].toLowerCase() !== "date") {
        timeline.push({
          date: tableMatch[1].trim(),
          label: tableMatch[2].trim(),
        });
      }
    }
  }

  // Collect related notes from links in the file
  const relatedNotes: LinkRef[] = [];
  const linkRegex = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g;
  let linkMatch: RegExpExecArray | null;
  const seenPaths = new Set<string>();
  while ((linkMatch = linkRegex.exec(file.content)) !== null) {
    const path = linkMatch[1].trim();
    if (!seenPaths.has(path) && !path.startsWith("http")) {
      seenPaths.add(path);
      relatedNotes.push({ label: linkMatch[2]?.trim() || path, path, kind: "entity" });
    }
  }

  // Detect entity type from frontmatter
  const entityType = (file.frontmatter.area as string) || "entity";

  // Build "why now" from open work items referencing this entity
  const openFile = await readVaultFile("wiki/work/open.md");
  let whyNow = "";
  if (openFile) {
    const tebiReferences = openFile.content.toLowerCase().includes("tebi")
      ? "Multiple active work surfaces reference this entity."
      : "";
    whyNow = tebiReferences;
  }

  const data: EntityOverviewData = {
    entityType,
    summary: summary || "A key entity in your knowledge base.",
    whyNow: whyNow || undefined,
    relatedNotes: relatedNotes.slice(0, 8),
    relatedEntities: relatedNotes
      .filter((n) => n.kind === "entity" || n.path.includes("entities"))
      .slice(0, 5),
    timeline: timeline.slice(0, 10),
  };

  return {
    type: "entity_overview",
    viewId: uid("view_ent"),
    title: "Tebi",
    subtitle: "Payments and hospitality software",
    layout: "stack",
    data,
    sources: [sourceRef("Tebi Brain", "wiki/knowledge/tebi-brain.md", "entity")],
    meta: { confidence: 0.92, freshness: "recent", primarySourceCount: 2 },
  };
}

// ─── System Status ────────────────────────────────────────────────────

export async function buildSystemStatus(): Promise<ViewModel> {
  const statusFile = await readVaultFile("wiki/system/status.md");
  const loopsFile = await readVaultFile("wiki/system/open-loops.md");

  const checks: StatusItem[] = [];
  let overallStatus: Status = "ok";
  let overallLabel = "Healthy";

  if (statusFile) {
    // Parse "At a glance" section
    const glanceSection = getSection(statusFile, "At a glance");
    if (glanceSection) {
      const items = parseCheckboxes(glanceSection.body);
      if (items.length > 0) {
        for (const item of items) {
          const status: Status = item.checked ? "ok" : "warn";
          checks.push({
            label: item.text.replace(/\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g, (_, p, l) => l || p),
            status,
            detail: item.checked ? "Active" : "Needs attention",
          });
        }
      } else {
        // Parse as key-value pairs
        const kvs = parseKeyValuePairs(glanceSection.body);
        for (const [key, value] of Object.entries(kvs)) {
          const status = toStatus(value);
          if (status === "warn" || status === "error") overallStatus = "warn";
          checks.push({ label: key, status, detail: value });
        }
      }
    }

    // Parse "Runtime" section
    const runtimeSection = getSection(statusFile, "Runtime");
    if (runtimeSection) {
      const items = parseCheckboxes(runtimeSection.body);
      for (const item of items) {
        checks.push({
          label: item.text.replace(/\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g, (_, p, l) => l || p),
          status: item.checked ? "ok" : "stale",
        });
      }
    }

    // Parse "Cron state" section
    const cronSection = getSection(statusFile, "Cron state");
    if (cronSection) {
      const kvs = parseKeyValuePairs(cronSection.body);
      for (const [key, value] of Object.entries(kvs)) {
        const status = toStatus(value);
        checks.push({ label: key, status, detail: value });
      }
      const items = parseCheckboxes(cronSection.body);
      for (const item of items) {
        checks.push({
          label: item.text.replace(/\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g, (_, p, l) => l || p),
          status: item.checked ? "ok" : "warn",
        });
      }
    }

    // Check if any status is not ok
    if (checks.some((c) => c.status === "error")) {
      overallStatus = "error";
      overallLabel = "Issues detected";
    } else if (checks.some((c) => c.status === "warn")) {
      overallStatus = "warn";
      overallLabel = "Healthy with active maintenance";
    }
  }

  // Add attention items from open loops
  const attention: string[] = [];
  if (loopsFile) {
    const checkboxes = parseCheckboxes(loopsFile.content);
    for (const cb of checkboxes) {
      if (!cb.checked) {
        attention.push(cb.text.replace(/\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g, (_, p, l) => l || p));
      }
    }
    // Also add text lines from sections as attention items
    for (const section of loopsFile.sections) {
      const lines = section.body
        .split("\n")
        .map((l) => l.replace(/^[-*]\s*/, "").trim())
        .filter((l) => l.length > 10 && !l.startsWith("#"));
      attention.push(...lines.slice(0, 3));
    }
  }

  const data: SystemStatusData = {
    overall: { label: overallLabel, status: overallStatus },
    checks,
    attention: attention.length > 0 ? attention.slice(0, 5) : undefined,
  };

  return {
    type: "system_status",
    viewId: uid("view_sys"),
    title: "System Health",
    layout: "stack",
    data,
    sources: [
      sourceRef("System Status", "wiki/system/status.md", "system"),
      sourceRef("Open Loops", "wiki/system/open-loops.md", "system"),
    ],
    actions: [
      { id: uid("act"), type: "open_note", label: "Open System Status", target: { path: "wiki/system/status.md" }, safety: "safe" },
    ],
    meta: { confidence: 0.95, freshness: "fresh", generatedAt: new Date().toISOString(), primarySourceCount: 2 },
  };
}

// ─── Timeline Synthesis ───────────────────────────────────────────────

export async function buildTimelineSynthesis(): Promise<ViewModel> {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.toLocaleString("en", { month: "long" });
  const monthNames = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  const currentMonthName = monthNames[now.getMonth()];

  // Try to read the current month's work log
  const logPath = `wiki/work/log/${currentYear}/${currentMonthName}.md`;
  const logFile = await readVaultFile(logPath);

  const themes: ThemeGroup[] = [];
  const dateEntries: { date: string; label: string; summary: string }[] = [];

  if (logFile) {
    // The vault reader parses ### headings as sections
    // Each day entry like "Thursday, Apr 2, 2026" is a section
    for (const section of logFile.sections) {
      // Match sections that look like date headings
      const dateMatch = section.heading.match(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(\w+)\s+(\d+),?\s*(\d{4})?/i);
      if (dateMatch) {
        const monthStr = dateMatch[2];
        const day = dateMatch[3].padStart(2, "0");
        const year = dateMatch[4] || String(currentYear);
        const monthIdx = monthNames.indexOf(monthStr.toLowerCase());
        const monthNum = monthIdx >= 0 ? String(monthIdx + 1).padStart(2, "0") : String(now.getMonth() + 1).padStart(2, "0");
        const date = `${year}-${monthNum}-${day}`;

        dateEntries.push({
          date,
          label: section.heading,
          summary: section.body.slice(0, 300).trim(),
        });
      }
    }

    // Group entries into themes by keyword detection
    const topicMap = new Map<string, TimelineItem[]>();

    for (const entry of dateEntries) {
      const content = entry.summary.toLowerCase();

      let theme = "General";
      if (content.includes("backoffice") || content.includes("home") || content.includes("reservation")) theme = "Product & Backoffice";
      else if (content.includes("nova") || content.includes("agent") || content.includes("vault") || content.includes("obsidian") || content.includes("system")) theme = "Nova & System";
      else if (content.includes("review") || content.includes("performance")) theme = "Review & Growth";
      else if (content.includes("frontend") || content.includes("brain") || content.includes("schema") || content.includes("visual")) theme = "AI Visual Brain";
      else if (content.includes("floorplan") || content.includes("table") || content.includes("seat")) theme = "Floorplan";
      else if (content.includes("tebi") || content.includes("pos")) theme = "Tebi";

      if (!topicMap.has(theme)) topicMap.set(theme, []);
      topicMap.get(theme)!.push({
        date: entry.date,
        label: entry.label,
        summary: entry.summary.slice(0, 120) || undefined,
      });
    }

    for (const [label, items] of topicMap) {
      themes.push({
        label,
        summary: items.length > 1 ? `${items.length} events` : items[0]?.summary?.slice(0, 100) || "Activity recorded",
        items,
      });
    }
  }

  // Fallback if no themes found
  if (themes.length === 0) {
    themes.push({
      label: "No timeline data",
      summary: "No work log entries found for this period.",
      items: [],
    });
  }

  const data: TimelineSynthesisData = {
    range: {
      label: `${currentMonth} ${currentYear}`,
      start: `${currentYear}-${String(now.getMonth() + 1).padStart(2, "0")}-01`,
      end: `${currentYear}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
    },
    themes,
  };

  return {
    type: "timeline_synthesis",
    viewId: uid("view_tl"),
    title: `${currentMonth} ${currentYear}`,
    layout: "timeline",
    data,
    sources: [sourceRef(`${currentMonth} Work Log`, logPath, "timeline")],
    meta: { confidence: 0.8, freshness: "recent", primarySourceCount: 1 },
  };
}

// ─── Topic Overview ──────────────────────────────────────────────────

export async function buildTopicOverview(query?: string): Promise<ViewModel> {
  const q = (query || "").toLowerCase();

  let projectDir = "";
  let topicTitle = "";
  let summary = "";

  if (q.includes("ai visual brain") || q.includes("brain frontend") || q.includes("frontend project")) {
    projectDir = "wiki/projects";
    topicTitle = "AI Visual Brain Frontend";
    summary = "A private, chat-native interface that renders structured visual views over a canonical markdown brain.";
  } else if (q.includes("tebi") || q.includes("pos")) {
    projectDir = "wiki/knowledge/research/projects/tebi-pos";
    topicTitle = "Tebi POS Research";
    summary = "Deep research on Tebi — competitive position, market analysis, and outlook.";
  } else {
    projectDir = "wiki/projects";
    topicTitle = "Project Overview";
    summary = "Project details from the vault.";
  }

  const keyQuestions: string[] = [];
  const nextSteps: string[] = [];
  const relatedNotes: LinkRef[] = [];
  const timeline: TimelineItem[] = [];

  if (projectDir === "wiki/knowledge/research/projects/tebi-pos") {
    const execSummary = await readVaultFile("wiki/knowledge/research/projects/tebi-pos/executive-summary.md");
    const openQuestions = await readVaultFile("wiki/knowledge/research/projects/tebi-pos/open-questions.md");

    if (execSummary) {
      const keySection = getSection(execSummary, "Key Findings") || getSection(execSummary, "Critical Tension");
      if (keySection) {
        const cbItems = parseCheckboxes(keySection.body);
        for (const cb of cbItems) {
          if (!cb.checked) keyQuestions.push(cb.text);
        }
        // Also extract bullet points
        for (const line of keySection.body.split("\n")) {
          if (line.trim().startsWith("- **") || line.trim().startsWith("- ")) {
            const text = line.trim().replace(/^-\s*/, "");
            if (text.length > 20 && !cbItems.some((cb) => cb.text === text.replace(/\*\*/g, ""))) {
              keyQuestions.push(text.replace(/\*\*/g, "").trim());
            }
          }
        }
      }
    }

    if (openQuestions) {
      const cbItems = parseCheckboxes(openQuestions.content);
      for (const cb of cbItems) {
        if (!cb.checked) keyQuestions.push(cb.text);
      }
    }

    relatedNotes.push(
      { label: "Executive Summary", path: "wiki/knowledge/research/projects/tebi-pos/executive-summary.md", kind: "research" },
      { label: "Deep Dive", path: "wiki/knowledge/research/projects/tebi-pos/deep-dive.md", kind: "research" },
      { label: "Key Players", path: "wiki/knowledge/research/projects/tebi-pos/key-players.md", kind: "research" },
      { label: "Tebi Brain", path: "wiki/knowledge/tebi-brain.md", kind: "entity" },
    );
  } else {
    const projectFiles = await listVaultFiles("wiki/projects");
    for (const pf of projectFiles) {
      const file = await readVaultFile(pf);
      if (file) {
        const fileName = pf.split("/").pop()?.replace(".md", "") || pf;
        relatedNotes.push({ label: fileName.replace(/-/g, " "), path: pf, kind: "topic" });
      }
    }
  }

  const data: TopicOverviewData = {
    topicType: "project",
    currentState: "Research and specification phase",
    summary,
    keyQuestions: keyQuestions.length > 0 ? keyQuestions.slice(0, 5) : undefined,
    nextSteps: nextSteps.length > 0 ? nextSteps.slice(0, 5) : undefined,
    relatedNotes,
    timeline,
  };

  return {
    type: "topic_overview",
    viewId: uid("view_topic"),
    title: topicTitle,
    layout: "stack",
    data,
    sources: projectDir === "wiki/knowledge/research/projects/tebi-pos"
      ? [sourceRef("Tebi POS Research", "wiki/knowledge/research/projects/tebi-pos/executive-summary.md", "research")]
      : [sourceRef("Projects", "wiki/projects/", "topic")],
    meta: { confidence: 0.88, freshness: "recent", primarySourceCount: relatedNotes.length },
  };
}

// ─── Search Results ───────────────────────────────────────────────────

export async function buildSearchResults(query: string): Promise<ViewModel> {
  const results = await searchVault(query, 10);

  const data: SearchResultsData = {
    query,
    results: results.map((r) => ({
      label: r.path.split("/").pop()?.replace(".md", "").replace(/-/g, " ") || r.path,
      path: r.path,
      excerpt: r.excerpt,
      kind: r.kind,
    })),
    suggestedViews: inferSuggestedViews(query),
  };

  return {
    type: "search_results",
    viewId: uid("view_search"),
    title: `Results for "${query}"`,
    layout: "stack",
    data,
    meta: { confidence: Math.min(0.5 + results.length * 0.05, 0.9), freshness: "fresh" },
  };
}

function inferSuggestedViews(query: string): { intent: Intent; label: string }[] {
  const suggestions: { intent: Intent; label: string }[] = [];
  const q = query.toLowerCase();

  if (q.includes("work") || q.includes("task")) suggestions.push({ intent: "current_work", label: "View current work" });
  if (q.includes("tebi") || q.includes("company")) suggestions.push({ intent: "entity_overview", label: "View Tebi entity" });
  if (q.includes("system") || q.includes("health")) suggestions.push({ intent: "system_status", label: "View system status" });
  if (suggestions.length === 0) {
    suggestions.push({ intent: "current_work", label: "View current work" });
  }

  return suggestions;
}

// ─── Build by view type ──────────────────────────────────────────────

export async function buildView(
  viewType: ViewType,
  query?: string
): Promise<ViewModel> {
  switch (viewType) {
    case "current_work":
      return buildCurrentWork();
    case "entity_overview":
      return buildEntityOverview();
    case "system_status":
      return buildSystemStatus();
    case "timeline_synthesis":
      return buildTimelineSynthesis();
    case "topic_overview":
      return buildTopicOverview(query);
    case "search_results":
      return buildSearchResults(query || "");
  }
}