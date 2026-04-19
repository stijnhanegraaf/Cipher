/**
 * Builds the "Search Results" ViewModel by walking every layout-probed
 * folder (plus common extras) and scoring each file against the query.
 */

import type { ViewModel, SearchResultsData, Intent } from "../view-models";
import { readVaultFile, listVaultFiles, getVaultLayout } from "../vault-reader";
import { uid, kindFromPath, nameFromPath } from "./shared";

export async function buildSearchResults(query: string): Promise<ViewModel> {
  // Search across every folder the vault layout probed, plus a few
  // common unknown-to-layout names as a backstop. Vault-agnostic.
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

  // Collect all files from every dir.
  const allFiles = new Set<string>();
  for (const dir of dirs) {
    const files = await listVaultFiles(dir);
    for (const f of files) allFiles.add(f);
  }

  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  const results: { path: string; excerpt: string; score: number; kind: string }[] = [];

  for (const filePath of allFiles) {
    const file = await readVaultFile(filePath);
    if (!file) continue;

    const content = file.content.toLowerCase();
    const headingText = file.sections.map((s) => s.heading.toLowerCase()).join(" ");

    let score = 0;
    for (const term of terms) {
      const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const headingCount = (headingText.match(new RegExp(escapedTerm, "g")) || []).length;
      const contentCount = (content.match(new RegExp(escapedTerm, "g")) || []).length;
      // Heading matches worth more
      score += headingCount * 5 + contentCount;
    }

    // Recency boost
    const daysSinceModified = (Date.now() - (file.mtime || 0)) / (1000 * 60 * 60 * 24);
    const recencyBoost = Math.max(0, 1 - daysSinceModified / 90) * 2;
    score += recencyBoost;

    if (score > 0) {
      // Extract excerpt around first match
      const firstTerm = terms[0];
      const idx = content.indexOf(firstTerm);
      const start = Math.max(0, idx - 60);
      const end = Math.min(content.length, idx + firstTerm.length + 80);
      const excerpt = (start > 0 ? "…" : "") + content.slice(start, end).replace(/\n/g, " ") + (end < content.length ? "…" : "");

      const kind = kindFromPath(filePath);
      results.push({ path: filePath, excerpt, score, kind });
    }
  }

  results.sort((a, b) => b.score - a.score);
  const topResults = results.slice(0, 12);

  const data: SearchResultsData = {
    query,
    results: topResults.map((r) => ({
      label: nameFromPath(r.path).replace(/-/g, " ") || r.path,
      path: r.path,
      excerpt: r.excerpt,
      kind: r.kind,
    })),
    suggestedViews: inferSuggestedViews(query),
  };

  return {
    type: "search_results",
    viewId: uid("view_search"),
    title: `Results for "${query}"`,
    layout: "stack",
    data,
    sourceFile: topResults[0]?.path,
    meta: { confidence: Math.min(0.5 + topResults.length * 0.05, 0.9), freshness: "fresh", generatedAt: new Date().toISOString(), primarySourceCount: topResults.length },
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

