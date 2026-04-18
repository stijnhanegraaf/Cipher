// Vault Reader — schema-aware parser for the Obsidian wiki vault
// Understands the vault structure, parses domain-specific formats,
// and provides navigation helpers for the view-builder layer.

import "server-only";
import { readFile, stat, readdir } from "fs/promises";
import { join } from "path";

// ─── Vault path (hot-swappable) ────────────────────────────────────────
// Initialized from VAULT_PATH env var OR common user-home candidates.
// Swap at runtime via setVaultPath() — all readers go through getVaultPath()
// so changes are picked up on the next call with no server restart.

function detectInitialVaultPath(): string | null {
  if (process.env.VAULT_PATH) return process.env.VAULT_PATH;
  const { existsSync } = require('fs');
  const homedir = require('os').homedir();
  const candidates = [
    join(process.cwd(), '..', 'Obsidian'),
    join(process.cwd(), 'Obsidian'),
    join(homedir, 'Obsidian'),
    join(homedir, 'Documents', 'Obsidian'),
    join(homedir, 'Projects', 'Obsidian'),
    join(homedir, 'Developer', 'Obsidian'),
  ];
  for (const p of candidates) {
    try { if (existsSync(p)) return p; } catch { /* ignore */ }
  }
  return null;
}

let _currentVaultPath: string | null = detectInitialVaultPath();

/** Returns the active vault path, or null when no vault is connected. */
export function getVaultPath(): string | null {
  return _currentVaultPath;
}

/** Hot-swap the active vault path without restarting the server. */
export function setVaultPath(path: string | null): void {
  _currentVaultPath = path;
  _layoutCache.clear();
  cache.clear();
  // Also clear the basename index used by resolveLink.
  _basenameIndex.clear();
}

/** Safe root getter for internal readers — returns "" when no vault is connected so callers short-circuit naturally. */
function VAULT_PATH_(): string {
  return _currentVaultPath || "";
}

// ─── Vault layout probe ────────────────────────────────────────────────
// Different Obsidian vaults have different folder structures. Probe the top-level
// layout once, cache the result per vault. Lets the app work with any vault tree.

export interface VaultLayout {
  root: string;
  hasWiki: boolean;
  entitiesDir: string | null;
  projectsDir: string | null;
  journalDir: string | null;
  researchDir: string | null;
  workDir: string | null;
  systemDir: string | null;
  hubFile: string | null;
}

const _layoutCache = new Map<string, VaultLayout>();

function firstExistingFolder(root: string, candidates: string[]): string | null {
  const { existsSync, statSync } = require('fs');
  for (const c of candidates) {
    try {
      const full = join(root, c);
      if (existsSync(full) && statSync(full).isDirectory()) return c;
    } catch { /* ignore */ }
  }
  return null;
}

function firstExistingFile(root: string, candidates: string[]): string | null {
  const { existsSync } = require('fs');
  for (const c of candidates) {
    try {
      if (existsSync(join(root, c))) return c;
    } catch { /* ignore */ }
  }
  return null;
}

export function getVaultLayout(): VaultLayout | null {
  const root = _currentVaultPath;
  if (!root) return null;
  const cached = _layoutCache.get(root);
  if (cached) return cached;

  const { existsSync, statSync } = require('fs');
  const wikiPath = join(root, 'wiki');
  const hasWiki = (() => {
    try { return existsSync(wikiPath) && statSync(wikiPath).isDirectory(); } catch { return false; }
  })();
  const prefixes = hasWiki ? ['wiki', ''] : [''];

  const findFolder = (names: string[]) => {
    for (const prefix of prefixes) {
      const result = firstExistingFolder(root, names.map((n) => prefix ? `${prefix}/${n}` : n));
      if (result) return result;
    }
    return null;
  };
  const findFile = (names: string[]) => {
    for (const prefix of prefixes) {
      const result = firstExistingFile(root, names.map((n) => prefix ? `${prefix}/${n}` : n));
      if (result) return result;
    }
    return null;
  };

  const layout: VaultLayout = {
    root,
    hasWiki,
    entitiesDir: findFolder(['knowledge/entities', 'entities', 'people', 'contacts']),
    projectsDir: findFolder(['projects', 'knowledge/projects']),
    journalDir: findFolder(['journal', 'daily', 'daily-notes']),
    researchDir: findFolder(['knowledge/research', 'research']),
    workDir: findFolder(['work', 'tasks']),
    systemDir: findFolder(['system']),
    hubFile: findFile(['dashboard.md', 'index.md', 'home.md', 'README.md']),
  };
  _layoutCache.set(root, layout);
  return layout;
}

