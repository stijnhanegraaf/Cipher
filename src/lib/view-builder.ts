/**
 * Builds typed view-models from vault data for each detected intent.
 *
 * Given an intent + optional entity/topic name, returns a ViewModel
 * (CurrentWorkData / SystemStatusData / TimelineSynthesisData / ...) with
 * the sources, actions, and freshness meta the renderer needs. Vault-
 * agnostic: paths come from getVaultLayout(), never hardcoded.
 */

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
  getJournalIndex,
  searchVault,
  resolveLink,
  listVaultFiles,
  extractLinks,
  parseEntity,
  parseWorkItems,
  parseWorkLog,
  readWorkOpen,
  readWorkWaitingFor,
  readSystemStatus,
  readOpenLoops,
  readEntity,
  getVaultLayout,
  type ParsedFile,
  type TableData,
  type EntityData,
} from "./vault-reader";
import { log } from "./log";

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

/**
 * Resolve every LinkRef's `path` through the vault resolver so downstream
 * consumers (DetailPage, MarkdownRenderer) always receive an absolute vault
 * path — never a raw wiki label like "Foo". Unresolvable links are dropped.
 *
 * Deduplicates by resolved path so the same target appearing under different
 * labels doesn't render twice.
 */
async function normalizeLinks<T extends { path: string; label: string }>(links: T[]): Promise<T[]> {
  const out: T[] = [];
  const seen = new Set<string>();
  for (const link of links) {
    if (!link.path) continue;
    // Skip if already absolute (ends .md with a slash) — still dedupe.
    const isAbsolute = link.path.includes("/") && link.path.toLowerCase().endsWith(".md");
    let resolvedPath: string | null = link.path;
    if (!isAbsolute) {
      resolvedPath = await resolveLink(link.path);
    }
    if (!resolvedPath) continue;
    if (seen.has(resolvedPath)) continue;
    seen.add(resolvedPath);
    out.push({ ...link, path: resolvedPath });
  }
  return out;
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
  if (path.includes("/entities/")) return "entity";
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

/**
 * Infer a theme label from arbitrary entry body — generic, vault-agnostic.
 * Priority: first markdown heading, then first wiki-link, then first #tag.
 * Falls back to "General" when nothing useful surfaces.
 */
function inferTheme(body: string | undefined): string | null {
  if (!body) return null;
  // First heading (## or ###) inside the body is the most common "topic" signal.
  const headingMatch = body.match(/^#{2,4}\s+(.+?)\s*$/m);
  if (headingMatch) return headingMatch[1].trim().slice(0, 40);
  // First wiki-link — often names the primary subject.
  const wikiMatch = body.match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/);
  if (wikiMatch) return wikiMatch[1].trim().slice(0, 40);
  // First #tag.
  const tagMatch = body.match(/(?:^|\s)#([a-zA-Z][\w-]+)/);
  if (tagMatch) {
    return tagMatch[1].split(/[-_]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ").slice(0, 40);
  }
  return null;
}

/**
 * Resolve an expected "monthly work log" path from the probed vault layout.
 * Defaults to `<workDir>/log/<year>/<month>.md` when the layout has a
 * workDir. Legacy wiki/work/log/... fallback for older vaults.
 */
function monthLogPath(year: number, monthName: string): string {
  const layout = getVaultLayout();
  const workDir = layout?.workDir;
  if (workDir) return `${workDir}/log/${year}/${monthName}.md`;
  return `wiki/work/log/${year}/${monthName}.md`;
}

/**
 * Resolve an expected "weekly work summary" path from the probed vault layout.
 */
function weekLogPath(year: number, weekNum: number): string {
  const layout = getVaultLayout();
  const workDir = layout?.workDir;
  const weekStr = `W${String(weekNum).padStart(2, "0")}`;
  if (workDir) return `${workDir}/weeks/${year}/${weekStr}.md`;
  return `wiki/work/weeks/${year}/${weekStr}.md`;
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
    current: monthLogPath(currentYear, currentMonthName),
    previous: monthLogPath(prevYear, prevMonthName),
    currentLabel: `${currentMonthName.charAt(0).toUpperCase() + currentMonthName.slice(1)} ${currentYear}`,
    previousLabel: `${prevMonthName.charAt(0).toUpperCase() + prevMonthName.slice(1)} ${prevYear}`,
  };
}

// ─── Current Work ─────────────────────────────────────────────────────

export async function buildCurrentWork(): Promise<ViewModel> {
  const { file: openFile } = await readWorkOpen();
  const { file: waitingFile } = await readWorkWaitingFor();

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

        // Compute absolute line offset: find the heading line in the file, body starts on next line
        const fileLines = openFile.content.split("\n");
        const headingLineIndex = fileLines.findIndex((l) =>
          l.trim() === "### " + section.heading
        );
        const sectionStartLine = headingLineIndex >= 0 ? headingLineIndex + 1 : 0;

        const items: TaskItem[] = checkboxes.map((cb) => ({
          id: uid("task"),
          text: stripLinks(cb.text),
          status: inferTaskStatus(cb.checked, cb.text),
          priority: inferPriority(cb.text),
          links: extractLinksFromCheckbox(cb.text),
          lineIndex: sectionStartLine + cb.lineIndex,
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
          lineIndex: cb.lineIndex,
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
            lineIndex: cb.lineIndex,
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
    path: weekLogPath(now.getFullYear(), weekNum),
  };
  periodLinks.month = {
    label: `${monthNames[now.getMonth()].charAt(0).toUpperCase() + monthNames[now.getMonth()].slice(1)} ${now.getFullYear()}`,
    path: monthLogPath(now.getFullYear(), monthNames[now.getMonth()]),
  };

  // Normalize every task item's links — unresolvable raw wiki labels drop out,
  // survivors become absolute vault paths so the UI always clicks through.
  for (const group of groups) {
    for (const item of group.items) {
      if (item.links && item.links.length > 0) {
        item.links = await normalizeLinks(item.links);
      }
    }
  }

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
      ...(openFile ? [sourceRef("Open Work", openFile.path, "current_state")] : []),
      ...(waitingFile ? [sourceRef("Waiting For", waitingFile.path, "blocked_items")] : []),
    ],
    actions: openFile
      ? [{ id: uid("act"), type: "open_note", label: "Open Work Notes", target: { path: openFile.path }, safety: "safe" }]
      : [],
    sourceFile: openFile?.path,
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
  // No default entity — if the caller didn't specify one, we can't build an overview.
  if (!entityName) {
    return {
      type: "entity_overview",
      viewId: uid("view_ent"),
      title: "No entity specified",
      layout: "stack",
      data: {
        entityType: "unknown",
        summary: "Ask about a specific person, project, or topic by name.",
      } as EntityOverviewData,
      meta: { confidence: 0.1, freshness: "unknown" },
    };
  }

  const name = entityName;
  const layout = getVaultLayout();
  const primaryFile = layout?.entitiesDir
    ? `${layout.entitiesDir}/${name}.md`
    : `wiki/knowledge/entities/${name}.md`;

  // Read primary file. Falls back to parent dirs via readEntity's probe
  // when the layout doesn't match the expected shape.
  const mainFile = await readVaultFile(primaryFile);
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

  // Use parseEntity for rich extraction
  const entityData: EntityData | null = await parseEntity(mainFile);

  // Extract summary from Core framing
  let summary = "";
  if (entityData && entityData.coreFraming) {
    summary = entityData.coreFraming.split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 10 && !l.startsWith("#"))
      .join(" ")
      .slice(0, 300);
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
    addLink(link, "note");
  }

  // Generic Timeline section parser — any entity file can have a ## Timeline table.
  const timeline: TimelineItem[] = [];
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

  // Build "why now" from open work
  const { file: openFile } = await readWorkOpen();
  let whyNow: string | undefined;
  if (openFile && openFile.content.toLowerCase().includes(name.toLowerCase())) {
    whyNow = `There are active work items referencing ${name.charAt(0).toUpperCase() + name.slice(1).replace(/-/g, " ")}.`;
  }

  const entityType = (entityData?.frontmatter?.area as string) || (mainFile.frontmatter.area as string) || "entity";

  // Normalize every LinkRef so the UI always gets absolute, reachable paths.
  // Unresolvable raw wiki labels drop out here rather than rendering dead pills.
  const normalizedNotes = await normalizeLinks(relatedNotes);
  const normalizedEntities = await normalizeLinks(relatedEntities);

  const data: EntityOverviewData = {
    entityType,
    summary: summary.slice(0, 500),
    whyNow,
    relatedNotes: normalizedNotes.slice(0, 10),
    relatedEntities: normalizedEntities.slice(0, 5),
    timeline: timeline.length > 0 ? timeline.slice(0, 15) : undefined,
  };

  const displayName = name.split(/[-_]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

  return {
    type: "entity_overview",
    viewId: uid("view_ent"),
    title: displayName,
    subtitle: undefined,
    layout: "stack",
    data,
    sources: [sourceRef(
      nameFromPath(primaryFile).replace(/-/g, " ") || primaryFile,
      primaryFile,
      "entity"
    )],
    actions: [
      { id: uid("act"), type: "open_note", label: "Open in Obsidian", target: { path: primaryFile }, safety: "safe" },
    ],
    sourceFile: primaryFile,
    meta: { confidence: 0.92, freshness: "recent", generatedAt: new Date().toISOString(), primarySourceCount: 1 },
  };
}

// ─── System Status ────────────────────────────────────────────────────

export async function buildSystemStatus(): Promise<ViewModel> {
  const { file: statusFile } = await readSystemStatus();
  const { file: loopsFile } = await readOpenLoops();

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

  // Vault-wide health metrics (broken links, stale notes, 30-day activity).
  // Best-effort — if the scan fails we still return the existing checks.
  let health: import("./view-models").VaultHealthMetrics | undefined;
  try {
    const { buildVaultHealth } = await import("./vault-health");
    health = (await buildVaultHealth()) ?? undefined;
    if (health) {
      if (health.brokenLinks.count > 0) {
        checks.push({
          label: "Broken links",
          status: health.brokenLinks.count > 20 ? "error" : "warn",
          detail: `${health.brokenLinks.count} unresolved wiki-links`,
        });
        if (overallStatus === "ok") overallStatus = "warn";
      }
      if (health.staleNotes.count > 0) {
        checks.push({
          label: "Stale notes",
          status: health.staleNotes.count > 50 ? "warn" : "ok",
          detail: `${health.staleNotes.count} untouched for 30+ days`,
        });
      }
    }
  } catch (e) {
    log.warn("view-builder", "vault health scan failed", e);
  }

  const data: SystemStatusData = {
    overall: { label: overallLabel, status: overallStatus },
    checks,
    attention: attention.length > 0 ? attention.slice(0, 8) : undefined,
    health,
  };

  return {
    type: "system_status",
    viewId: uid("view_sys"),
    title: "System Health",
    layout: "stack",
    data,
    sources: [
      ...(statusFile ? [sourceRef("System Status", statusFile.path, "system")] : []),
      ...(loopsFile ? [sourceRef("Open Loops", loopsFile.path, "system")] : []),
    ],
    actions: statusFile
      ? [{ id: uid("act"), type: "open_note", label: "Open System Status", target: { path: statusFile.path }, safety: "safe" }]
      : [],
    sourceFile: statusFile?.path,
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

  const themes: ThemeGroup[] = [];
  const dateEntries: { date: string; label: string; summary: string; body: string; sourcePath: string; anchor?: string }[] = [];
  const sourceFiles: string[] = [];

  // 1. Walk backward up to 12 months of monthly work logs using the
  //    probed work-log path scheme.
  const nowTs = new Date();
  for (let offset = 0; offset < 12; offset++) {
    const d = new Date(nowTs.getFullYear(), nowTs.getMonth() - offset, 1);
    const rel = monthLogPath(d.getFullYear(), monthNames[d.getMonth()]);
    const file = await readVaultFile(rel);
    if (!file) continue;
    sourceFiles.push(rel);
    extractDayEntries(file, d.getFullYear(), dateEntries, monthNames, rel);
  }

  // 2. Walk the journal directory (probed from vault layout) — one file
  //    per day with YYYY-MM-DD.md filename.
  try {
    const { readdir } = await import("fs/promises");
    const { getVaultPath } = await import("./vault-reader");
    const root = getVaultPath();
    const layout = getVaultLayout();
    if (root && layout?.journalDir) {
      const { existsSync } = await import("fs");
      const { join } = await import("path");
      const journalDirAbs = join(root, layout.journalDir);
      if (existsSync(journalDirAbs)) {
        const journalFiles = await readdir(journalDirAbs);
        for (const name of journalFiles) {
          const m = name.match(/^(\d{4})-(\d{2})-(\d{2})\.md$/i);
          if (!m) continue;
          const rel = `${layout.journalDir}/${name}`;
          const file = await readVaultFile(rel);
          if (!file) continue;
          sourceFiles.push(rel);
          // Whole-file entry: date from filename, label from first heading or filename.
          const label = file.sections[0]?.heading || `${m[1]}-${m[2]}-${m[3]}`;
          const bodyLines = file.content.split("\n").filter((l) => l.trim().length > 0);
          const focusLines = bodyLines.filter((l) => l.trim().startsWith("- "));
          const summary = focusLines.length > 0
            ? focusLines.slice(0, 5).map((l) => l.trim().replace(/^[-*]\s*/, "")).join("; ")
            : file.content.slice(0, 300).trim();
          dateEntries.push({
            date: `${m[1]}-${m[2]}-${m[3]}`,
            label,
            summary,
            body: file.content,
            sourcePath: rel,
          });
        }
      }
    }

    // 3. Walk <workDir>/weeks/<year>/ — week-level summary files.
    if (root && layout?.workDir) {
      const { existsSync } = await import("fs");
      const { join } = await import("path");
      const weeksRoot = join(root, layout.workDir, "weeks");
      if (existsSync(weeksRoot)) {
        const years = await readdir(weeksRoot).catch(() => []);
        for (const year of years) {
          const yearDir = join(weeksRoot, year);
          const weekFiles = await readdir(yearDir).catch(() => []);
          for (const name of weekFiles) {
            if (!name.toLowerCase().endsWith(".md")) continue;
            const rel = `${layout.workDir}/weeks/${year}/${name}`;
            const file = await readVaultFile(rel);
            if (!file) continue;
            sourceFiles.push(rel);
            // Try to derive a start date from the filename (e.g. "2026-w15.md",
            // "week-15.md", "apr-13.md"). Fallback to file mtime.
            const label = file.sections[0]?.heading || name.replace(/\.md$/i, "");
            let date = "";
            const isoM = name.match(/(\d{4})-(\d{2})-(\d{2})/);
            const weekM = name.match(/(\d{4})-w(\d{1,2})/i);
            if (isoM) date = `${isoM[1]}-${isoM[2]}-${isoM[3]}`;
            else if (weekM) {
              const y = parseInt(weekM[1], 10);
              const w = parseInt(weekM[2], 10);
              const jan4 = new Date(y, 0, 4);
              const start = new Date(jan4);
              start.setDate(jan4.getDate() - (jan4.getDay() || 7) + 1 + (w - 1) * 7);
              date = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
            } else if (file.mtime) {
              const d = new Date(file.mtime);
              date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            }
            if (!date) continue;
            const bodyLines = file.content.split("\n").filter((l) => l.trim().length > 0);
            const focusLines = bodyLines.filter((l) => l.trim().startsWith("- "));
            const summary = focusLines.slice(0, 5).map((l) => l.trim().replace(/^[-*]\s*/, "")).join("; ")
              || file.content.slice(0, 300).trim();
            dateEntries.push({
              date,
              label,
              summary,
              body: file.content,
              sourcePath: rel,
            });
          }
        }
      }
    }
  } catch {
    /* silent: journal/weeks are best-effort */
  }

  // Group entries into themes by keyword detection
  const topicMap = new Map<string, TimelineItem[]>();

  // Generic topic inference — pick the most frequent top-level heading or first
  // heading encountered within each entry body. If nothing useful surfaces, bucket
  // under "General". No hardcoded keyword list — that would tie us to one vault.
  for (const entry of dateEntries) {
    const theme = inferTheme(entry.body) || "General";
    if (!topicMap.has(theme)) topicMap.set(theme, []);
    topicMap.get(theme)!.push({
      date: entry.date,
      label: entry.label,
      summary: entry.summary.slice(0, 200) || undefined,
      path: entry.sourcePath,
      anchor: entry.anchor,
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

function slugifyHeading(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function extractDayEntries(
  file: ParsedFile,
  year: number,
  dateEntries: { date: string; label: string; summary: string; body: string; sourcePath: string; anchor?: string }[],
  monthNames: string[],
  sourcePath: string,
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
        sourcePath,
        anchor: slugifyHeading(section.heading),
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

  // Normalize links so every pill in the UI clicks through.
  const normalizedRelated = await normalizeLinks(relatedNotes);

  const data: TopicOverviewData = {
    topicType: researchMatch ? "research" : "project",
    currentState,
    summary: summary || "Project details from the vault.",
    whyNow,
    keyQuestions: keyQuestions.length > 0 ? keyQuestions.slice(0, 6) : undefined,
    nextSteps: nextSteps.length > 0 ? nextSteps.slice(0, 5) : undefined,
    relatedNotes: normalizedRelated.length > 0 ? normalizedRelated : undefined,
    relatedEntities: normalizedRelated
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
  // Search across every folder the vault layout probed, plus a few
  // common unknown-to-layout names as a backstop. Vault-agnostic.
  const layout = getVaultLayout();
  const probed = [
    layout?.workDir,
    layout?.systemDir,
    layout?.entitiesDir,
    layout?.projectsDir,
    layout?.researchDir,
    layout?.journalDir,
  ].filter((d): d is string => !!d);
  const extras = ["memory", "private", "notes", "inbox"];
  const extraPrefixed = layout?.hasWiki ? extras.map((n) => `wiki/${n}`) : extras;
  const dirs = Array.from(new Set([...probed, ...extraPrefixed]));

  // Collect all files from every dir.
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
  // Intent suggestions — generic only; entity-specific suggestions come from vault content.
  if (q.includes("system") || q.includes("health") || q.includes("status")) suggestions.push({ intent: "system_status", label: "View system status" });
  if (q.includes("timeline") || q.includes("history") || q.includes("recently")) suggestions.push({ intent: "timeline_synthesis", label: "View timeline" });
  if (q.includes("project") || q.includes("research")) suggestions.push({ intent: "topic_overview", label: "View project" });

  if (suggestions.length === 0) {
    suggestions.push({ intent: "current_work", label: "View current work" });
  }

  return suggestions;
}

// ─── Browse Index ─────────────────────────────────────────────────────

export async function buildBrowseIndex(
  indexType: "entities" | "projects" | "research"
): Promise<ViewModel> {
  const [entityFiles, projectFiles, researchDirs] = await Promise.all([
    getEntityIndex(),
    getProjectIndex(),
    getResearchProjects(),
  ]);

  const titles: Record<string, string> = {
    entities: "Entities",
    projects: "Projects",
    research: "Research Projects",
  };

  let items: import("./view-models").IndexEntry[] = [];
  let researchItems: import("./view-models").ResearchProject[] | undefined;

  switch (indexType) {
    case "entities":
      items = entityFiles;
      break;
    case "projects":
      items = projectFiles;
      break;
    case "research":
      researchItems = researchDirs;
      items = researchDirs.map((d) => ({
        name: d.name,
        path: `${d.dir}/executive-summary.md`,
      }));
      break;
  }

  const data: import("./view-models").BrowseIndexData = {
    indexType,
    items,
    researchItems,
  };

  return {
    type: indexType === "entities" ? "browse_entities" : indexType === "projects" ? "browse_projects" : "browse_research",
    viewId: uid("view_browse"),
    title: titles[indexType],
    layout: "stack",
    data,
    sources: [],
    actions: [],
    meta: { confidence: 0.95, freshness: "fresh", generatedAt: new Date().toISOString(), primarySourceCount: items.length },
  };
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
    case "browse_entities":
      return buildBrowseIndex("entities");
    case "browse_projects":
      return buildBrowseIndex("projects");
    case "browse_research":
      return buildBrowseIndex("research");
  }
}