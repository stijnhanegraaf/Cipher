/**
 * Schema-aware convenience readers for common vault files — open-work,
 * waiting-for, system-status, open-loops, entities, work-logs, weekly
 * summaries, research projects. Each probes layout + common filenames.
 */

import type { ParsedFile, EntityData, ResearchProject, WorkGroup, StatusCheck, WorkLogDay } from "./vault-reader";
import {
  readVaultFile,
  parseWorkItems,
  parseStatusChecks,
  parseWorkLog,
  parseEntity,
  parseResearchProject,
  getVaultLayout,
} from "./vault-reader";

function inDir(dir: string | null, ...parts: string[]): string | null {
  if (!dir) return null;
  return [dir, ...parts].filter(Boolean).join("/");
}

async function firstReadable(candidates: (string | null)[]): Promise<ParsedFile | null> {
  for (const c of candidates) {
    if (!c) continue;
    const file = await readVaultFile(c);
    if (file) return file;
  }
  return null;
}

function hubCandidates(dir: string | null, fileName: string): string[] {
  const out: string[] = [];
  const from = inDir(dir, fileName);
  if (from) out.push(from);
  out.push(fileName);
  if (!dir?.startsWith("wiki/")) out.push(`wiki/${fileName}`);
  return out;
}

export async function readWorkOpen(): Promise<{ file: ParsedFile | null; groups: WorkGroup[] }> {
  const layout = getVaultLayout();
  const file = await firstReadable([
    ...hubCandidates(layout?.workDir ?? null, "open.md"),
    ...hubCandidates(layout?.workDir ?? null, "now.md"),
    ...hubCandidates(layout?.workDir ?? null, "today.md"),
  ]);
  if (!file) return { file: null, groups: [] };
  return { file, groups: parseWorkItems(file) };
}

/**
 * Read the "waiting-for" / blocked-items file from the probed workDir.
 *
 * Returns `{ file: null, groups: [] }` when the file isn't present in this vault.
 */
export async function readWorkWaitingFor(): Promise<{ file: ParsedFile | null; groups: WorkGroup[] }> {
  const layout = getVaultLayout();
  const file = await firstReadable([
    ...hubCandidates(layout?.workDir ?? null, "waiting-for.md"),
    ...hubCandidates(layout?.workDir ?? null, "waiting.md"),
    ...hubCandidates(layout?.workDir ?? null, "blocked.md"),
  ]);
  if (!file) return { file: null, groups: [] };
  return { file, groups: parseWorkItems(file) };
}

/**
 * Read the system-status file (status.md / health.md) from the probed systemDir.
 *
 * Returns `{ file: null, checks: [] }` when no status file exists.
 */
export async function readSystemStatus(): Promise<{ file: ParsedFile | null; checks: StatusCheck[] }> {
  const layout = getVaultLayout();
  const file = await firstReadable([
    ...hubCandidates(layout?.systemDir ?? null, "status.md"),
    ...hubCandidates(layout?.systemDir ?? null, "health.md"),
  ]);
  if (!file) return { file: null, checks: [] };
  return { file, checks: parseStatusChecks(file) };
}

/**
 * Read the open-loops / follow-ups file from the probed systemDir.
 *
 * Returns `{ file: null, groups: [] }` when no variant exists in this vault.
 */
export async function readOpenLoops(): Promise<{ file: ParsedFile | null; groups: WorkGroup[] }> {
  const layout = getVaultLayout();
  const file = await firstReadable([
    ...hubCandidates(layout?.systemDir ?? null, "open-loops.md"),
    ...hubCandidates(layout?.systemDir ?? null, "loops.md"),
    ...hubCandidates(layout?.systemDir ?? null, "followups.md"),
  ]);
  if (!file) return { file: null, groups: [] };
  return { file, groups: parseWorkItems(file) };
}

/**
 * Read and parse an entity note by name.
 *
 * Probes the vault's entitiesDir first, then root / wiki-prefixed variants.
 * Returns null when no file matches in this vault.
 *
 * @param name  entity basename with or without trailing `.md`.
 */
