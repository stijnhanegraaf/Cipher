/**
 * Reads and parses an Obsidian-style markdown vault.
 *
 * Hot-swappable vault path, layout probe (entities/journal/projects/...),
 * schema-aware readers, wiki-link resolver with basename fallback. Every
 * downstream module (view-builder, vault-health, vault-graph) goes through
 * the helpers here — nothing bypasses this file to touch the filesystem.
 */

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

/**
 * Hot-swap the active vault path without restarting the server.
 *
 * Clears all in-memory caches (layout probe, parsed-file cache, basename
 * index) so the next read reflects the new vault. Pass null to disconnect.
 */
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

/**
 * Probe the active vault's top-level folder structure.
 *
 * Three-tier detection, memoised per-vault:
 *   1. Explicit override — `<vault>/.cipher/layout.json` if present. Any
 *      field set there wins; unset fields fall through.
 *   2. Name-based probe — matches common folder names (entities / people
 *      / contacts, journal / daily / diary, projects, research, work /
 *      tasks, system, notes / logs / …).
 *   3. Content heuristics — for any role still unset, scans top-level
 *      folders and classifies by what's inside (YYYY-MM-DD filenames →
 *      journal, subdirs with executive-summary.md → research, …).
 *
 * Cache cleared by setVaultPath(). Returns null when no vault connected.
 */
