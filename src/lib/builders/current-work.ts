/**
 * Builds the "Current Work" ViewModel from the vault's open + waiting-for
 * files. Groups by `### sub-section` under `## Active now` when present.
 */

import type { ViewModel, CurrentWorkData, TaskGroup, TaskItem, LinkRef } from "../view-models";
import {
  parseCheckboxes,
  getSection,
  readWorkOpen,
  readWorkWaitingFor,
} from "../vault-reader";
import {
  uid,
  stripLinks,
  inferTaskStatus,
  inferPriority,
  extractLinksFromCheckbox,
  normalizeLinks,
  sourceRef,
  monthLogPath,
  weekLogPath,
} from "./shared";

/**
 * Build the "Current Work" view model.
 *
 * Reads the vault's open-work + waiting-for files, groups tasks by the
 * `### sub-section` headings under `## Active now` (falling back to a
 * single group if that section is missing), infers status/priority from
 * task text, and normalises every wiki-link into an absolute vault path.
 * Always returns a ViewModel — empty groups when no work files are found.
 */
export async function buildCurrentWork(): Promise<ViewModel> {
  const { file: openFile } = await readWorkOpen();
  const { file: waitingFile } = await readWorkWaitingFor();

  const groups: TaskGroup[] = [];

  if (openFile) {
    const activeIdx = openFile.sections.findIndex(
      (s) => s.heading.toLowerCase() === "active now"
    );

    if (activeIdx !== -1) {
      for (let i = activeIdx + 1; i < openFile.sections.length; i++) {
        const section = openFile.sections[i];
        if (section.level <= openFile.sections[activeIdx].level) break;
        if (section.level !== 3) continue;

        const checkboxes = parseCheckboxes(section.body);
        if (checkboxes.length === 0) continue;

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

  const totalTasks = groups.reduce((sum, g) => sum + g.items.length, 0);
  const doneTasks = groups.reduce((sum, g) => sum + g.items.filter((i) => i.status === "done").length, 0);
  const highPriority = groups.reduce((sum, g) => sum + g.items.filter((i) => i.priority === "high").length, 0);
  const blockedTasks = groups.reduce((sum, g) => sum + g.items.filter((i) => i.status === "blocked").length, 0);

  const highlights: string[] = [];
  if (totalTasks > 0) highlights.push(`${totalTasks} tasks across ${groups.length} areas`);
  if (doneTasks > 0) highlights.push(`${doneTasks} completed`);
  if (highPriority > 0) highlights.push(`${highPriority} high-priority`);
  if (blockedTasks > 0) highlights.push(`${blockedTasks} blocked`);

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