// ─── Types ────────────────────────────────────────────────────────────

export interface ParsedFile {
  path: string;
  content: string;
  frontmatter: Record<string, unknown>;
  sections: Section[];
  mtime: number;
}

export interface Section {
  heading: string;
  level: number;
  body: string;
}

export interface CheckboxItem {
  text: string;
  checked: boolean;
  indent: number;
  lineIndex: number;
}

export interface KeyValuePairs {
  [key: string]: string;
}

export interface TableRow {
  [key: string]: string;
}

export interface TableData {
  headers: string[];
  rows: TableRow[];
}

export interface WorkGroup {
  heading: string;
  items: CheckboxItem[];
}

export interface StatusCheck {
  text: string;
  checked: boolean;
  /** Semantic label from the section this item belongs to */
  section: string;
}

export interface WorkLogDay {
  date: string;
  content: string;
}

export interface EntityData {
  name: string;
  path: string;
  frontmatter: Record<string, unknown>;
  coreFraming: string;
  seeAlso: ObsidianLink[];
  related: ObsidianLink[];
  content: string;
}

export interface ResearchProject {
  name: string;
  dirPath: string;
  executiveSummary: ParsedFile | null;
  deepDive: ParsedFile | null;
  keyPlayers: ParsedFile | null;
  openQuestions: ParsedFile | null;
}

export interface ObsidianLink {
  label: string;
  path: string;
}

export interface SearchResult {
  path: string;
  excerpt: string;
  score: number;
  kind: string;
}

export interface HubFile {
  name: string;
  path: string;
  file: ParsedFile | null;
}

// ─── In-memory cache ──────────────────────────────────────────────────

const cache = new Map<string, ParsedFile>();

// ─── Core read + parse ───────────────────────────────────────────────

export async function readVaultFile(relPath: string): Promise<ParsedFile | null> {
  const absPath = join(VAULT_PATH_(), relPath);
  try {
    const fileStat = await stat(absPath);
    const mtime = fileStat.mtimeMs;
    const cached = cache.get(relPath);
    if (cached && cached.mtime >= mtime) return cached;
    const raw = await readFile(absPath, "utf-8");
    const parsed = parseMarkdown(raw, relPath);
    parsed.mtime = mtime;
    cache.set(relPath, parsed);
    return parsed;
  } catch {
    return null;
  }
}

// ─── Parse markdown ───────────────────────────────────────────────────

function parseMarkdown(raw: string, relPath: string): ParsedFile {
  const { frontmatter, content } = extractFrontmatter(raw);
  const sections = extractSections(content);
  return { path: relPath, content, frontmatter, sections, mtime: 0 };
}

// ─── Frontmatter ─────────────────────────────────────────────────────

function extractFrontmatter(raw: string): { frontmatter: Record<string, unknown>; content: string } {
  const frontmatter: Record<string, unknown> = {};
  if (!raw.startsWith("---")) {
    return { frontmatter, content: raw };
  }
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return { frontmatter, content: raw };

  const fmText = raw.slice(3, end).trim();
  for (const line of fmText.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value: unknown = line.slice(colonIdx + 1).trim();
    if (value === "true") value = true;
    else if (value === "false") value = false;
    else if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value)) value = Number(value);
    else if (typeof value === "string" && value.startsWith("[") && value.endsWith("]")) {
      try { value = JSON.parse(value.replace(/'/g, '"')); } catch { /* keep as string */ }
    }
    frontmatter[key] = value;
  }
  const content = raw.slice(end + 4).trimStart();
  return { frontmatter, content };
}

// ─── Sections ─────────────────────────────────────────────────────────

function extractSections(content: string): Section[] {
  const lines = content.split("\n");
  const sections: Section[] = [];
  let current: Section | null = null;

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      current = { heading: headingMatch[2].trim(), level: headingMatch[1].length, body: "" };
      sections.push(current);
    } else if (current) {
      current.body += (current.body ? "\n" : "") + line;
    }
  }
  return sections;
}

