/**
 * Pure search-core primitives.
 * No filesystem access, no React, no server-only imports.
 * Imported by buildSearchResults (server) and tests (pure Vitest).
 */

import { extractTags } from "@/lib/markdown/tags";
import type { ParsedFile } from "@/lib/vault-reader";

// ─── Types ────────────────────────────────────────────────────────────────────

/** A file ready for scoring: content + structural signals, no IO. */
export interface ScorableFile {
  path: string;
  /** Body AFTER frontmatter strip (ParsedFile.content). */
  content: string;
  /** ParsedFile.sections[].heading */
  headings: string[];
  /** extractTags(content, frontmatter) — normalized */
  tags: string[];
  /** Flattened FM scalar values, for free-text matching. */
  frontmatterText: string;
  /** ParsedFile.mtime (ms); 0 when unknown. */
  mtime: number;
}

/** Outcome of scoring one file against one query's terms. */
export interface ScoredFile {
  path: string;
  /** Total score. 0 means no term matched — caller MUST drop these on !matched. */
  score: number;
  /** True iff at least one term hit content/heading/tag/frontmatter. */
  matched: boolean;
  /** Per-source raw hit counts, for excerpting + debugging. */
  hits: { content: number; heading: number; tag: number; frontmatter: number };
  mtime: number;
}

export interface ScoreWeights {
  content: number;
  heading: number;
  tag: number;
  frontmatter: number;
}

export const DEFAULT_WEIGHTS: ScoreWeights = {
  content: 1,
  heading: 5,
  tag: 4,
  frontmatter: 3,
};

// ─── tokenizeQuery ────────────────────────────────────────────────────────────

/**
 * Split a free-text query into lowercased search terms.
 * Drops terms shorter than `minLen` (default 2 — single chars are noise,
 * but "ai", "ml", "ci" are legitimate 2-char terms).
 * #tag tokens are parsed upstream by parseTagQuery and never reach here.
 */
export function tokenizeQuery(text: string, minLen = 2): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= minLen);
}

// ─── escapeRegExp ─────────────────────────────────────────────────────────────

/**
 * Escape regex metacharacters in a literal term.
 * Closes the ReDoS / SyntaxError hole that existed when user input was
 * passed raw into `new RegExp(term)`.
 */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── scoreFileAgainstTerms ───────────────────────────────────────────────────

/**
 * Score one file against pre-tokenized terms. PURE: no IO, no Date.now().
 *
 * Weights (single source of truth):
 *   headingHits    x W.heading     (default 5)
 *   tagHits        x W.tag         (default 4)   - tags now searched
 *   frontmatterHits x W.frontmatter (default 3)  - FM now searched
 *   contentHits    x W.content     (default 1)   - TF term frequency
 *
 * `matched` = (sum of all hit counts) > 0.
 * Recency is NOT applied here - keeps the fn pure + deterministic.
 * All term matching uses escapeRegExp to close the ReDoS hole.
 */
export function scoreFileAgainstTerms(
  file: ScorableFile,
  terms: string[],
  weights: ScoreWeights = DEFAULT_WEIGHTS,
): ScoredFile {
  if (terms.length === 0) {
    return {
      path: file.path,
      score: 0,
      matched: false,
      hits: { content: 0, heading: 0, tag: 0, frontmatter: 0 },
      mtime: file.mtime,
    };
  }

  const contentLC = file.content.toLowerCase();
  const headingText = file.headings.join(" ").toLowerCase();
  const tagText = file.tags.join(" "); // already normalized/lowercased
  const fmText = file.frontmatterText.toLowerCase();

  let totalContent = 0;
  let totalHeading = 0;
  let totalTag = 0;
  let totalFrontmatter = 0;

  for (const term of terms) {
    const escaped = escapeRegExp(term.toLowerCase());
    const re = new RegExp(escaped, "g");

    totalContent += (contentLC.match(re) ?? []).length;
    totalHeading += (headingText.match(re) ?? []).length;
    totalTag += (tagText.match(re) ?? []).length;
    totalFrontmatter += (fmText.match(re) ?? []).length;
  }

  const totalHits = totalContent + totalHeading + totalTag + totalFrontmatter;
  const score =
    totalContent * weights.content +
    totalHeading * weights.heading +
    totalTag * weights.tag +
    totalFrontmatter * weights.frontmatter;

  return {
    path: file.path,
    score,
    matched: totalHits > 0,
    hits: {
      content: totalContent,
      heading: totalHeading,
      tag: totalTag,
      frontmatter: totalFrontmatter,
    },
    mtime: file.mtime,
  };
}

// ─── applyRecencyBoost ───────────────────────────────────────────────────────

