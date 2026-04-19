/**
 * Vault index listings — hub files, entities, journal, projects, research
 * projects, and recursive file listing. Each respects the probed layout.
 */

import { readdir } from "fs/promises";
import { join } from "path";
import type { ParsedFile, HubFile } from "./vault-reader";
import { readVaultFile, getVaultLayout, getVaultPath } from "./vault-reader";
import { listVaultFiles } from "./vault-search";

// Local root accessor to avoid coupling to the private VAULT_PATH_ helper.
function rootOrEmpty(): string {
  return getVaultPath() || "";
}


/** Return hub files (dashboard / index / home / README) from wherever they live. */
export async function getHubFiles(): Promise<HubFile[]> {
  const layout = getVaultLayout();
  const names: Array<{ name: string; fileCandidates: string[] }> = [
    { name: "Dashboard", fileCandidates: ["dashboard.md", "Dashboard.md"] },
    { name: "Index",     fileCandidates: ["index.md", "Index.md", "README.md"] },
    { name: "Home",      fileCandidates: ["home.md", "Home.md"] },
  ];
  const results: HubFile[] = [];
  for (const { name, fileCandidates } of names) {
    // Probe the hubFile if the layout detected one, plus every named
    // variant at root / layout.root / wiki/ prefixed paths.
    const probePaths: string[] = [];
    if (layout?.hubFile) probePaths.push(layout.hubFile);
    for (const fn of fileCandidates) {
      probePaths.push(fn);
      probePaths.push(`wiki/${fn}`);
    }
    let match: { path: string; file: ParsedFile } | null = null;
    for (const p of probePaths) {
      const file = await readVaultFile(p);
      if (file) { match = { path: p, file }; break; }
    }
    results.push({ name, path: match?.path ?? fileCandidates[0], file: match?.file ?? null });
  }
  return results;
}

/** List all entity files from the probed entities directory. */
export async function getEntityIndex(): Promise<import("./view-models").IndexEntry[]> {
  const layout = getVaultLayout();
  if (!layout?.entitiesDir) return [];
  const paths = await listVaultFiles(layout.entitiesDir);
  const results: import("./view-models").IndexEntry[] = [];
  const hubBasename = layout.entitiesDir.split("/").pop() || "";
  for (const p of paths) {
    const name = p.split("/").pop()?.replace(".md", "") || "";
    if (name === hubBasename) continue; // skip a file that matches the dir name (hub convention)
    let area: string | undefined;
    let type: string | undefined;
    try {
      const file = await readVaultFile(p);
      if (file) {
        area = file.frontmatter.area as string | undefined;
        type = file.frontmatter.type as string | undefined;
      }
    } catch {}
    results.push({ name, path: p, area, type });
  }
  return results;
}

/** List all journal entries as IndexEntry[]. */
export async function getJournalIndex(): Promise<import("./view-models").IndexEntry[]> {
  const layout = getVaultLayout();
  if (!layout?.journalDir) return [];
  const paths = await listVaultFiles(layout.journalDir);
  const hubBasename = layout.journalDir.split("/").pop() || "";
  return paths
    .filter((p) => p.endsWith(".md") && !p.endsWith(`${hubBasename}.md`))
    .map((p) => {
      const name = p.split("/").pop()?.replace(".md", "") || "";
      return { name, path: p };
    });
}

/** List all project files (top-level .md only) as IndexEntry[]. */
export async function getProjectIndex(): Promise<import("./view-models").IndexEntry[]> {
  const layout = getVaultLayout();
  if (!layout?.projectsDir) return [];
  const entries = await readdir(join(rootOrEmpty(), layout.projectsDir)).catch(() => [] as string[]);
  const results: import("./view-models").IndexEntry[] = [];
  const hubBasename = layout.projectsDir.split("/").pop() || "";
  // Common "hub" filenames that describe the folder rather than an item.
  const SKIP_NAMES = new Set([hubBasename, "index", "readme", "ideas", "projects"]);
  for (const e of entries) {
    if (!e.endsWith(".md")) continue;
    const name = e.replace(".md", "");
    if (SKIP_NAMES.has(name.toLowerCase())) continue;
    const p = `${layout.projectsDir}/${e}`;
    let area: string | undefined;
    let type: string | undefined;
    try {
      const file = await readVaultFile(p);
      if (file) {
        area = file.frontmatter.area as string | undefined;
        type = file.frontmatter.type as string | undefined;
      }
    } catch {}
    results.push({ name, path: p, area, type });
  }
  return results;
}

/**
 * List all research project directories. Looks first in
 * `<researchDir>/projects/`, then in `<researchDir>/` itself (for vaults
 * that use the research dir as the flat project list).
 */
export async function getResearchProjects(): Promise<import("./view-models").ResearchProject[]> {
  const layout = getVaultLayout();
  if (!layout?.researchDir) return [];
  const candidates = [`${layout.researchDir}/projects`, layout.researchDir];
  for (const dir of candidates) {
    const absDir = join(rootOrEmpty(), dir);
    try {
      const entries = await readdir(absDir, { withFileTypes: true });
      const dirs = entries
        .filter((e) => e.isDirectory() && !e.name.startsWith(".") && e.name !== "projects")
        .map((e) => ({ name: e.name.replace(/-/g, " "), dir: `${dir}/${e.name}` }));
      if (dirs.length > 0) return dirs;
    } catch { /* try next candidate */ }
  }
  return [];
}