export function getSection(file: ParsedFile, heading: string): Section | undefined {
  return file.sections.find(s => s.heading.toLowerCase() === heading.toLowerCase());
}

export function getSectionsByPrefix(file: ParsedFile, prefix: string): Section[] {
  return file.sections.filter(s => s.heading.toLowerCase().startsWith(prefix.toLowerCase()));
}

// ─── Checkbox parsing ─────────────────────────────────────────────────

export function parseCheckboxes(text: string): CheckboxItem[] {
  const items: CheckboxItem[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(\s*)-\s*\[([ xX])\]\s*(.+)/);
    if (match) {
      items.push({
        text: match[3].trim(),
        checked: match[2] !== " ",
        indent: match[1].length,
        lineIndex: i,
      });
    }
  }
  return items;
}

// ─── Key-value parsing ────────────────────────────────────────────────

export function parseKeyValuePairs(text: string): KeyValuePairs {
  const pairs: KeyValuePairs = {};
  for (const line of text.split("\n")) {
    const kvMatch = line.match(/^\s*-\s+(.+?):\s+(.+)/);
    if (kvMatch) {
      pairs[kvMatch[1].trim()] = kvMatch[2].trim();
    }
    const tableMatch = line.match(/^\|\s*(.+?)\s*\|\s*(.+?)\s*\|/);
    if (tableMatch && tableMatch[1] !== "" && !tableMatch[1].includes("---")) {
      pairs[tableMatch[1].trim()] = tableMatch[2].trim();
    }
  }
  return pairs;
}

// ─── Markdown table parsing ───────────────────────────────────────────

export function parseTable(text: string): TableData {
  const lines = text.split("\n").filter(l => l.trim().startsWith("|"));
  if (lines.length < 2) return { headers: [], rows: [] };

  // Parse headers from first row
  const headers = lines[0]
    .split("|")
    .map(c => c.trim())
    .filter(c => c.length > 0);

  // Find the separator row (contains ---)
  let dataStart = 1;
  if (dataStart < lines.length && lines[dataStart].match(/^\|[\s\-:]+\|/)) {
    dataStart = 2;
  }

  const rows: TableRow[] = [];
  for (let i = dataStart; i < lines.length; i++) {
    const cells = lines[i]
      .split("|")
      .map(c => c.trim())
      .filter(c => c.length > 0);

    if (cells.length === 0) continue;

    const row: TableRow = {};
    headers.forEach((h, idx) => {
      row[h] = cells[idx]?.trim() ?? "";
    });
    rows.push(row);
  }

  return { headers, rows };
}

// ─── Link extraction ─────────────────────────────────────────────────

export function extractLinks(text: string): ObsidianLink[] {
  const links: ObsidianLink[] = [];
  // Regex: capture [[path]] or [[path|label]].
  // In markdown tables, \| escapes the pipe delimiter so it doesn't split
  // the table cell. Obsidian writes [[link\|label]] in tables.
  // Character class [^\]|] is actually [^\\]|] in source — "not \ or ] or |".
  // But in JS regex, [^\\]|] parses as [^\\] (not backslash) then |] outside.
  // Fix: use [^\]\\|] to correctly mean "not ] \ |".
  const re = /\[\[([^\]\\|]+?)(?:\|([^\]]+?))?\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const rawPath = match[1].trim().replace(/\\+$/, '');
    const rawLabel = (match[2] || match[1]).trim();
    if (rawPath) {
      links.push({ path: rawPath, label: rawLabel });
    }
  }
  return links;
}

// ─── Work items: ### groups with checkboxes ──────────────────────────

