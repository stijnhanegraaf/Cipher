# Cipher Extended-Graph-style Tags — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`). Each task: TDD pure logic, run the FULL gate before committing, ONE commit, footer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Leave NO stray uncommitted edits.

**Goal:** Tags work like the Extended Graph plugin — per-tag colored arc segments around node rims (body stays cinematic mono), a tag filter panel, and the open note highlighted.

**Architecture:** Add a deterministic per-tag arc color, paint tag arcs + an active-note ring in the existing react-force-graph canvas, and upgrade GraphLegend into a filter panel that shares the arc colors. Additive — reuses the current renderer, `visibleTags` filter, and the adapter's `tags[]`.

**Tech Stack:** Next.js 16, React 19, TS-strict, react-force-graph-2d (existing dep), Vitest. No new deps.

## Global Constraints
- TS strict; no new `any`. **Token-only color** (ForceGraph.tsx allowlisted for canvas paint via `resolveToken`; GraphLegend uses `var(--…)`). Lint MUST stay 0 (eslint + stylelint via `npm run lint`).
- Conventional Commits; ONE commit/task; footer above. Full gate green before each commit: `npm run typecheck && npm run test:unit && npm run build && npm run lint`.
- Keep the cinematic node body monochrome (color ONLY in arcs + legend swatches); keep hover pills, single-click-open, the per-theme token cache, reduced-motion.
- Branch: `refinement`. Spec: `docs/superpowers/specs/2026-06-28-cipher-extended-graph-tags-design.md`.

## Grounding (already in place)
- Adapter `src/lib/browse/force-graph-data.ts` already carries `tags: readonly string[]` on `FGNodeData` — arcs have their data.
- `MapPage.tsx` has `sheet` (→ `sheet.path` for active note), `visibleTags`, `rainbow`, and mounts `<ForceGraph onOpen visibleTags rainbow>`.
- `tag-color.ts`: `tagColor` (semantic-only), `statusTagColor`, `HUE_PALETTE`, `HueToken`.

## Task order
`1 arc color + tag-arc paint + active-note ring → 2 filter-panel legend + MapPage wiring`.

---

## Task 1: Per-tag arc color + tag-arc paint + active-note ring
**Files:** Modify `src/lib/color/tag-color.ts` + `tag-color.test.ts`; `src/components/browse/ForceGraph.tsx`; `src/components/browse/MapPage.tsx` (pass `activePath`). Source: spec Features A + C.

**Interfaces:**
- `tagArcColor(tag: string): HueToken` (pure) — deterministic per-tag color: semantic override first (reuse the existing SEMANTIC map), else a stable hash into `HUE_PALETTE` (bring back a small FNV-style hash, scoped to THIS function so arcs are distinguishable; `tagColor`/node-body stays monochrome). `""` → `"--hue-tag"`.
- `ForceGraph` gains `activePath?: string`.

- [ ] **Step 1 — `tagArcColor` (TDD):** in `tag-color.test.ts`: `tagArcColor("idea")==="--hue-idea"` (semantic), `tagArcColor("x")` and `tagArcColor("y")` return values from `HUE_PALETTE` and are DETERMINISTIC (same input → same output) and spread (two different unknown tags can land on different hues), `tagArcColor("")==="--hue-tag"`. RED→implement `tagArcColor` (semantic lookup + hash-into-HUE_PALETTE)→GREEN. Do NOT change `tagColor`/`statusTagColor`.
- [ ] **Step 2 — tag-arc paint:** in `ForceGraph.tsx` `paintNode`, after the node body, draw a ring of arc segments just outside `drawR`: take `node.tags` (cap at 6; if >6, draw 5 + one neutral `--text-tertiary` "+N" arc), split `2π` equally, each arc stroked via `resolveToken(tagArcColor(tag))` at `lineWidth = Math.max(1, 2/globalScale)`, radius `drawR + 3/globalScale`, small gaps between segments. Skip arcs when the node is tag-filtered-out (dimmed) or `globalScale < 0.7` (too far out). Reset stroke state after.
- [ ] **Step 3 — active-note ring:** add `activePath?: string` prop; in `paintNode`, if `node.id === activePath`, draw a bright `resolveToken("--accent-brand")` ring (radius `drawR + 6/globalScale`, width `2/globalScale`) and/or a stronger glow, so the open note stands out. MapPage passes `activePath={sheet.path}` to `<ForceGraph>`.
- [ ] **Step 4 — verify:** full gate + lint 0. Dev-server check (human, pending-ok): multi-tag nodes show a colored arc ring; the open note has a bright ring; node body still mono cinematic. Commit (`feat(graph): per-tag arc segments on nodes + active-note highlight`).

## Task 2: Tag filter panel + MapPage wiring
**Files:** Modify `src/components/browse/GraphLegend.tsx` (filter panel + arc-color swatches), `src/components/browse/MapPage.tsx` (folder filter if included). Source: spec Feature B.

- [ ] **Step 1 — swatches match arcs:** in `GraphLegend`, the per-tag chip swatch uses `tagArcColor(tag)` (so legend color == arc color) — replacing the current `tagColor`/`statusTagColor` swatch. Keep the Status|Tags rainbow toggle. Token-only.
- [ ] **Step 2 — filter behavior:** make each tag chip a clear include/exclude toggle driving `visibleTags` (the existing Set mechanism): show tag name + swatch + count, sorted by count desc; clicking toggles membership; add a "Clear" affordance when any filter is active. Filtered-out nodes already dim/hide in ForceGraph — verify.
- [ ] **Step 3 — (optional, if cheap) folder filter:** a small secondary group listing top-level folders (derived from node paths) that also filter the graph; only add if it's a clean addition — otherwise note as deferred. Token-only.
- [ ] **Step 4 — verify:** full gate + lint 0. Dev-server check (human): clicking tags filters the graph; swatches match the on-node arcs. Commit (`feat(graph): tag filter panel with arc-matched swatches`).

---

## Final verification
- [ ] typecheck 0 / tests pass / build green / lint 0 (eslint+stylelint).
- [ ] Multi-tag nodes show all tags as colored rim arcs (body stays mono); legend swatches match the arcs; clicking tags filters; the open note is highlighted. No new deps. Human eyeball in both themes.

## Spec coverage
| Spec feature | Task |
|---|---|
| A Tag arcs (+ tagArcColor; adapter tags[] already present) | 1 |
| C Highlight active note | 1 |
| B Tag filter panel (+ folder filter optional) | 2 |

## Self-review notes
- `tagArcColor` is the pure/tested surface; arc paint + ring + legend are visual (build + human eyeball).
- Per-tag color is reintroduced ONLY via `tagArcColor` (arcs + legend swatch) — node body fill stays `statusTagColor`/mono per the locked "color only in arcs" decision.
- Reuses adapter `tags[]`, `visibleTags`, `sheet.path`, `resolveToken` cache — additive, no rewrite.
