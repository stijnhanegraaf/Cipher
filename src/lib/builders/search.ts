/**
 * Builds the "Search Results" ViewModel by walking the whole vault and
 * scoring each file against the query using the unified search-core.
 */

import type { ViewModel, SearchResultsData, Intent } from "../view-models";
import { notesForTag } from "../vault-tags";
import { uid, kindFromPath, nameFromPath } from "./shared";
import { parseTagQuery } from "./tag-query";
import { toSearchKind } from "./search-kinds";
import {
  tokenizeQuery,
  collectVaultFiles,
  scoreFileAgainstTerms,
  applyRecencyBoost,
  buildExcerpt,
} from "../search/search-core";

const ZERO_HITS = { content: 0, heading: 0, tag: 0, frontmatter: 0 } as const;

export async function buildSearchResults(query: string): Promise<ViewModel> {
  // Parse #tag tokens out BEFORE any length filter so short tags like #ai work.
  const { tags: tagFilters, rest: textQuery } = parseTagQuery(query);
  const terms = tokenizeQuery(textQuery); // minLen=2 (was >2 — short terms now kept)

  // Tag filter: restrict to the intersection of notesForTag(t) for each tag.
  let restrictTo: ReadonlySet<string> | undefined;
  if (tagFilters.length > 0) {
    const tagNoteSets = await Promise.all(
      tagFilters.map(async (tag) => {
        const entries = await notesForTag(tag);
        return new Set(entries.map((e) => e.path));
      }),
    );
    const [first, ...remaining] = tagNoteSets;
    let intersection = first ?? new Set<string>();
    for (const s of remaining) {
      intersection = new Set([...intersection].filter((p) => s.has(p)));
    }
    restrictTo = intersection;
  }

  // Collect whole-vault markdown files (fixes scope: was probed folders only).
  const files = await collectVaultFiles(restrictTo);
  const now = Date.now();
  const tagOnly = tagFilters.length > 0 && terms.length === 0;

  const scored = files
    .map((f) => {
      if (tagOnly) {
        // Tag-only query: all tag-matched notes qualify, sorted by recency.
        return { path: f.path, score: 0, matched: true, hits: { ...ZERO_HITS }, mtime: f.mtime };
      }
      return applyRecencyBoost(scoreFileAgainstTerms(f, terms), now);
    })
    // Filter on matched (NOT score>0) — fixes recency surfacing zero-match files.
    .filter((s) => tagOnly || s.matched);

  // Sort: tag-only by recency (mtime desc); scored queries by score desc.
  if (tagOnly) {
    scored.sort((a, b) => b.mtime - a.mtime);
  } else {
    scored.sort((a, b) => b.score - a.score);
  }
  const top = scored.slice(0, 12);

  // Build excerpts using original-cased content (not lowercased).
  // We need the original files for excerpt building — re-fetch from collectVaultFiles
  // result is already ScorableFile which has original content.
  const fileMap = new Map(files.map((f) => [f.path, f]));

  const data: SearchResultsData = {
    query,
    results: top.map((r) => {
      const f = fileMap.get(r.path);
      const excerpt = f && !tagOnly
        ? buildExcerpt(f.content, f.headings, terms)
        : "";
      return {
        label: nameFromPath(r.path).replace(/-/g, " ") || r.path,
        path: r.path,
        excerpt,
        // toSearchKind coerces kindFromPath output to SearchKind vocab (headline fix).
        kind: toSearchKind(kindFromPath(r.path)),
      };
    }),
    suggestedViews: inferSuggestedViews(query),
  };

  return {
    type: "search_results",
    viewId: uid("view_search"),
    title: `Results for "${query}"`,
    layout: "stack",
    data,
    sourceFile: top[0]?.path,
    meta: {
      confidence: Math.min(0.5 + top.length * 0.05, 0.9),
      freshness: "fresh",
      generatedAt: new Date().toISOString(),
      primarySourceCount: top.length,
    },
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