export function getVaultLayout(): VaultLayout | null {
  const root = _currentVaultPath;
  if (!root) return null;
  const cached = _layoutCache.get(root);
  if (cached) return cached;

  const { existsSync, statSync, readFileSync, readdirSync } = require('fs');
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

  // ── Tier 1: explicit override ────────────────────────────────────
  let override: Partial<VaultLayout> = {};
  try {
    const overridePath = join(root, '.cipher', 'layout.json');
    if (existsSync(overridePath)) {
      const raw = readFileSync(overridePath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<VaultLayout>;
      // Keep only string / null / boolean values from the schema — silently
      // ignore junk keys.
      override = {
        entitiesDir: typeof parsed.entitiesDir === 'string' ? parsed.entitiesDir : undefined,
        projectsDir: typeof parsed.projectsDir === 'string' ? parsed.projectsDir : undefined,
        journalDir:  typeof parsed.journalDir  === 'string' ? parsed.journalDir  : undefined,
        researchDir: typeof parsed.researchDir === 'string' ? parsed.researchDir : undefined,
        workDir:     typeof parsed.workDir     === 'string' ? parsed.workDir     : undefined,
        systemDir:   typeof parsed.systemDir   === 'string' ? parsed.systemDir   : undefined,
        hubFile:     typeof parsed.hubFile     === 'string' ? parsed.hubFile     : undefined,
      } as Partial<VaultLayout>;
    }
  } catch { /* malformed override — silently fall back */ }

  // ── Tier 2: name-based probe ─────────────────────────────────────
  const ENTITY_NAMES   = ['knowledge/entities', 'entities', 'people', 'contacts', 'companies'];
  const PROJECT_NAMES  = ['projects', 'knowledge/projects'];
  const JOURNAL_NAMES  = ['journal', 'daily', 'daily-notes', 'diary', 'days'];
  const RESEARCH_NAMES = ['knowledge/research', 'research', 'literature'];
  const WORK_NAMES     = ['work', 'tasks', 'todo', 'todos'];
  const SYSTEM_NAMES   = ['system', 'meta', 'ops'];
  const HUB_FILES      = ['dashboard.md', 'index.md', 'home.md', 'README.md'];

  const byName: Partial<VaultLayout> = {
    entitiesDir: findFolder(ENTITY_NAMES),
    projectsDir: findFolder(PROJECT_NAMES),
    journalDir:  findFolder(JOURNAL_NAMES),
    researchDir: findFolder(RESEARCH_NAMES),
    workDir:     findFolder(WORK_NAMES),
    systemDir:   findFolder(SYSTEM_NAMES),
    hubFile:     findFile(HUB_FILES),
  };

  // ── Tier 3: content heuristics ───────────────────────────────────
  // Called only when a field is still null after override + name probe.
  const inferFromContent = (): Partial<VaultLayout> => {
    const out: Partial<VaultLayout> = {};
    const seen = new Set(
      [byName.entitiesDir, byName.projectsDir, byName.journalDir, byName.researchDir, byName.workDir, byName.systemDir]
        .filter((d): d is string => !!d)
    );

    // Candidate folders = every top-level dir under root, plus every
    // top-level dir under wiki/ if that exists. Up to ~30 dirs in practice.
    const candidates: string[] = [];
    const pushDirs = (base: string, prefix: string) => {
      try {
        for (const e of readdirSync(base, { withFileTypes: true })) {
          if (!e.isDirectory()) continue;
          if (e.name.startsWith('.') || e.name === 'node_modules') continue;
          const rel = prefix ? `${prefix}/${e.name}` : e.name;
          if (seen.has(rel)) continue;
          candidates.push(rel);
        }
      } catch { /* ignore */ }
    };
    pushDirs(root, '');
    if (hasWiki) pushDirs(join(root, 'wiki'), 'wiki');

    for (const dir of candidates) {
      const abs = join(root, dir);
      let entries: import('fs').Dirent[];
      try { entries = readdirSync(abs, { withFileTypes: true }); } catch { continue; }

      const files = entries.filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.md'));
      const subs = entries.filter((e) => e.isDirectory() && !e.name.startsWith('.'));
      const fileNames = files.map((f) => f.name);

      // Journal: three or more YYYY-MM-DD.md files.
      if (!out.journalDir && !byName.journalDir) {
        const dated = fileNames.filter((n) => /^\d{4}-\d{2}-\d{2}\.md$/i.test(n));
        if (dated.length >= 3) { out.journalDir = dir; continue; }
      }

      // Research: at least one sub-dir contains executive-summary.md.
      if (!out.researchDir && !byName.researchDir) {
        const hit = subs.some((s) => {
          try {
            return existsSync(join(abs, s.name, 'executive-summary.md'));
          } catch { return false; }
        });
        if (hit) { out.researchDir = dir; continue; }
      }

      // Work: a known work-file lives at the top of this dir.
      if (!out.workDir && !byName.workDir) {
        const lc = new Set(fileNames.map((n) => n.toLowerCase()));
        if (lc.has('open.md') || lc.has('waiting-for.md') || lc.has('now.md') || lc.has('today.md')) {
          out.workDir = dir; continue;
        }
      }

      // System: status / health / open-loops at the top.
      if (!out.systemDir && !byName.systemDir) {
        const lc = new Set(fileNames.map((n) => n.toLowerCase()));
        if (lc.has('status.md') || lc.has('health.md') || lc.has('open-loops.md')) {
          out.systemDir = dir; continue;
        }
      }

      // Entity / project heuristic — peek at a few files' frontmatter.
      if ((!out.entitiesDir && !byName.entitiesDir) || (!out.projectsDir && !byName.projectsDir)) {
        // Only consider flat folders (mostly .md files, no deep substructure).
        if (files.length < 3) continue;
        let entityHits = 0, projectHits = 0;
        for (const f of files.slice(0, 10)) {
          try {
            const head = readFileSync(join(abs, f.name), 'utf-8').slice(0, 600);
            if (!head.startsWith('---')) continue;
            const fm = head.slice(3, head.indexOf('\n---', 3));
            if (/^\s*type:\s*(entity|person|company)/mi.test(fm)) entityHits++;
            if (/^\s*type:\s*(project|plan|initiative)/mi.test(fm) || /^\s*status:\s*/mi.test(fm)) projectHits++;
          } catch { /* ignore */ }
        }
        if (entityHits >= 2 && !out.entitiesDir && !byName.entitiesDir) { out.entitiesDir = dir; continue; }
        if (projectHits >= 2 && !out.projectsDir && !byName.projectsDir) { out.projectsDir = dir; continue; }
      }
    }

    return out;
  };

  const byContent = inferFromContent();

  // ── Compose final layout: override > name > content ──────────────
  const pick = (field: keyof VaultLayout): string | null => {
    const o = (override as Record<string, unknown>)[field as string];
    if (typeof o === 'string') return o;
    const n = (byName as Record<string, unknown>)[field as string];
    if (typeof n === 'string') return n;
    const c = (byContent as Record<string, unknown>)[field as string];
    if (typeof c === 'string') return c;
    return null;
  };

  const layout: VaultLayout = {
    root,
    hasWiki,
    entitiesDir: pick('entitiesDir'),
    projectsDir: pick('projectsDir'),
    journalDir:  pick('journalDir'),
    researchDir: pick('researchDir'),
    workDir:     pick('workDir'),
    systemDir:   pick('systemDir'),
    hubFile:     pick('hubFile'),
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

/**
 * Read and parse a vault-relative markdown file.
 *
 * Uses an in-memory cache keyed on the relative path and invalidated
 * via mtime, so repeated reads of an unchanged file are cheap. Returns
 * null when the file does not exist or cannot be read (does not throw).
 *
 * @param relPath  path relative to the vault root, e.g. `"wiki/foo.md"`.
 */
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

/** Find a section by exact (case-insensitive) heading. Returns undefined when no match. */
export function getSection(file: ParsedFile, heading: string): Section | undefined {
  return file.sections.find(s => s.heading.toLowerCase() === heading.toLowerCase());
}

/** All sections whose headings start with the given prefix (case-insensitive). Returns [] when none match. */
export function getSectionsByPrefix(file: ParsedFile, prefix: string): Section[] {
  return file.sections.filter(s => s.heading.toLowerCase().startsWith(prefix.toLowerCase()));
}

// ─── Checkbox parsing ─────────────────────────────────────────────────

/** Parse `- [ ]` / `- [x]` list items from raw markdown. Returns [] on malformed or empty input. */
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

/**
 * Parse `- key: value` bullets and two-column markdown tables into a flat map.
 *
 * Tolerant: accepts either bullets or table rows, drops anything that
 * doesn't match. Returns {} on empty/malformed input.
 */
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

/**
 * Parse a markdown table, keying each row by its column header.
 *
 * Expects pipe-delimited rows. Returns `{ headers: [], rows: [] }` if the
 * input doesn't contain a recognisable table.
 */
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

/**
 * Extract all `[[wiki-link]]` references from markdown text.
 *
 * Tolerant of escaped pipes inside table cells (e.g. `[[foo\|Alias]]`).
 * Returns [] on malformed or link-free input; never throws.
 */
export function extractLinks(text: string): ObsidianLink[] {
  const links: ObsidianLink[] = [];
  // Character class [^\]\\|] correctly excludes ], \, and | so an escaped
  // pipe inside a Markdown table (e.g. [[work/work\|Work]]) terminates the
  // path at `work/work` instead of letting the trailing `\` leak into the
  // captured path. Safety net: strip any residual trailing backslash from
  // both path and label.
  const re = /\[\[([^\]\\|]+?)(?:\|([^\]]+?))?\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const rawPath = match[1].trim().replace(/\\+$/, "");
    const rawLabel = ((match[2] ?? match[1]).trim()).replace(/\\+$/, "");
    if (!rawPath) continue;
    links.push({ path: rawPath, label: rawLabel });
  }
  return links;
}

// ─── Work items: ### groups with checkboxes ──────────────────────────

/**
 * Group checkbox items under their enclosing `###` (and some `##`) headings.
 *
 * Returns [] when the file has no heading-grouped checkboxes.
 */
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

/**
 * Flatten every checkbox in the file, tagging each with its section heading.
 *
 * Used for system-status views where the section name is the semantic label.
 * Returns [] when the file has no checkboxes.
 */
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

/**
 * Extract entity metadata (core framing, See Also, Related) from a parsed file.
 *
 * Always returns an EntityData — missing sections yield empty strings /
 * empty link arrays rather than null.
 */
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

/**
 * Read the four canonical research-project files from a directory.
 *
 * Returns null when none of the expected files (executive-summary,
 * deep-dive, key-players, open-questions) exist in the directory — i.e.
 * when this doesn't look like a research project at all.
 */
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
 * Resolve a wiki-link target to an absolute vault-relative path.
 *
 * Tries in order: exact match → with `.md` suffix → every probed layout
 * folder → legacy `wiki/` prefix → basename index fallback. On ambiguity
 * the shortest matching path wins. Returns the resolved path when found,
 * or null when the target doesn't exist in the active vault (or when no
 * vault is connected).
 *
 * @param linkPath  raw wiki-link body (e.g. `"projects/foo"` or `"foo"`).
 *                  Leading slashes are stripped. Trailing `.md` is optional.
 *                  A trailing `#anchor` is preserved on the returned path.
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

/** Join a layout-provided dir with a filename, handling null dirs gracefully. */
function inDir(dir: string | null, ...parts: string[]): string | null {
  if (!dir) return null;
  return [dir, ...parts].filter(Boolean).join("/");
}

/** Try a list of candidate paths; return the first that readVaultFile() can open. */
async function firstReadable(candidates: (string | null)[]): Promise<ParsedFile | null> {
  for (const c of candidates) {
    if (!c) continue;
    const file = await readVaultFile(c);
    if (file) return file;
  }
  return null;
}

/**
 * Build a list of candidate paths for a file that might live in either a
 * probed layout directory, a vault-root variant, or a legacy wiki/ path.
 * Used by all "read the canonical X file" helpers below.
 */
function hubCandidates(dir: string | null, fileName: string): string[] {
  const out: string[] = [];
  const from = inDir(dir, fileName);
  if (from) out.push(from);
  // Root-level fallback (some vaults put system files at root).
  out.push(fileName);
  // wiki/ prefix fallback — if the layout didn't detect a specific dir
  // but the vault still uses wiki/ structure, try the legacy paths.
  if (!dir?.startsWith("wiki/")) out.push(`wiki/${fileName}`);
  return out;
}

// ─── Re-exports from split modules ────────────────────────────────────
// Readers, indexes, and search were extracted into their own files for
// readability. Every symbol the rest of the app imports from
// `@/lib/vault-reader` is re-exported here so no call site needs to change.

export {
  readWorkOpen,
  readWorkWaitingFor,
  readSystemStatus,
  readOpenLoops,
  readEntity,
  readWorkLog,
  readWorkWeek,
  readResearchProject,
} from "./vault-readers";

export {
  getHubFiles,
  getEntityIndex,
  getJournalIndex,
  getProjectIndex,
  getResearchProjects,
} from "./vault-indexes";

export {
  listVaultFiles,
  searchVault,
} from "./vault-search";