/**
 * Add a recency boost to an already-scored file, but ONLY when it matched a
 * term. Fixes the bug where recency alone (score>0) surfaced zero-match files.
 *
 *   boost = max(0, 1 - daysSinceMtime / halfLifeDays) * maxBoost
 *
 * `now` is injected (not Date.now()) so the unit is deterministic/testable.
 * Returns the file unchanged when !matched (boost is a no-op).
 */
export function applyRecencyBoost(
  scored: ScoredFile,
  now: number,
  halfLifeDays = 90,
  maxBoost = 2,
): ScoredFile {
  if (!scored.matched) return scored;

  const daysSince = scored.mtime > 0 ? (now - scored.mtime) / (1000 * 60 * 60 * 24) : Infinity;
  const boost = Math.max(0, 1 - daysSince / halfLifeDays) * maxBoost;

  return { ...scored, score: scored.score + boost };
}

// ─── buildExcerpt ────────────────────────────────────────────────────────────

/**
 * Build a ~140-char excerpt around the first term occurrence in the ORIGINAL
 * (non-lowercased) content, preserving casing. Case-insensitive match via a
 * lowercased index map.
 *
 * Falls back in order:
 *   1. First term found in body (any term, not just terms[0])
 *   2. First heading (for heading/tag/frontmatter-only matches)
 *   3. Opening 140 chars of content
 *
 * Fixes the old excerpt that used indexOf(lowercased) and returned
 * the wrong slice for heading-only matches and lost original casing.
 */
export function buildExcerpt(
  content: string,
  headings: string[],
  terms: string[],
  radius: { before: number; after: number } = { before: 60, after: 80 },
): string {
  if (!content && headings.length === 0) return "";

  // Try to find any term in the body (original casing via lowercase index).
  const lc = content.toLowerCase();
  let idx = -1;
  let hitLen = 0;

  for (const t of terms) {
    const at = lc.indexOf(t.toLowerCase());
    if (at !== -1) {
      idx = at;
      hitLen = t.length;
      break;
    }
  }

  if (idx !== -1) {
    // Found in body - slice original-cased content.
    const start = Math.max(0, idx - radius.before);
    const end = Math.min(content.length, idx + hitLen + radius.after);
    const slice = content.slice(start, end).replace(/\s+/g, " ").trim();
    return (start > 0 ? "…" : "") + slice + (end < content.length ? "…" : "");
  }

  // Fallback 1: use the first heading.
  if (headings.length > 0) {
    return headings[0];
  }

  // Fallback 2: opening of content.
  const head = content.replace(/\s+/g, " ").trim();
  if (!head) return "";
  return head.length > 140 ? head.slice(0, 140) + "…" : head;
}

// ─── toScorable ──────────────────────────────────────────────────────────────

/**
 * Pure mapping from ParsedFile to ScorableFile.
 * Runs extractTags + flattens FM scalar values.
 * Exported for tests.
 */
export function toScorable(parsed: ParsedFile): ScorableFile {
  const tags = extractTags(parsed.content, parsed.frontmatter);
  const frontmatterText = Object.values(parsed.frontmatter)
    .flatMap((v) => (Array.isArray(v) ? v : [v]))
    .filter(
      (v): v is string | number =>
        typeof v === "string" || typeof v === "number",
    )
    .map(String)
    .join(" ")
    .toLowerCase();

  return {
    path: parsed.path,
    content: parsed.content,
    headings: parsed.sections.map((s) => s.heading),
    tags,
    frontmatterText,
    mtime: parsed.mtime,
  };
}

// ─── collectVaultFiles ───────────────────────────────────────────────────────

/**
 * Collect EVERY markdown file in the vault as ScorableFiles, via walkFiles
 * (the same whole-vault walker /api/vault/index uses) - NOT the probed-folder
 * subset that buildSearchResults previously used.
 *
 * Returns [] when no vault is connected. Never throws.
 *
 * Optional `restrictTo` caps the set to a given path allow-list.
 */
export async function collectVaultFiles(
  restrictTo?: ReadonlySet<string>,
): Promise<ScorableFile[]> {
  // Lazy imports keep this module importable in pure-test contexts without
  // triggering server-only side effects.
  const { walkFiles } = await import("@/lib/fs/walk");
  const { readVaultFile, getVaultPath } = await import("@/lib/vault-reader");

  const root = getVaultPath();
  if (!root) return [];

  let rels: string[];
  try {
    rels = await walkFiles(root, { extensions: [".md"] });
  } catch {
    return [];
  }

  const out: ScorableFile[] = [];
  for (const rel of rels) {
    if (restrictTo && !restrictTo.has(rel)) continue;
    try {
      const f = await readVaultFile(rel);
      if (!f) continue;
      out.push(toScorable(f));
    } catch {
      // Skip unreadable files; never throw.
    }
  }
  return out;
}
