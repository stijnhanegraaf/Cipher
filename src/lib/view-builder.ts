// View Builder — builds typed view-models from vault data
// Uses vault indexes and rich parsing for vault-aware, dynamic views

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
  Priority,
  Intent,
  IndexEntry,
  ResearchProject,
} from "./view-models";
import {
  readVaultFile,
  parseCheckboxes,
  parseTable,
  parseKeyValuePairs,
  getSection,
  getEntityIndex,
  getProjectIndex,
  getResearchProjects,
  searchVault,
  resolveLink,
  listVaultFiles,
  extractLinks,
  parseEntity,
  parseWorkItems,
  parseWorkLog,
  type ParsedFile,
  type TableData,
  type EntityData,
} from "./vault-reader";

// ─── Helpers ──────────────────────────────────────────────────────────

let counter = 0;
function uid(prefix: string): string {
  return `${prefix}_${Date.now()}_${++counter}`;
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

function stripLinks(text: string): string {
  return text.replace(/\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g, (_, p, l) => l || p);
}

function toStatus(s: string): "ok" | "warn" | "error" | "stale" | "fresh" {
  const lower = s.toLowerCase();
  if (lower.includes("error") || lower.includes("fail") || lower.includes("critical")) return "error";
  if (lower.includes("warn") || lower.includes("degraded") || lower.includes("needs")) return "warn";
  if (lower.includes("ok") || lower.includes("green") || lower.includes("healthy") || lower.includes("good") || lower.includes("passing") || lower.includes("active")) return "ok";
  if (lower.includes("stale") || lower.includes("old") || lower.includes("outdated")) return "stale";
  return "ok";
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

function kindFromPath(path: string): string {
  if (path.includes("/entities/") || path.includes("tebi-brain")) return "entity";
  if (path.includes("/projects/")) return "project";
  if (path.includes("/research/")) return "research";
  if (path.includes("/system/")) return "system";
  if (path.includes("/work/")) return "work";
  if (path.includes("/private/")) return "personal";
  if (path.includes("/journal/")) return "journal";
  if (path.includes("/memory/")) return "memory";
  return "note";
}

function nameFromPath(entry: string | IndexEntry | ResearchProject): string {
  if (typeof entry === "string") return entry.split("/").pop()?.replace(/\.md$/, "") || "";
  return entry.name; // IndexEntry or ResearchProject
}

function currentMonthPaths(): { current: string; previous: string; currentLabel: string; previousLabel: string } {
  const now = new Date();
  const currentYear = now.getFullYear();
  const monthNames = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
  ];
  const currentMonthName = monthNames[now.getMonth()];

  let prevYear = currentYear;
  let prevMonthIdx = now.getMonth() - 1;
  if (prevMonthIdx < 0) { prevMonthIdx = 11; prevYear--; }
  const prevMonthName = monthNames[prevMonthIdx];

  return {
    current: `wiki/work/log/${currentYear}/${currentMonthName}.md`,
    previous: `wiki/work/log/${prevYear}/${prevMonthName}.md`,
    currentLabel: `${currentMonthName.charAt(0).toUpperCase() + currentMonthName.slice(1)} ${currentYear}`,
    previousLabel: `${prevMonthName.charAt(0).toUpperCase() + prevMonthName.slice(1)} ${prevYear}`,
  };
}

// ─── Current Work ─────────────────────────────────────────────────────

export async function buildCurrentWork(): Promise<ViewModel> {
  const openFile = await readVaultFile("wiki/work/open.md");
  const waitingFile = await readVaultFile("wiki/work/waiting-for.md");

  const groups: TaskGroup[] = [];

  if (openFile) {
    // Find the "Active now" section (## heading), then collect ### sub-sections
    const activeIdx = openFile.sections.findIndex(
      (s) => s.heading.toLowerCase() === "active now"
    );

    if (activeIdx !== -1) {
      for (let i = activeIdx + 1; i < openFile.sections.length; i++) {
        const section = openFile.sections[i];
        // Stop at same or higher level (## or #)
        if (section.level <= openFile.sections[activeIdx].level) break;
        // Only process ### (level 3) sub-sections
        if (section.level !== 3) continue;

        const checkboxes = parseCheckboxes(section.body);
        if (checkboxes.length === 0) continue;

        const items: TaskItem[] = checkboxes.map((cb) => ({
          id: uid("task"),
          text: stripLinks(cb.text),
          status: inferTaskStatus(cb.checked, cb.text),
          priority: inferPriority(cb.text),
          links: extractLinksFromCheckbox(cb.text),
        }));

        groups.push({ label: section.heading, items });
      }
    }

    // Fallback: parse all checkboxes as one group
    if (groups.length === 0) {
      const allCheckboxes = parseCheckboxes(openFile.content);
      if (allCheckboxes.length > 0) {
        const items: TaskItem[] = allCheckboxes.map((cb) => ({
          id: uid("task"),
          text: stripLinks(cb.text),
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
            text: stripLinks(cb.text),
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

  // Extract "Current context" section text
  let contextText: string | undefined;
  if (openFile) {
    const contextSection = getSection(openFile, "Current context");
    if (contextSection) {
      contextText = contextSection.body
        .split("\n")
        .map((l) => l.replace(/^[-*]\s*/, "").trim())
        .filter((l) => l.length > 5)
        .join("; ");
    }
  }

  // Build period links
  const now = new Date();
  const weekNum = getWeekNumber(now);
  const monthNames = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
  ];
  const periodLinks: { week?: LinkRef; month?: LinkRef } = {};
  periodLinks.week = {
    label: `W${weekNum}`,
    path: `wiki/work/weeks/${now.getFullYear()}/W${weekNum}.md`,
  };
  periodLinks.month = {
    label: `${monthNames[now.getMonth()].charAt(0).toUpperCase() + monthNames[now.getMonth()].slice(1)} ${now.getFullYear()}`,
    path: `wiki/work/log/${now.getFullYear()}/${monthNames[now.getMonth()]}.md`,
  };

  const data: CurrentWorkData = {
    groups,
    highlights,
    periodLinks,
  };

  return {
    type: "current_work",
    viewId: uid("view_cw"),
    title: "Current Work",
    subtitle: contextText || "From your open work items",
    layout: "stack",
    data,
    sources: [
      sourceRef("Open Work", "wiki/work/open.md", "current_state"),
      sourceRef("Waiting For", "wiki/work/waiting-for.md", "blocked_items"),
    ],
    actions: [
      { id: uid("act"), type: "open_note", label: "Open Work Notes", target: { path: "wiki/work/open.md" }, safety: "safe" },
    ],
    sourceFile: "wiki/work/open.md",
    meta: { confidence: 0.9, freshness: "fresh", generatedAt: new Date().toISOString(), primarySourceCount: groups.length },
  };
}

function getWeekNumber(d: Date): number {
  const target = new Date(d.valueOf());
  const dayNum = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNum + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
  }
  return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
}

// ─── Entity Overview ──────────────────────────────────────────────────

export async function buildEntityOverview(entityName?: string): Promise<ViewModel> {
  const name = entityName || "tebi";

  // Determine files to read
  const files: string[] = [];
  let primaryFile: string;

  if (name === "tebi") {
    files.push("wiki/knowledge/tebi-brain.md");
    files.push("wiki/knowledge/entities/tebi.md");
    primaryFile = "wiki/knowledge/tebi-brain.md";
  } else {
    primaryFile = `wiki/knowledge/entities/${name}.md`;
    files.push(primaryFile);
  }

  // Read primary file
  const mainFile = await readVaultFile(files[0]);
  if (!mainFile) {
    return {
      type: "entity_overview",
      viewId: uid("view_ent"),
      title: name.charAt(0).toUpperCase() + name.slice(1).replace(/-/g, " "),
      layout: "stack",
      data: {
        entityType: "unknown",
        summary: `Could not load data for "${name}".`,
      } as EntityOverviewData,
      sourceFile: primaryFile,
      meta: { confidence: 0.2, freshness: "stale" },
    };
  }

  // Read entity file for structured data
  const entityFile = name === "tebi"
    ? await readVaultFile("wiki/knowledge/entities/tebi.md")
    : mainFile;

  // Use parseEntity for rich extraction
  let entityData: EntityData | null = null;
  if (entityFile) {
    entityData = await parseEntity(entityFile);
  }

  // Extract summary
  let summary = "";

  // Try Core framing from entity data first
  if (entityData && entityData.coreFraming) {
    summary = entityData.coreFraming.split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 10 && !l.startsWith("#"))
      .join(" ")
      .slice(0, 300);
  }

  // For tebi, also try Quick Snapshot table "What" row
  if (name === "tebi" && !summary) {
    const quickSnapshot = getSection(mainFile, "Quick Snapshot");
    if (quickSnapshot) {
      const table = parseTable(quickSnapshot.body);
      if (table.headers.length > 0) {
        for (const row of table.rows) {
          const firstCol = Object.values(row)[0] || "";
          if (firstCol.toLowerCase().includes("what")) {
            summary = Object.values(row).slice(1).join(" ").replace(/\*\*/g, "").trim();
            break;
          }
        }
      }
      // Fallback to first meaningful non-table line
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
  }

  // Fallback: first meaningful line from the whole file
  if (!summary) {
    summary = mainFile.content.split("\n")
      .find((l) => l.trim().length > 20 && !l.trim().startsWith("#") && !l.trim().startsWith("|"))
      ?.trim() || "A key entity in your knowledge base.";
  }

  // Extract related notes from entity data
  const relatedNotes: LinkRef[] = [];
  const relatedEntities: LinkRef[] = [];
  const seenPaths = new Set<string>();

  function addLink(link: { label: string; path: string }, kind: string) {
    if (!seenPaths.has(link.path)) {
      seenPaths.add(link.path);
      relatedNotes.push({ label: link.label, path: link.path, kind });
      if (link.path.includes("entities") || kind === "entity") {
        relatedEntities.push({ label: link.label, path: link.path, kind: "entity" });
      }
    }
  }

  if (entityData) {
    for (const link of entityData.seeAlso) addLink(link, "related");
    for (const link of entityData.related) addLink(link, "related");
  }

  // Also extract links from the main file
  const mainLinks = extractLinks(mainFile.content);
  for (const link of mainLinks) {
    addLink(link, name === "tebi" ? "entity" : "note");
  }

  // Extract timeline from tebi-brain if available
  const timeline: TimelineItem[] = [];
  if (name === "tebi") {
    const timelineSection = getSection(mainFile, "Timeline");
    if (timelineSection) {
      const table = parseTable(timelineSection.body);
      if (table.headers.length > 0) {
        for (const row of table.rows) {
          const cells = Object.values(row);
          if (cells.length >= 2 && !cells[0].includes("---") && cells[0].toLowerCase() !== "date") {
            timeline.push({
              date: cells[0].replace(/\*\*/g, "").trim(),
              label: cells.slice(1).join(" ").replace(/\*\*/g, "").trim(),
            });
          }
        }
      }
    }
  }

  // Build "why now" from open work
  const openFile = await readVaultFile("wiki/work/open.md");
  let whyNow: string | undefined;
  if (openFile && openFile.content.toLowerCase().includes(name)) {
    whyNow = `There are active work items referencing ${name.charAt(0).toUpperCase() + name.slice(1).replace(/-/g, " ")}.`;
  }

  const entityType = (entityData?.frontmatter?.area as string) || (mainFile.frontmatter.area as string) || "entity";

  const data: EntityOverviewData = {
    entityType,
    summary: summary.slice(0, 500),
    whyNow,
    relatedNotes: relatedNotes.slice(0, 10),
    relatedEntities: relatedEntities.slice(0, 5),
    timeline: timeline.length > 0 ? timeline.slice(0, 15) : undefined,
  };

  const displayName = name === "tebi"
    ? "Tebi"
    : name.split(/[-_]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

  return {
    type: "entity_overview",
    viewId: uid("view_ent"),
    title: displayName,
    subtitle: name === "tebi" ? "Payments and hospitality software" : undefined,
    layout: "stack",
    data,
    sources: files.map((f) => sourceRef(
      nameFromPath(f).replace(/-/g, " ") || f,
      f,
      "entity"
    )),
    actions: [
      { id: uid("act"), type: "open_note", label: "Open in Obsidian", target: { path: primaryFile }, safety: "safe" },
    ],
    sourceFile: primaryFile,
    meta: { confidence: 0.92, freshness: "recent", generatedAt: new Date().toISOString(), primarySourceCount: files.length },
  };
}

// ─── System Status ────────────────────────────────────────────────────

export async function buildSystemStatus(): Promise<ViewModel> {
  const statusFile = await readVaultFile("wiki/system/status.md");
  const loopsFile = await readVaultFile("wiki/system/open-loops.md");

  const checks: StatusItem[] = [];
  let overallStatus: "ok" | "warn" | "error" | "stale" | "fresh" = "ok";
  let overallLabel = "Healthy";

  if (statusFile) {
    // Parse "At a glance" — key-value pairs
    const glanceSection = getSection(statusFile, "At a glance");
    if (glanceSection) {
      const cbItems = parseCheckboxes(glanceSection.body);
      if (cbItems.length > 0) {
        for (const item of cbItems) {
          const text = stripLinks(item.text);
          const status: "ok" | "warn" | "error" | "stale" | "fresh" = item.checked ? "ok" : "warn";
          let detail = item.checked ? "Active" : "Needs attention";
          if (/\berror\b/i.test(text)) detail = "Error detected";
          else if (/\bstale\b|\bold\b|\boutdated\b/i.test(text)) detail = "May be outdated";
          else if (/\bhealthy\b|\bgreen\b/i.test(text)) detail = "Healthy";
          checks.push({ label: text, status, detail });
        }
      } else {
        const kvs = parseKeyValuePairs(glanceSection.body);
        for (const [key, value] of Object.entries(kvs)) {
          const status = toStatus(value);
          if (status === "warn" || status === "error") overallStatus = status;
          checks.push({ label: key, status, detail: value });
        }
      }
    }

    // Parse "Runtime" section
    const runtimeSection = getSection(statusFile, "Runtime");
    if (runtimeSection) {
      for (const line of runtimeSection.body.split("\n")) {
        const clean = line.trim();
        // Lines like: `main` = direct chat
        const match = clean.match(/^`?(\w+)`?\s*[=–—]\s*(.+)/);
        if (match) {
          checks.push({ label: match[1], status: "ok", detail: match[2].trim() });
        }
        // Also handle - `agent` = description
        const bulletMatch = clean.match(/^[-*]\s*`?(\w+)`?\s*[=–—]\s*(.+)/);
        if (bulletMatch) {
          checks.push({ label: bulletMatch[1], status: "ok", detail: bulletMatch[2].trim() });
        }
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
      const cbItems = parseCheckboxes(cronSection.body);
      for (const item of cbItems) {
        checks.push({
          label: stripLinks(item.text),
          status: item.checked ? "ok" : "warn",
        });
      }
    }

    // Determine overall status
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
    // Add section-level items as attention items
    for (const section of loopsFile.sections) {
      const lines = section.body
        .split("\n")
        .map((l) => l.replace(/^[-*]\s*/, "").trim())
        .filter((l) => l.length > 10 && !l.startsWith("#") && !l.startsWith("---"));
      for (const line of lines) {
        attention.push(stripLinks(line));
      }
    }
    // Also pick up unchecked items
    const checkboxes = parseCheckboxes(loopsFile.content);
    for (const cb of checkboxes) {
      if (!cb.checked) {
        const text = stripLinks(cb.text);
        if (!attention.some((a) => a.includes(text.slice(0, 20)))) {
          attention.push(text);
        }
      }
    }
  }

  const data: SystemStatusData = {
    overall: { label: overallLabel, status: overallStatus },
    checks,
    attention: attention.length > 0 ? attention.slice(0, 8) : undefined,
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
    sourceFile: "wiki/system/status.md",
    meta: { confidence: 0.95, freshness: "fresh", generatedAt: new Date().toISOString(), primarySourceCount: 2 },
  };
}

// ─── Timeline Synthesis ───────────────────────────────────────────────

export async function buildTimelineSynthesis(): Promise<ViewModel> {
  const monthNames = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
  ];

  const paths = currentMonthPaths();
  const currentFile = await readVaultFile(paths.current);
  const previousFile = await readVaultFile(paths.previous);

  const themes: ThemeGroup[] = [];
  const dateEntries: { date: string; label: string; summary: string; body: string }[] = [];
  const sourceFiles: string[] = [];

  // Parse daily ### headings from current month
  if (currentFile) {
    sourceFiles.push(paths.current);
    extractDayEntries(currentFile, new Date().getFullYear(), dateEntries, monthNames);
  }
  if (previousFile) {
    sourceFiles.push(paths.previous);
    const prevDate = new Date();
    prevDate.setMonth(prevDate.getMonth() - 1);
    extractDayEntries(previousFile, prevDate.getFullYear(), dateEntries, monthNames);
  }

  // Group entries into themes by keyword detection
  const topicMap = new Map<string, TimelineItem[]>();

  for (const entry of dateEntries) {
    const content = (entry.body || "").toLowerCase();
    let theme = "General";

    // More specific matches first
    if (content.includes("reservation mail") || content.includes("backoffice home") || content.includes("refer-a-friend")) theme = "Product & Backoffice";
    else if (content.includes("floorplan") || (content.includes("table") && content.includes("seat"))) theme = "Floorplan";
    else if (content.includes("backoffice") || content.includes("home in the") || content.includes("hardware store")) theme = "Product & Backoffice";
    else if (content.includes("nova") || content.includes("agent") || content.includes("vault") || content.includes("obsidian") || content.includes("system") || content.includes("cron")) theme = "Nova & System";
    else if (content.includes("review") || content.includes("performance") || content.includes("values") || content.includes("promotion")) theme = "Review & Growth";
    else if (content.includes("brain frontend") || content.includes("schema") || content.includes("visual") || content.includes("ui") || content.includes("component")) theme = "AI Visual Brain";
    else if (content.includes("tebi") || content.includes("pos") || content.includes("hospitality")) theme = "Tebi";
    else if (content.includes("research") || content.includes("deep dive") || content.includes("competitive")) theme = "Research";
    else if (content.includes("mr") || content.includes("merge") || content.includes("feedback")) theme = "Process & Delivery";

    if (!topicMap.has(theme)) topicMap.set(theme, []);
    topicMap.get(theme)!.push({
      date: entry.date,
      label: entry.label,
      summary: entry.summary.slice(0, 200) || undefined,
    });
  }

  for (const [label, items] of topicMap) {
    const eventCount = items.length;
    const firstSummary = items[0]?.summary || "";
    const themeSummary = eventCount === 1
      ? firstSummary.slice(0, 120)
      : `${eventCount} events`;

    themes.push({
      label,
      summary: themeSummary,
      items,
    });
  }

  // Fallback if no themes
  if (themes.length === 0) {
    themes.push({
      label: "No timeline data",
      summary: "No work log entries found for this period.",
      items: [],
    });
  }

  const now = new Date();
  const data: TimelineSynthesisData = {
    range: {
      label: paths.currentLabel,
      start: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`,
      end: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
    },
    themes,
  };

  return {
    type: "timeline_synthesis",
    viewId: uid("view_tl"),
    title: paths.currentLabel,
    layout: "timeline",
    data,
    sources: sourceFiles.map((f) => sourceRef(nameFromPath(f).replace(/-/g, " ") || f, f, "timeline")),
    actions: [
      { id: uid("act"), type: "open_note", label: "Open Work Log", target: { path: paths.current }, safety: "safe" },
    ],
    sourceFile: paths.current,
    meta: { confidence: 0.8, freshness: "recent", generatedAt: new Date().toISOString(), primarySourceCount: sourceFiles.length },
  };
}

function extractDayEntries(
  file: ParsedFile,
  year: number,
  dateEntries: { date: string; label: string; summary: string; body: string }[],
  monthNames: string[],
): void {
  for (const section of file.sections) {
    // Match "Thursday, Apr 2, 2026" or "Apr 2, 2026" or date-like patterns
    const dateMatch = section.heading.match(
      /(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(\w+)\s+(\d+),?\s*(\d{4})?/i
    ) || section.heading.match(/(\w{3,})\s+(\d{1,2}),?\s*(\d{4})?/i);

    if (dateMatch) {
      const monthStr = dateMatch[1];
      const day = dateMatch[2].padStart(2, "0");
      const dateYear = dateMatch[3] || String(year);
      const monthIdx = monthNames.indexOf(monthStr.toLowerCase());
      const monthNum = monthIdx >= 0 ? String(monthIdx + 1).padStart(2, "0") : "01";
      const date = `${dateYear}-${monthNum}-${day}`;

      // Extract focus areas and key content
      const lines = section.body.split("\n").filter((l) => l.trim().length > 0);
      const focusLines = lines.filter((l) => l.trim().startsWith("- "));
      const summary = focusLines.slice(0, 5).map((l) => l.trim().replace(/^[-*]\s*/, "")).join("; ");

      dateEntries.push({
        date,
        label: section.heading,
        summary: summary || section.body.slice(0, 300).trim(),
        body: section.body,
      });
    }
  }
}

// ─── Topic Overview ──────────────────────────────────────────────────

export async function buildTopicOverview(query?: string): Promise<ViewModel> {
  const q = (query || "").toLowerCase();

  // Load indexes for dynamic matching
  const [projectFiles, researchDirs] = await Promise.all([
    getProjectIndex(),
    getResearchProjects(),
  ]);

  const projectNames = projectFiles.map(nameFromPath).filter((n) => n && n !== "projects" && n !== "ideas");
  const researchNames = researchDirs.map(nameFromPath);

  let topicTitle = "";
  let summary = "";
  let primaryFile = "";
  const additionalFiles: string[] = [];
  const keyQuestions: string[] = [];
  const nextSteps: string[] = [];
  const relatedNotes: LinkRef[] = [];
  const timeline: TimelineItem[] = [];
  let currentState: string | undefined;
  let whyNow: string | undefined;

  // ─── Try matching against research projects ────────────────────────
  const researchMatch = researchDirs.find((d) => {
    const name = nameFromPath(d);
    return q.includes(name.replace(/-/g, " ")) || name.replace(/-/g, " ").includes(q) || q.includes(name);
  });

  if (researchMatch) {
    const researchName = nameFromPath(researchMatch);
    const execSummary = await readVaultFile(`${researchMatch.dir}/executive-summary.md`);
    const deepDive = await readVaultFile(`${researchMatch.dir}/deep-dive.md`);
    const openQuestions = await readVaultFile(`${researchMatch.dir}/open-questions.md`);

    primaryFile = `${researchMatch.dir}/executive-summary.md`;
    topicTitle = researchName.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) + " Research";
    summary = "Deep research analysis with competitive positioning and outlook.";

    if (execSummary) {
      // Extract "The Answer" or "Key Findings" as summary
      const answerSection = getSection(execSummary, "The Answer") || getSection(execSummary, "Key Findings");
      if (answerSection) {
        const firstMeaningful = answerSection.body.split("\n")
          .find((l) => l.trim().length > 20 && !l.trim().startsWith("#") && !l.trim().startsWith(">"));
        if (firstMeaningful) summary = stripLinks(firstMeaningful.trim());
      }

      // Extract key findings as key questions
      const keySection = getSection(execSummary, "Key Findings") || getSection(execSummary, "Critical Tension");
      if (keySection) {
        for (const line of keySection.body.split("\n")) {
          if (line.trim().startsWith("- **") || line.trim().startsWith("- ")) {
            const text = line.trim().replace(/^-\s*/, "").replace(/\*\*/g, "");
            if (text.length > 15 && keyQuestions.length < 8) keyQuestions.push(text);
          }
        }
      }

      // Extract links
      const links = extractLinks(execSummary.content);
      for (const link of links.slice(0, 5)) {
        relatedNotes.push({ label: link.label, path: link.path, kind: "research" });
      }
    }

    if (openQuestions) {
      const cbItems = parseCheckboxes(openQuestions.content);
      for (const cb of cbItems) {
        if (!cb.checked && keyQuestions.length < 8) {
          keyQuestions.push(stripLinks(cb.text));
        }
      }
    }

    // Add research file references
    relatedNotes.push(
      { label: "Executive Summary", path: `${researchMatch.dir}/executive-summary.md`, kind: "research" },
      { label: "Deep Dive", path: `${researchMatch.dir}/deep-dive.md`, kind: "research" },
      { label: "Key Players", path: `${researchMatch.dir}/key-players.md`, kind: "research" },
    );

    if (deepDive) additionalFiles.push(`${researchMatch.dir}/deep-dive.md`);
    if (openQuestions) additionalFiles.push(`${researchMatch.dir}/open-questions.md`);

  } else {
    // ─── Try matching against project files ──────────────────────────
    const projectMatch = projectFiles.find((f) => {
      const name = nameFromPath(f);
      return q.includes(name) || name.includes(q) || q.split(/\s+/).every((word) => name.includes(word));
    });

    if (projectMatch) {
      const projectFile = await readVaultFile(projectMatch.path);
      primaryFile = projectMatch.path;
      topicTitle = projectFile?.sections[0]?.heading ||
        nameFromPath(projectMatch).replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

      if (projectFile) {
        // Extract summary from "Idea" or first section
        const ideaSection = getSection(projectFile, "Idea") || getSection(projectFile, "Summary") || projectFile.sections[1];
        if (ideaSection) {
          const firstLine = ideaSection.body.split("\n")
            .find((l) => l.trim().length > 20 && !l.trim().startsWith("#"));
          if (firstLine) summary = stripLinks(firstLine.trim());
        }

        // Extract current state
        const currentStateSection = getSection(projectFile, "Current state") || getSection(projectFile, "Current research");
        if (currentStateSection) {
          currentState = currentStateSection.body.split("\n")
            .filter((l) => l.trim().length > 5)
            .slice(0, 3)
            .map((l) => l.trim().replace(/^[-*]\s*/, ""))
            .join("; ");
        }

        // Extract key questions
        const questionsSection = getSection(projectFile, "Key questions") || getSection(projectFile, "Open questions");
        if (questionsSection) {
          const cbItems = parseCheckboxes(questionsSection.body);
          for (const cb of cbItems) {
            if (!cb.checked && keyQuestions.length < 5) keyQuestions.push(stripLinks(cb.text));
          }
        }

        // Extract next steps
        const nextSection = getSection(projectFile, "Next") || getSection(projectFile, "Next steps") || getSection(projectFile, "What I would do next");
        if (nextSection) {
          for (const line of nextSection.body.split("\n")) {
            if (line.trim().startsWith("- ") && nextSteps.length < 5) {
              nextSteps.push(stripLinks(line.trim().replace(/^-\s*/, "")));
            }
          }
        }

        // Extract related links
        const links = extractLinks(projectFile.content);
        for (const link of links.slice(0, 8)) {
          relatedNotes.push({ label: link.label, path: link.path, kind: "topic" });
        }

        // Extract "why now" from product thesis
        const thesisSection = getSection(projectFile, "Product thesis") || getSection(projectFile, "Best product principles");
        if (thesisSection) {
          whyNow = thesisSection.body.split("\n")
            .find((l) => l.trim().length > 20 && !l.trim().startsWith("#"));
          if (whyNow) whyNow = stripLinks(whyNow.trim());
        }
      }
    } else {
      topicTitle = "Topic Not Found";
      summary = `No project or research matching "${query}". Try searching instead.`;
      primaryFile = "";
    }
  }

  const data: TopicOverviewData = {
    topicType: researchMatch ? "research" : "project",
    currentState,
    summary: summary || "Project details from the vault.",
    whyNow,
    keyQuestions: keyQuestions.length > 0 ? keyQuestions.slice(0, 6) : undefined,
    nextSteps: nextSteps.length > 0 ? nextSteps.slice(0, 5) : undefined,
    relatedNotes: relatedNotes.length > 0 ? relatedNotes : undefined,
    relatedEntities: relatedNotes
      .filter((n) => n.kind === "entity" || n.path.includes("entities"))
      .slice(0, 5),
    timeline: timeline.length > 0 ? timeline : undefined,
  };

  const sources: SourceRef[] = [];
  if (primaryFile) {
    sources.push(sourceRef(
      nameFromPath(primaryFile).replace(/-/g, " ") || primaryFile,
      primaryFile,
      "topic"
    ));
  }
  for (const f of additionalFiles) {
    sources.push(sourceRef(
      nameFromPath(f).replace(/-/g, " ") || f,
      f,
      "topic"
    ));
  }

  return {
    type: "topic_overview",
    viewId: uid("view_topic"),
    title: topicTitle,
    layout: "stack",
    data,
    sources,
    actions: primaryFile ? [
      { id: uid("act"), type: "open_note", label: "Open in Obsidian", target: { path: primaryFile }, safety: "safe" },
    ] : undefined,
    sourceFile: primaryFile || undefined,
    meta: { confidence: primaryFile ? 0.88 : 0.3, freshness: "recent", generatedAt: new Date().toISOString(), primarySourceCount: sources.length },
  };
}

// ─── Search Results ───────────────────────────────────────────────────

export async function buildSearchResults(query: string): Promise<ViewModel> {
  // Search across ALL vault directories including private
  const dirs = [
    "wiki/work",
    "wiki/system",
    "wiki/knowledge",
    "wiki/projects",
    "wiki/memory",
    "wiki/journal",
    "wiki/private",
  ];

  // Collect all files from all directories
  const allFiles = new Set<string>();
  for (const dir of dirs) {
    const files = await listVaultFiles(dir);
    for (const f of files) allFiles.add(f);
  }

  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  const results: { path: string; excerpt: string; score: number; kind: string }[] = [];

  for (const filePath of allFiles) {
    const file = await readVaultFile(filePath);
    if (!file) continue;

    const content = file.content.toLowerCase();
    const headingText = file.sections.map((s) => s.heading.toLowerCase()).join(" ");

    let score = 0;
    for (const term of terms) {
      const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const headingCount = (headingText.match(new RegExp(escapedTerm, "g")) || []).length;
      const contentCount = (content.match(new RegExp(escapedTerm, "g")) || []).length;
      // Heading matches worth more
      score += headingCount * 5 + contentCount;
    }

    // Recency boost
    const daysSinceModified = (Date.now() - (file.mtime || 0)) / (1000 * 60 * 60 * 24);
    const recencyBoost = Math.max(0, 1 - daysSinceModified / 90) * 2;
    score += recencyBoost;

    if (score > 0) {
      // Extract excerpt around first match
      const firstTerm = terms[0];
      const idx = content.indexOf(firstTerm);
      const start = Math.max(0, idx - 60);
      const end = Math.min(content.length, idx + firstTerm.length + 80);
      const excerpt = (start > 0 ? "…" : "") + content.slice(start, end).replace(/\n/g, " ") + (end < content.length ? "…" : "");

      const kind = kindFromPath(filePath);
      results.push({ path: filePath, excerpt, score, kind });
    }
  }

  results.sort((a, b) => b.score - a.score);
  const topResults = results.slice(0, 12);

  const data: SearchResultsData = {
    query,
    results: topResults.map((r) => ({
      label: nameFromPath(r.path).replace(/-/g, " ") || r.path,
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
    sourceFile: topResults[0]?.path,
    meta: { confidence: Math.min(0.5 + topResults.length * 0.05, 0.9), freshness: "fresh", generatedAt: new Date().toISOString(), primarySourceCount: topResults.length },
  };
}

function inferSuggestedViews(query: string): { intent: Intent; label: string }[] {
  const suggestions: { intent: Intent; label: string }[] = [];
  const q = query.toLowerCase();

  if (q.includes("work") || q.includes("task") || q.includes("todo")) suggestions.push({ intent: "current_work", label: "View current work" });
  if (q.includes("tebi") || q.includes("company")) suggestions.push({ intent: "entity_overview", label: "View Tebi entity" });
  if (q.includes("system") || q.includes("health") || q.includes("status")) suggestions.push({ intent: "system_status", label: "View system status" });
  if (q.includes("timeline") || q.includes("history") || q.includes("recently")) suggestions.push({ intent: "timeline_synthesis", label: "View timeline" });
  if (q.includes("project") || q.includes("research")) suggestions.push({ intent: "topic_overview", label: "View project" });

  if (suggestions.length === 0) {
    suggestions.push({ intent: "current_work", label: "View current work" });
  }

  return suggestions;
}

// ─── Build by view type ──────────────────────────────────────────────

export async function buildView(
  viewType: ViewType,
  query?: string,
  entityName?: string,
): Promise<ViewModel> {
  switch (viewType) {
    case "current_work":
      return buildCurrentWork();
    case "entity_overview":
      return buildEntityOverview(entityName);
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