export function parseWorkItems(file: ParsedFile): WorkGroup[] {
  const groups: WorkGroup[] = [];
  let currentGroup: WorkGroup | null = null;

  for (const section of file.sections) {
    if (section.level === 3) {
      // ### headings are task groups
      currentGroup = { heading: section.heading, items: [] };
      groups.push(currentGroup);
    } else if (section.level <= 2) {
      // ## or # headings reset context (no longer in a group)
      // But we still extract checkboxes from them as their own groups
      // Actually, let's also capture ## level groups
      if (section.level <= 1) {
        currentGroup = null;
        continue;
      }
      // level 2 sections can also have checkboxes
      currentGroup = { heading: section.heading, items: [] };
      groups.push(currentGroup);
    }

    if (currentGroup) {
      currentGroup.items.push(...parseCheckboxes(section.body));
    }
  }

  return groups;
}

// ─── Status checks: at-a-glance items with semantic meaning ──────────

export function parseStatusChecks(file: ParsedFile): StatusCheck[] {
  const items: StatusCheck[] = [];

  for (const section of file.sections) {
    const checkboxes = parseCheckboxes(section.body);
    for (const cb of checkboxes) {
      items.push({
        text: cb.text,
        checked: cb.checked,
        section: section.heading,
      });
    }
  }

  return items;
}

// ─── Work log: daily entries with ### date headings ──────────────────

export function parseWorkLog(file: ParsedFile): WorkLogDay[] {
  const days: WorkLogDay[] = [];

  for (const section of file.sections) {
    // Date headings are ### with date-like content (YYYY-MM-DD or month day format)
    if (section.level === 3 && looksLikeDate(section.heading)) {
      days.push({
        date: section.heading,
        content: section.body.trim(),
      });
    }
  }

  return days;
}

function looksLikeDate(heading: string): boolean {
  // Matches YYYY-MM-DD, "Month Day", "Month Day, Year", "Day Month Year"
  if (/^\d{4}-\d{2}-\d{2}/.test(heading)) return true;
  const months = /^(January|February|March|April|May|June|July|August|September|October|November|December)/i;
  if (months.test(heading)) return true;
  // "Mon DD" pattern like "Apr 14"
  if (/^\w{3}\s+\d{1,2}/.test(heading)) return true;
  return false;
}

// ─── Entity parsing ──────────────────────────────────────────────────

export async function parseEntity(file: ParsedFile): Promise<EntityData> {
  const name = file.path.split("/").pop()?.replace(/\.md$/, "") || "";
  let coreFraming = "";
  const seeAlso: ObsidianLink[] = [];
  const related: ObsidianLink[] = [];

  for (const section of file.sections) {
    const headingLower = section.heading.toLowerCase();

    if (headingLower === "core framing") {
      coreFraming = section.body.trim();
    } else if (headingLower === "see also") {
      seeAlso.push(...extractLinks(section.body));
    } else if (headingLower === "related") {
      related.push(...extractLinks(section.body));
    }
  }

  return {
    name,
    path: file.path,
    frontmatter: file.frontmatter,
    coreFraming,
    seeAlso,
    related,
    content: file.content,
  };
}

// ─── Research project parsing ─────────────────────────────────────────

const RESEARCH_OUTPUT_FILES = [
  "executive-summary.md",
  "deep-dive.md",
  "key-players.md",
  "open-questions.md",
] as const;

export async function parseResearchProject(dirRelPath: string): Promise<ResearchProject | null> {
  const name = dirRelPath.split("/").pop() || "";

  const [executiveSummary, deepDive, keyPlayers, openQuestions] = await Promise.all([
    readVaultFile(join(dirRelPath, "executive-summary.md")),
    readVaultFile(join(dirRelPath, "deep-dive.md")),
    readVaultFile(join(dirRelPath, "key-players.md")),
    readVaultFile(join(dirRelPath, "open-questions.md")),
  ]);

  // If none of the files exist, this isn't a valid project
  if (!executiveSummary && !deepDive && !keyPlayers && !openQuestions) {
    return null;
  }

  return {
    name,
    dirPath: dirRelPath,
    executiveSummary,
    deepDive,
    keyPlayers,
    openQuestions,
  };
}

// ─── Vault navigation ────────────────────────────────────────────────

/**
 * Resolve an Obsidian [[link]] to an actual vault file path.
 * Tries multiple strategies: direct, with wiki/ prefix, with .md suffix, combinations.
 */
// Basename index: basename (lowercased, sans .md) → list of relative paths.
// Built once per vault, walked depth-bounded. Invalidated on setVaultPath.
const _basenameIndex = new Map<string, Map<string, string[]>>();

