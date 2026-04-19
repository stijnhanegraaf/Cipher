/**
 * Full-text vault search + recursive directory listing. Walks the probed
 * layout folders, scores matches by term frequency + title bonus.
 */

import { readdir } from "fs/promises";
import { join } from "path";
import type { SearchResult } from "./vault-reader";
import { readVaultFile, getVaultLayout, getVaultPath } from "./vault-reader";

// Local root accessor to avoid coupling to the private VAULT_PATH_ helper.
function rootOrEmpty(): string {
  return getVaultPath() || "";
}

export async function listVaultFiles(dirRelPath: string, extension = ".md"): Promise<string[]> {
  const absDir = join(rootOrEmpty(), dirRelPath);
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

/**
 * Full-text search across the vault's probed content folders.
 *
 * Tokenises the query on whitespace (terms shorter than 3 chars are
 * dropped) and scores each file by term occurrences — headings weight
 * 3x, body 1x. Results are sorted descending by score and capped at
 * `maxResults`. Returns [] when no vault is connected or no query terms
 * survive filtering.
 *
 * @param maxResults  hard cap on returned matches (default 20).
 */
export async function searchVault(
  query: string,
  maxResults = 20
): Promise<SearchResult[]> {
  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  if (terms.length === 0) return [];

  // Walk every directory the layout probed, plus a few conventional
  // extras that aren't in the probe set (memory / private / notes / inbox).
  // Prefixes match the vault shape so flat-root vaults still work.
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

