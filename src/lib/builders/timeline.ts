/**
 * Builds the "Timeline Synthesis" ViewModel by walking monthly work logs,
 * journal entries, and weekly summaries; groups entries into themes.
 */

import type { ViewModel, TimelineSynthesisData, ThemeGroup, TimelineItem } from "../view-models";
import { readVaultFile, getVaultLayout, type ParsedFile } from "../vault-reader";
import { uid, sourceRef, inferTheme, currentMonthPaths, monthLogPath, nameFromPath } from "./shared";

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
    const { getVaultPath } = await import("../vault-reader");
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