async function buildBasenameIndex(root: string): Promise<Map<string, string[]>> {
  const cached = _basenameIndex.get(root);
  if (cached) return cached;
  const index = new Map<string, string[]>();
  // Bounded walk: depth 5 is plenty for normal vaults (wiki/knowledge/entities/foo/bar.md).
  async function walk(dir: string, relDir: string, depth: number) {
    if (depth > 5) return;
    let entries: Array<{ name: string; isFile: boolean; isDir: boolean }> = [];
    try {
      const rawEntries = await readdir(join(root, relDir || "."), { withFileTypes: true });
      entries = rawEntries
        .filter((e) => !e.name.startsWith("."))
        .map((e) => ({ name: e.name, isFile: e.isFile(), isDir: e.isDirectory() }));
    } catch { return; }
    for (const entry of entries) {
      const nextRel = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (entry.isFile && entry.name.toLowerCase().endsWith(".md")) {
        const base = entry.name.slice(0, -3).toLowerCase();
        const list = index.get(base);
        if (list) list.push(nextRel);
        else index.set(base, [nextRel]);
      } else if (entry.isDir) {
        // Skip node_modules, .git, .obsidian etc.
        if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".obsidian") continue;
        await walk(join(root, nextRel), nextRel, depth + 1);
      }
    }
  }
  await walk(root, "", 0);
  _basenameIndex.set(root, index);
  return index;
}

/**
 * Resolve any user-facing link reference to an actual vault-relative file path.
 *
 * Resolution order:
 *   1. Direct existence check (linkPath, linkPath + .md).
 *   2. Every probed section folder + linkPath + .md (e.g. entitiesDir/foo.md).
 *   3. Root + wiki/ prefix with the same.
 *   4. Basename index fallback — full vault walk, case-insensitive match.
 *
 * On ambiguity, prefer the shortest resolved path.
 */
export async function resolveLink(linkPath: string): Promise<string | null> {
  const root = VAULT_PATH_();
  if (!root || !linkPath) return null;

  // Strip section anchors (e.g. "work/open#section")
  const [pathPart, anchor] = linkPath.split("#");
  const trimmed = pathPart.trim().replace(/^\/+/, "");
  if (!trimmed) return null;

  const layout = getVaultLayout();
  const hasSlash = trimmed.includes("/");

  // Tier 1: exact matches.
  const direct = [trimmed, trimmed.endsWith(".md") ? null : trimmed + ".md"].filter(Boolean) as string[];

  // Tier 2 + 3: prefixed paths.
  const prefixed: string[] = [];
  const base = trimmed.endsWith(".md") ? trimmed : trimmed + ".md";

  // For short names (no slash), probe each layout section folder.
  if (!hasSlash && layout) {
    for (const dir of [
      layout.entitiesDir,
      layout.projectsDir,
      layout.journalDir,
      layout.researchDir,
      layout.workDir,
      layout.systemDir,
    ]) {
      if (dir) prefixed.push(`${dir}/${base}`);
    }
  }

  // Always try wiki/ prefix — most vault content lives under wiki/.
  // This fixes paths like "knowledge/research/lenses/contrarian" which
  // need the wiki/ prefix but were skipped because they contain a slash.
  if (layout?.hasWiki) prefixed.push(`wiki/${base}`);
  // Also try the bare path (for vaults without wiki/ structure).
  prefixed.push(base);

  for (const candidate of [...direct, ...prefixed]) {
    try {
      const s = await stat(join(root, candidate));
      if (s.isFile()) return anchor ? candidate + "#" + anchor : candidate;
    } catch { /* next */ }
  }

  // Tier 4: basename index. Case-insensitive fallback for any link.
  // For paths with slashes, match the final segment and prefer structural matches.
  try {
    const index = await buildBasenameIndex(root);
    const lastSegment = (trimmed.includes("/") ? trimmed.split("/").pop() : trimmed) || trimmed;
    const key = (lastSegment.endsWith(".md") ? lastSegment.slice(0, -3) : lastSegment).toLowerCase();
    const hits = index.get(key);
    if (hits && hits.length > 0) {
      // For nested paths (e.g. "knowledge/research/lenses/contrarian"),
      // prefer hits that match the full path structure.
      const fullKey = trimmed.toLowerCase().replace(/\.md$/, "");
      const structuralMatch = hits.find(h => h.toLowerCase().includes(fullKey));
      const best = structuralMatch || [...hits].sort((a, b) => a.length - b.length)[0];
      return anchor ? best + "#" + anchor : best;
    }
  } catch { /* fall through */ }

  return null;
}

