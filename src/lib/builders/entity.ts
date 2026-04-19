/**
 * Builds the "Entity Overview" ViewModel for a single entity (person,
 * company, system). Pulls linked projects + journal mentions.
 */

import type { ViewModel, EntityOverviewData, LinkRef, TimelineItem } from "../view-models";
import {
  readVaultFile,
  parseEntity,
  parseTable,
  getSection,
  extractLinks,
  readWorkOpen,
  getVaultLayout,
  type EntityData,
} from "../vault-reader";
import { uid, stripLinks, sourceRef, normalizeLinks, nameFromPath } from "./shared";


/**
 * Build an entity-overview view model for a named entity.
 *
 * Reads the entity file from the probed entitiesDir, extracts core framing,
 * See Also / Related links, and a Timeline table (if present). When
 * `entityName` is undefined or the file doesn't exist, returns a stub
 * view model with low confidence so the UI can render a helpful empty state.
 */
export async function buildEntityOverview(entityName?: string): Promise<ViewModel> {
  // No default entity — if the caller didn't specify one, we can't build an overview.
  if (!entityName) {
    return {
      type: "entity_overview",
      viewId: uid("view_ent"),
      title: "No entity specified",
      layout: "stack",
      data: {
        entityType: "unknown",
        summary: "Ask about a specific person, project, or topic by name.",
      } as EntityOverviewData,
      meta: { confidence: 0.1, freshness: "unknown" },
    };
  }

  const name = entityName;
  const layout = getVaultLayout();
  const primaryFile = layout?.entitiesDir
    ? `${layout.entitiesDir}/${name}.md`
    : `wiki/knowledge/entities/${name}.md`;

  // Read primary file. Falls back to parent dirs via readEntity's probe
  // when the layout doesn't match the expected shape.
  const mainFile = await readVaultFile(primaryFile);
  if (!mainFile) {
    return {
      type: "entity_overview",
      viewId: uid("view_ent"),
      title: name.charAt(0).toUpperCase() + name.slice(1).replace(/-/g, " "),
      layout: "stack",
      data: {
        entityType: "unknown",
        summary: `Could not load data for "${name}".`,
      } as EntityOverviewData,
      sourceFile: primaryFile,
      meta: { confidence: 0.2, freshness: "stale" },
    };
  }

  // Use parseEntity for rich extraction
  const entityData: EntityData | null = await parseEntity(mainFile);

  // Extract summary from Core framing
  let summary = "";
  if (entityData && entityData.coreFraming) {
    summary = entityData.coreFraming.split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 10 && !l.startsWith("#"))
      .join(" ")
      .slice(0, 300);
  }

  // Fallback: first meaningful line from the whole file
  if (!summary) {
    summary = mainFile.content.split("\n")
      .find((l) => l.trim().length > 20 && !l.trim().startsWith("#") && !l.trim().startsWith("|"))
      ?.trim() || "A key entity in your knowledge base.";
  }

  // Extract related notes from entity data
  const relatedNotes: LinkRef[] = [];
  const relatedEntities: LinkRef[] = [];
  const seenPaths = new Set<string>();

  function addLink(link: { label: string; path: string }, kind: string) {
    if (!seenPaths.has(link.path)) {
      seenPaths.add(link.path);
      relatedNotes.push({ label: link.label, path: link.path, kind });
      if (link.path.includes("entities") || kind === "entity") {
        relatedEntities.push({ label: link.label, path: link.path, kind: "entity" });
      }
    }
  }

  if (entityData) {
    for (const link of entityData.seeAlso) addLink(link, "related");
    for (const link of entityData.related) addLink(link, "related");
  }

  // Also extract links from the main file
  const mainLinks = extractLinks(mainFile.content);
  for (const link of mainLinks) {
    addLink(link, "note");
  }

  // Generic Timeline section parser — any entity file can have a ## Timeline table.
  const timeline: TimelineItem[] = [];
  const timelineSection = getSection(mainFile, "Timeline");
  if (timelineSection) {
    const table = parseTable(timelineSection.body);
    if (table.headers.length > 0) {
      for (const row of table.rows) {
        const cells = Object.values(row);
        if (cells.length >= 2 && !cells[0].includes("---") && cells[0].toLowerCase() !== "date") {
          timeline.push({
            date: cells[0].replace(/\*\*/g, "").trim(),
            label: cells.slice(1).join(" ").replace(/\*\*/g, "").trim(),
          });
        }
      }
    }
  }

  // Build "why now" from open work
  const { file: openFile } = await readWorkOpen();
  let whyNow: string | undefined;
  if (openFile && openFile.content.toLowerCase().includes(name.toLowerCase())) {
    whyNow = `There are active work items referencing ${name.charAt(0).toUpperCase() + name.slice(1).replace(/-/g, " ")}.`;
  }

  const entityType = (entityData?.frontmatter?.area as string) || (mainFile.frontmatter.area as string) || "entity";

  // Normalize every LinkRef so the UI always gets absolute, reachable paths.
  // Unresolvable raw wiki labels drop out here rather than rendering dead pills.
  const normalizedNotes = await normalizeLinks(relatedNotes);
  const normalizedEntities = await normalizeLinks(relatedEntities);

  const data: EntityOverviewData = {
    entityType,
    summary: summary.slice(0, 500),
    whyNow,
    relatedNotes: normalizedNotes.slice(0, 10),
    relatedEntities: normalizedEntities.slice(0, 5),
    timeline: timeline.length > 0 ? timeline.slice(0, 15) : undefined,
  };

  const displayName = name.split(/[-_]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

  return {
    type: "entity_overview",
    viewId: uid("view_ent"),
    title: displayName,
    subtitle: undefined,
    layout: "stack",
    data,
    sources: [sourceRef(
      nameFromPath(primaryFile).replace(/-/g, " ") || primaryFile,
      primaryFile,
      "entity"
    )],
    actions: [
      { id: uid("act"), type: "open_note", label: "Open in Obsidian", target: { path: primaryFile }, safety: "safe" },
    ],
    sourceFile: primaryFile,
    meta: { confidence: 0.92, freshness: "recent", generatedAt: new Date().toISOString(), primarySourceCount: 1 },
  };
}

