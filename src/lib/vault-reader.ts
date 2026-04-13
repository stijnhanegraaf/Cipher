// Vault Reader — reads and parses Obsidian markdown files from the vault
// Caches parsed content in memory, invalidates on file change (mtime)

import { readFile, stat, readdir } from "fs/promises";
import { join, sep } from "path";

const VAULT_PATH = process.env.VAULT_PATH || "/root/.openclaw/workspace/Obsidian";

// ─── Types ────────────────────────────────────────────────────────────

export interface ParsedFile {
  path: string;       // relative path from vault root
  content: string;    // raw markdown (without frontmatter)
  frontmatter: Record<string, unknown>;
  sections: Section[];
  mtime: number;      // last modified time (ms)
}

export interface Section {
  heading: string;    // e.g. "## Active now"
  level: number;      // 2 for ##, 3 for ###
  body: string;       // content under this heading (until next heading)
}

export interface CheckboxItem {
  text: string;
  checked: boolean;
  indent: number;     // 0 = top level, 1 = nested under parent
}

export interface KeyValuePairs {
  [key: string]: string;
}

// ─── In-memory cache ──────────────────────────────────────────────────

const cache = new Map<string, ParsedFile>();

// ─── Core read + parse ───────────────────────────────────────────────

export async function readVaultFile(relPath: string): Promise<ParsedFile | null> {
  const absPath = join(VAULT_PATH, relPath);

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

    // Parse simple YAML values
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
      current = {
        heading: headingMatch[2].trim(),
        level: headingMatch[1].length,
        body: "",
      };
      sections.push(current);
    } else if (current) {
      current.body += (current.body ? "\n" : "") + line;
    }
  }

  return sections;
}

// ─── Checkbox parsing ─────────────────────────────────────────────────

export function parseCheckboxes(text: string): CheckboxItem[] {
  const items: CheckboxItem[] = [];
  for (const line of text.split("\n")) {
    const match = line.match(/^(\s*)-\s*\[([ xX])\]\s*(.+)/);
    if (match) {
      items.push({
        text: match[3].trim(),
        checked: match[2] !== " ",
        indent: match[1].length,
      });
    }
  }
  return items;
}

// ─── Key-value parsing (from sections like "## At a glance") ──────────

export function parseKeyValuePairs(text: string): KeyValuePairs {
  const pairs: KeyValuePairs = {};
  for (const line of text.split("\n")) {
    // Match lines like "- Key: Value"
    const kvMatch = line.match(/^\s*-\s+(.+?):\s+(.+)/);
    if (kvMatch) {
      pairs[kvMatch[1].trim()] = kvMatch[2].trim();
    }
    // Also match table rows like "| Key | Value |"
    const tableMatch = line.match(/^\|\s*(.+?)\s*\|\s*(.+?)\s*\|/);
    if (tableMatch && tableMatch[1] !== "" && !tableMatch[1].includes("---")) {
      pairs[tableMatch[1].trim()] = tableMatch[2].trim();
    }
  }
  return pairs;
}

// ─── Link extraction ─────────────────────────────────────────────────

export interface ObsidianLink {
  label: string;
  path: string;
}

export function extractLinks(text: string): ObsidianLink[] {
  const links: ObsidianLink[] = [];
  // Match [[path|label]] or [[path]]
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

// ─── Get section by heading ──────────────────────────────────────────

export function getSection(file: ParsedFile, heading: string): Section | undefined {
  return file.sections.find(
    (s) => s.heading.toLowerCase() === heading.toLowerCase()
  );
}

export function getSectionsByPrefix(file: ParsedFile, prefix: string): Section[] {
  return file.sections.filter(
    (s) => s.heading.toLowerCase().startsWith(prefix.toLowerCase())
  );
}

// ─── Directory listing ───────────────────────────────────────────────

export async function listVaultFiles(dirRelPath: string, extension = ".md"): Promise<string[]> {
  const absDir = join(VAULT_PATH, dirRelPath);
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

export interface SearchResult {
  path: string;
  excerpt: string;
  score: number;
  kind: string;
}

export async function searchVault(
  query: string,
  maxResults = 20
): Promise<SearchResult[]> {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);

  if (terms.length === 0) return [];

  // Search key directories
  const dirs = [
    "wiki/work",
    "wiki/system",
    "wiki/knowledge",
    "wiki/projects",
    "wiki/memory",
  ];

  const allFiles = new Set<string>();
  for (const dir of dirs) {
    const files = await listVaultFiles(dir);
    for (const f of files) allFiles.add(f);
  }

  const results: SearchResult[] = [];

  for (const filePath of allFiles) {
    const file = await readVaultFile(filePath);
    if (!file) continue;

    const content = file.content.toLowerCase();
    const headingText = file.sections.map((s) => s.heading.toLowerCase()).join(" ");
    const combined = content + " " + headingText;

    let score = 0;
    for (const term of terms) {
      // Count occurrences, weight headings higher
      const headingCount = (headingText.match(new RegExp(term, "g")) || []).length;
      const contentCount = (content.match(new RegExp(term, "g")) || []).length;
      score += headingCount * 3 + contentCount;
    }

    if (score > 0) {
      // Extract excerpt around first match
      const firstTerm = terms[0];
      const idx = content.indexOf(firstTerm);
      const start = Math.max(0, idx - 60);
      const end = Math.min(content.length, idx + firstTerm.length + 80);
      const excerpt = (start > 0 ? "…" : "") + content.slice(start, end).replace(/\n/g, " ") + (end < content.length ? "…" : "");

      // Determine kind from path
      let kind = "note";
      if (filePath.includes("entity")) kind = "entity";
      else if (filePath.includes("project")) kind = "project";
      else if (filePath.includes("research")) kind = "research";
      else if (filePath.includes("system")) kind = "system";

      results.push({ path: filePath, excerpt, score, kind });
    }
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}

// ─── Clear cache ──────────────────────────────────────────────────────

export function clearCache(): void {
  cache.clear();
}