export async function readEntity(name: string): Promise<EntityData | null> {
  const layout = getVaultLayout();
  const entitiesDir = layout?.entitiesDir ?? null;
  const candidates: string[] = [
    ...hubCandidates(entitiesDir, `${name}.md`),
    name.endsWith(".md") ? name : `${name}.md`,
    name,
  ].filter(Boolean) as string[];

  for (const path of candidates) {
    const file = await readVaultFile(path);
    if (file) return parseEntity(file);
  }
  return null;
}

/**
 * Read a monthly work log. Vault-specific folder scheme is unknown up-front,
 * so we probe the most common patterns in the probed workDir:
 *   <workDir>/log/<year>/<month>.md
 *   <workDir>/log/<month>-<year>.md
 *   <workDir>/<year>/<month>.md
 *   <workDir>/<month>-<year>.md
 *   <workDir>/<year>-<month>.md  (iso)
 */
/**
 * Returns `{ file: null, days: [] }` when no monthly log exists for this period.
 */
export async function readWorkLog(year: number, month: string): Promise<{ file: ParsedFile | null; days: WorkLogDay[] }> {
  const layout = getVaultLayout();
  const monthLower = month.toLowerCase();
  const monthNum = monthIndex(monthLower);
  const monthNumStr = monthNum >= 0 ? String(monthNum + 1).padStart(2, "0") : "";
  const candidates: (string | null)[] = layout?.workDir
    ? [
        inDir(layout.workDir, "log", String(year), `${monthLower}.md`),
        inDir(layout.workDir, "log", `${monthLower}-${year}.md`),
        inDir(layout.workDir, String(year), `${monthLower}.md`),
        inDir(layout.workDir, `${monthLower}-${year}.md`),
        monthNumStr ? inDir(layout.workDir, "log", `${year}-${monthNumStr}.md`) : null,
        monthNumStr ? inDir(layout.workDir, `${year}-${monthNumStr}.md`) : null,
      ]
    : [];
  // Legacy wiki/ fallbacks for vaults still using that scheme.
  candidates.push(`wiki/work/log/${year}/${monthLower}.md`);
  const file = await firstReadable(candidates);
  if (!file) return { file: null, days: [] };
  return { file, days: parseWorkLog(file) };
}

function monthIndex(m: string): number {
  const names = ["january","february","march","april","may","june","july","august","september","october","november","december"];
  const i = names.indexOf(m.toLowerCase());
  return i; // -1 when not found
}

/**
 * Read a weekly-summary file (e.g. W15 for a given year).
 *
 * Probes common folder layouts under the vault's workDir plus legacy
 * `wiki/work/weeks/` paths. Returns null when none resolve.
 */
export async function readWorkWeek(year: number, weekNum: number): Promise<ParsedFile | null> {
  const layout = getVaultLayout();
  const weekStr = `W${String(weekNum).padStart(2, "0")}`;
  const weekLower = `w${String(weekNum).padStart(2, "0")}`;
  const candidates: (string | null)[] = layout?.workDir
    ? [
        inDir(layout.workDir, "weeks", String(year), `${weekStr}.md`),
        inDir(layout.workDir, "weeks", String(year), `${weekLower}.md`),
        inDir(layout.workDir, "weeks", `${year}-${weekStr}.md`),
        inDir(layout.workDir, "weeks", `${year}-${weekLower}.md`),
      ]
    : [];
  candidates.push(`wiki/work/weeks/${year}/${weekStr}.md`);
  return firstReadable(candidates);
}

/**
 * Read a research project directory by name.
 *
 * Probes `<researchDir>/projects/<name>`, `<researchDir>/<name>`, and the
 * legacy `wiki/knowledge/research/projects/<name>`. Returns null when no
 * directory contains the canonical research files.
 */
export async function readResearchProject(name: string): Promise<ResearchProject | null> {
  const layout = getVaultLayout();
  const candidates: (string | null)[] = [
    inDir(layout?.researchDir ?? null, "projects", name),
    inDir(layout?.researchDir ?? null, name),
    `wiki/knowledge/research/projects/${name}`,
  ];
  for (const dir of candidates) {
    if (!dir) continue;
    const p = await parseResearchProject(dir);
    if (p) return p;
  }
  return null;
}