/** Internal: invalidated by setVaultPath (already wired in this module). */
function _invalidateResolverCaches() {
  _basenameIndex.clear();
}

/** Return the three hub files: dashboard, index, home */
export async function getHubFiles(): Promise<HubFile[]> {
  const hubs = [
    { name: "Dashboard", path: "wiki/dashboard.md" },
    { name: "Index", path: "wiki/index.md" },
    { name: "Home", path: "wiki/home.md" },
  ];

  const results: HubFile[] = [];
  for (const hub of hubs) {
    const file = await readVaultFile(hub.path);
    results.push({ name: hub.name, path: hub.path, file });
  }
  return results;
}

/** List all entity files from wiki/knowledge/entities/ as IndexEntry[] */
export async function getEntityIndex(): Promise<import("./view-models").IndexEntry[]> {
  const paths = await listVaultFiles("wiki/knowledge/entities");
  const results: import("./view-models").IndexEntry[] = [];
  for (const p of paths) {
    const name = p.split("/").pop()?.replace(".md", "") || "";
    if (name === "entities") continue; // skip hub file
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

/** List all journal entries as IndexEntry[] */
export async function getJournalIndex(): Promise<import("./view-models").IndexEntry[]> {
  const paths = await listVaultFiles("wiki/journal");
  return paths
    .filter((p) => p.endsWith(".md") && !p.endsWith("journal.md"))
    .map((p) => {
      const name = p.split("/").pop()?.replace(".md", "") || "";
      return { name, path: p };
    });
}

/** List all project files from wiki/projects/ (top-level .md only) as IndexEntry[] */
export async function getProjectIndex(): Promise<import("./view-models").IndexEntry[]> {
  const entries = await readdir(join(VAULT_PATH_(), "wiki/projects")).catch(() => [] as string[]);
  const results: import("./view-models").IndexEntry[] = [];
  for (const e of entries) {
    if (!e.endsWith(".md")) continue;
    const name = e.replace(".md", "");
    if (name === "projects" || name === "ideas") continue; // skip hub files
    const p = "wiki/projects/" + e;
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

/** List all research project directories as ResearchProject[] */
export async function getResearchProjects(): Promise<import("./view-models").ResearchProject[]> {
  const absDir = join(VAULT_PATH_(), "wiki/knowledge/research/projects");
  try {
    const entries = await readdir(absDir, { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory() && !e.name.startsWith("."))
      .map(e => ({
        name: e.name.replace(/-/g, " "),
        dir: "wiki/knowledge/research/projects/" + e.name,
      }));
  } catch {
    return [];
  }
}

// ─── Schema-aware convenience readers ─────────────────────────────────

/** Read and parse wiki/work/open.md with group structure */
export async function readWorkOpen(): Promise<{ file: ParsedFile | null; groups: WorkGroup[] }> {
  const file = await readVaultFile("wiki/work/open.md");
  if (!file) return { file: null, groups: [] };
  return { file, groups: parseWorkItems(file) };
}

/** Read and parse wiki/work/waiting-for.md */
export async function readWorkWaitingFor(): Promise<{ file: ParsedFile | null; groups: WorkGroup[] }> {
  const file = await readVaultFile("wiki/work/waiting-for.md");
  if (!file) return { file: null, groups: [] };
  return { file, groups: parseWorkItems(file) };
}

/** Read and parse wiki/system/status.md with semantic status checks */
export async function readSystemStatus(): Promise<{ file: ParsedFile | null; checks: StatusCheck[] }> {
  const file = await readVaultFile("wiki/system/status.md");
  if (!file) return { file: null, checks: [] };
  return { file, checks: parseStatusChecks(file) };
}

/** Read wiki/system/open-loops.md */
export async function readOpenLoops(): Promise<{ file: ParsedFile | null; groups: WorkGroup[] }> {
  const file = await readVaultFile("wiki/system/open-loops.md");
  if (!file) return { file: null, groups: [] };
  return { file, groups: parseWorkItems(file) };
}

/** Read an entity file and parse it into structured EntityData */
export async function readEntity(name: string): Promise<EntityData | null> {
  // Try direct path first, then common locations
  const candidates = [
    `wiki/knowledge/entities/${name}.md`,
    `wiki/knowledge/entities/${name}`,
    name.endsWith(".md") ? name : null,
    name,
  ].filter(Boolean) as string[];

  for (const path of candidates) {
    const file = await readVaultFile(path);
    if (file) return parseEntity(file);
  }
  return null;
}


/** Read a monthly work log */
export async function readWorkLog(year: number, month: string): Promise<{ file: ParsedFile | null; days: WorkLogDay[] }> {
  const monthLower = month.toLowerCase();
  const file = await readVaultFile(`wiki/work/log/${year}/${monthLower}.md`);
  if (!file) return { file: null, days: [] };
  return { file, days: parseWorkLog(file) };
}

/** Read a weekly work summary */
export async function readWorkWeek(year: number, weekNum: number): Promise<ParsedFile | null> {
  const weekStr = `W${String(weekNum).padStart(2, "0")}`;
  return readVaultFile(`wiki/work/weeks/${year}/${weekStr}.md`);
}

/** Read a research project and all its output files */
export async function readResearchProject(name: string): Promise<ResearchProject | null> {
  return parseResearchProject(`wiki/knowledge/research/projects/${name}`);
}

// ─── Directory listing ───────────────────────────────────────────────

export async function listVaultFiles(dirRelPath: string, extension = ".md"): Promise<string[]> {
  const absDir = join(VAULT_PATH_(), dirRelPath);
  try {
    const entries = await readdir(absDir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const fullRel = join(dirRelPath, entry.name);
      if (entry.isFile() && entry.name.endsWith(extension)) {
        files.push(fullRel);
      } else if (entry.isDirectory() && !entry.name.startsWith(".")) {
        const sub = await listVaultFiles(fullRel, extension);
        files.push(...sub);
      }
    }
    return files;
  } catch {
    return [];
  }
}

// ─── Full-text search across vault ────────────────────────────────────

export async function searchVault(
  query: string,
  maxResults = 20
): Promise<SearchResult[]> {
  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  if (terms.length === 0) return [];

  const dirs = [
    "wiki/work",
    "wiki/system",
    "wiki/knowledge",
    "wiki/projects",
    "wiki/memory",
    "wiki/journal",
    "wiki/private",
  ];

  const allFiles = new Set<string>();
  for (const dir of dirs) {
    const files = await listVaultFiles(dir);
    for (const f of files) allFiles.add(f);
  }

  const results: SearchResult[] = [];

  for (const filePath of Array.from(allFiles)) {
    const file = await readVaultFile(filePath);
    if (!file) continue;

    const content = file.content.toLowerCase();
    const headingText = file.sections.map(s => s.heading.toLowerCase()).join(" ");
    const combined = content + " " + headingText;

    let score = 0;
    for (const term of terms) {
      const headingCount = (headingText.match(new RegExp(term, "g")) || []).length;
      const contentCount = (content.match(new RegExp(term, "g")) || []).length;
      score += headingCount * 3 + contentCount;
    }

    if (score > 0) {
      const firstTerm = terms[0];
      const idx = content.indexOf(firstTerm);
      const start = Math.max(0, idx - 60);
      const end = Math.min(content.length, idx + firstTerm.length + 80);
      const excerpt = (start > 0 ? "…" : "") + content.slice(start, end).replace(/\n/g, " ") + (end < content.length ? "…" : "");

      let kind = "note";
      if (filePath.includes("entity")) kind = "entity";
      else if (filePath.includes("project")) kind = "project";
      else if (filePath.includes("research")) kind = "research";
      else if (filePath.includes("system")) kind = "system";

      results.push({ path: filePath, excerpt, score, kind });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, maxResults);
}

// ─── Clear cache ──────────────────────────────────────────────────────

export function clearCache(): void {
  cache.clear();
}