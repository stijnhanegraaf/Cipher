# Cipher Extended-Graph-style Tags — Design Spec

- **Date:** 2026-06-28
- **Branch:** `refinement`
- **Status:** Approved design (decisions locked via Q&A), ready for implementation plan
- **Reference:** https://github.com/ElsaTam/obsidian-extended-graph (the "Extended Graph" Obsidian plugin)

## Purpose

Make Cipher's graph handle tags like the Extended Graph plugin: show **all** of a note's tags as colored **arc segments around the node rim**, a real **tag filter panel**, and **highlight the currently-open note** — while keeping the cinematic monochrome node body (color lives only in the arcs).

## Locked decisions (from Q&A)

| # | Topic | Decision |
|---|---|---|
| Features | which to adopt | **Tag arcs**, **Tag/property filter panel**, **Highlight active/open note**. NOT focus/pin, node images, shapes, saved views, SVG export, link-type filter, size-by-stat. |
| Color | reconcile with "fewer colors" | **Color only in the arcs** — node BODY stays monochrome/cinematic (grey glow as now); the thin rim ARCS carry per-tag color; legend swatch == arc color. |

## Current state (grounding)

- Graph: `src/components/browse/ForceGraph.tsx` (react-force-graph-2d, cinematic glow nodes, `paintNode`/`paintLink`, per-theme `resolveToken` cache, `withAlpha`, hover pill labels, `rainbow` toggle). Data adapter `src/lib/browse/force-graph-data.ts` (`toForceGraphData`); node data carries `id, path, title, tag, degree` — **must also carry `tags: string[]`** (the source `GraphNode.tags` exists; verify the adapter passes it through).
- Tags + filter: `src/components/browse/GraphLegend.tsx` (tag chips + the Status|Tags rainbow toggle) drives `visibleTags: Set<string>` owned by `src/components/browse/MapPage.tsx`; ForceGraph dims/hides filtered-out nodes.
- Colors: `src/lib/color/tag-color.ts` (`tagColor` semantic-only now, `statusTagColor`). For arcs we need a deterministic **per-tag** color across an arbitrary tag set.
- Active note: `src/lib/hooks/useSheet.ts` exposes the open note `path`; MapPage can read it and pass to ForceGraph.

## Feature A — Tag arcs

For each node, after painting the body, draw a ring of arc segments just outside the node radius — one segment per tag in `node.tags` (cap at, say, 6 to avoid clutter; if more, last segment is a neutral "+N"). The full circle (2π) is divided equally among the node's tags; each arc is stroked in that tag's color at width ~2/globalScale, radius = nodeRadius + gap. Hovered/active nodes may thicken arcs slightly. Arcs are skipped when the node is tag-filtered out (dimmed) and below a min zoom (to avoid noise when zoomed far out).
- **Arc color:** a new deterministic `tagArcColor(tag): HueToken` in `tag-color.ts` — maps any tag into a curated arc palette (reuse `HUE_PALETTE` via a stable hash, OR assign by the vault's sorted-unique-tag order). The legend uses the SAME function so swatch == arc. (This is the per-tag color the "color only in arcs" decision permits; the node body fill is unchanged.)
- `tags[]` must be on the FG node (adapter pass-through).

## Feature B — Tag filter panel

Upgrade `GraphLegend` into a clearer filter panel: list each tag present in the graph with its `tagArcColor` swatch + note count, sorted by count; clicking a tag toggles its membership in `visibleTags` (include/exclude — the existing mechanism). Keep the Status|Tags rainbow toggle. Optionally add a top-level **folder filter** group if cheap (nodes' path prefix) — secondary; tags are the priority. "Clear filters" affordance. Filtered-out nodes dim/hide as today.

## Feature C — Highlight active/open note

MapPage reads the open note path from `useSheet()` and passes `activePath?: string` to `ForceGraph`. In `paintNode`, the node whose `id === activePath` gets a distinct bright accent ring (and/or stronger glow) so the user can locate the note they have open. Updates live as the sheet changes.

## Scope / Non-goals

**In scope:** `ForceGraph.tsx` (arc paint + active-note ring), `tag-color.ts` (`tagArcColor`), `force-graph-data.ts` (ensure `tags[]`), `GraphLegend.tsx` (filter panel + swatches), `MapPage.tsx` (pass `activePath`, own folder filter if added).
**Non-goals:** the un-picked Extended-Graph features (focus/pin, images, shapes, saved views, SVG, link types, stat sizing); changing the lib or the cinematic look; property-based styling beyond tag filtering.

## Execution shape
Opus spec + plan; Sonnet implements per task with reviews. ~2 tasks: (1) `tagArcColor` + adapter `tags[]` (pure, tested) + the tag-arc paint + active-note ring in ForceGraph; (2) the filter-panel GraphLegend upgrade + MapPage wiring (activePath + folder filter if included). Token-only color (arcs/ring resolve via `resolveToken`). Visual verification = human dev-server eyeball (no browser automation here).

## Risks
- **Arc clutter / perf:** cap arcs per node, skip below a zoom threshold, keep stroke cheap; arcs add per-node draw cost — measure on the 2400-node vault (the per-theme token cache + arc-color cache keep getComputedStyle off the hot path).
- **Color vs "fewer colors":** arcs are intentionally colorful but thin/peripheral; node body stays monochrome — confirmed direction. Legend == arc color avoids the prior legend mismatch.
- **`tags[]` availability:** verify the adapter carries the full tags array (not just primary `tag`).
- **Both themes:** arc colors + active ring resolve via tokens; verify legibility on the cinematic dark + the light field.

## Spec coverage
| Feature | Plan task |
|---|---|
| A Tag arcs (+ tagArcColor + adapter tags[]) | task 1 |
| C Highlight active note | task 1 |
| B Tag filter panel (+ folder filter optional) | task 2 |
