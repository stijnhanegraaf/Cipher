# Map view — Graph fix + Structure columns — Design Spec

**Date:** 2026-04-19
**Status:** Approved for planning
**Scope:** Unbrick the current `/browse/graph` (blank-canvas bug on mount) *and* add a second "Structure" mode that renders a Miller-columns explorer with a 360px file-preview panel alongside the existing force-directed canvas. Both modes live on the same route with a `Graph | Structure` segmented toolbar. No new backend endpoints, no graph visual redesign.

---

## Context

`/browse/graph` currently renders a blank canvas. The endpoint `/api/vault/graph` returns 200 with well-shaped data (254 nodes, 677 edges in the working vault). The failure is front-end: `GraphCanvas.tsx` reads `container.clientWidth/Height` inside its mount `useEffect` before the layout has settled. Because `GraphPage.tsx` nests the canvas under `<div style={{ display: "flex", flex: 1, height: "100%", minHeight: 0 }}>` — a flex row whose children's intrinsic height is 0 until the outer flex column finishes — the init pass reads a 0×0 box, seeds the simulation inside a zero viewport, and paints nothing. The ResizeObserver that follows only resizes the canvas backing store; it never re-runs the pre-settle pass, so the layout stays at collapsed coordinates.

Alongside the fix, the user wants a second view: a Miller-columns file explorer for structural navigation. Today there is no persistent file tree anywhere in the app (the VaultDrawer is sectioned and not hierarchical). The ⌘K palette overhaul added search, not drill-down.

---

## Goals

1. **Make the graph render again.** No visual redesign; bug-fix in place.
2. **Add a Structure mode** — horizontally-scrolling Miller columns, one column per folder level, with a 360px right-side file preview panel.
3. **One surface, one route.** Keep `/browse/graph`, rename the page component `MapPage`, add a segmented toolbar toggle.
4. **Zero new backend.** Reuse `/api/vault/graph` + `/api/file`.
5. **Linear-grade craft.** Typography + selection rails do the visual work. No gradients, no card shadows, no illustrations.

---

## Non-goals (explicit — to keep scope tight)

- No new API endpoints.
- No graph visual redesign — bug-fix only. A full rewrite is a separate spec.
- No writes — Miller columns are read-only (no drag-to-reorder, rename, move, or delete).
- No multi-select. One selected file, one active column.
- No thumbnails / image previews. Markdown-only textual snippet in the preview panel.
- No cross-vault search in columns. Filter is per-active-column via `/`.
- No separate `/browse/structure` route.
- No tests — repo has no test framework. Verification = tsc + build + manual walk.

---

## Architecture

### Route + components

```
/browse/graph
  └─ MapPage.tsx                         (replaces GraphPage.tsx)
       ├─ PageShell
       │    title = "Graph" (mode="graph") | "Structure" (mode="structure")
       │    subtitle = `${nodes.length} notes · ${edges.length} links`
       │    toolbar = <MapModeToggle mode onChange />
       │
       ├─ mode === "graph"     → <GraphCanvas graph onOpen />        (existing, with mount-fix)
       └─ mode === "structure" → <StructureColumns graph onOpen />
                                   └─ internal: <FilePreviewPanel path />
```

### New files

| File | Responsibility |
|---|---|
| `src/components/browse/MapPage.tsx` | Replaces `GraphPage.tsx`. Owns mode state (persisted to `localStorage["cipher-map-mode-v1"]`), fetches `/api/vault/graph` once, passes the graph to whichever child component. |
| `src/components/browse/MapModeToggle.tsx` | Tiny segmented `Graph | Structure` pill. Reused pattern from the existing sidebar toggle; takes `mode` + `onChange(mode)`. |
| `src/components/browse/StructureColumns.tsx` | Horizontally-scrolling column strip + keyboard handling. Internally mounts `<FilePreviewPanel>` as the final column-neighbour. |
| `src/components/browse/FilePreviewPanel.tsx` | Right-side 360px metadata + snippet + backlinks/outlinks pane. Lazy-fetches `/api/file?path=` on `path` change. |
| `src/lib/vault-tree.ts` | `buildTree(graph: Graph): TreeIndex` — groups `graph.nodes` by `folder`, returns `{ foldersByParent, filesByFolder, countsByFolder }` for O(1) column lookups. Cached via `useMemo` per graph fetch. |

### Modified files

| File | Change |
|---|---|
| `src/app/browse/graph/page.tsx` | Swap import `GraphPage` → `MapPage`. Single line. |
| `src/components/browse/GraphCanvas.tsx` | Mount-order bug fix only (see §Graph fix). No visual changes. |

### Deleted files

| File | Reason |
|---|---|
| `src/components/browse/GraphPage.tsx` | Superseded by `MapPage.tsx`. |

### Reuse (do NOT reimplement)

- `/api/vault/graph` — existing endpoint, already returns `{ nodes: [{id, title, folder, backlinks, outlinks, mtime}], edges: [{source, target}] }`.
- `/api/file?path=` — existing endpoint used by the sheet + ⌘K heading lookup. Returns `{ sections: [{heading, text}], frontmatter?, tags?, wordCount? }` (existing shape — if `wordCount` isn't on the envelope, derive it client-side from sections).
- `useSheet().open(path, anchor?)` — sheet hook.
- `PageShell` + `PageAction` — header/toolbar chrome.
- `.app-row`, `var(--radius-pill)`, `var(--bg-surface-alpha-2/4)`, `var(--border-subtle)`, `mono-label`, `caption-large`, `heading-3`, `--row-h-cozy` — existing design tokens.
- `cipher-cursor-blink` keyframe — preview panel loading skeleton reuses it.

---

## Graph fix

Three localised edits. No rewrite.

### 1. Replace zero-width mount with a ResizeObserver gate

In `GraphCanvas.tsx`, the init `useEffect` runs on `[graph]`. Refactor so the init pass runs only once a non-zero container rect is observed.

```tsx
useEffect(() => {
  const container = containerRef.current;
  if (!container) return;

  let inited = false;
  const ro = new ResizeObserver(() => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (inited || w === 0 || h === 0) return;
    inited = true;
    initSimulation(w, h);     // existing body extracted into a function
    startFadeLoop();          // existing fade + idle loop
  });
  ro.observe(container);

  return () => {
    ro.disconnect();
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [graph]);
```

`initSimulation(w, h)` is the existing body of the current mount effect (seed `simNodes`, pre-settle up to 900 ticks, zero velocities). `startFadeLoop()` is the existing fade-in + idle loop.

### 2. Keep the resize observer for canvas DPR updates

The existing resize effect already updates `canvas.width/height` + `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)`. Leave it alone — it's orthogonal to init now.

### 3. Fix the flex layout in MapPage

Old (in the current `GraphPage`):
```tsx
<div style={{ display: "flex", flex: 1, height: "100%", minHeight: 0 }}>
  {graph && <GraphCanvas … />}
</div>
```

New (in `MapPage`):
```tsx
<div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
  {mode === "graph" && graph && <GraphCanvas graph={graph} onOpen={sheet.open} />}
  {mode === "structure" && graph && <StructureColumns graph={graph} onOpen={sheet.open} />}
</div>
```

The explicit `height: "100%"` combined with `display: flex` default-row was forcing children to derive height from content (0 until first paint). Column direction + `flex: 1 + minHeight: 0` is the pattern used everywhere else in the app and propagates size deterministically.

---

## Structure mode — Miller columns

### Data model

```ts
type ColumnPath = string;           // vault-relative folder, "" for root

interface StructureState {
  trail: ColumnPath[];              // ["", "work", "work/projects"]
  selectedFile: string | null;      // vault-relative path
  filterByColumn: Record<ColumnPath, string>;   // per-column query
}
```

`trail[0] = ""` (root) always. `trail.length` determines how many columns render. Changing `trail` re-renders columns via React state; `selectedFile` gates the preview panel.

### Tree build (`vault-tree.ts`)

```ts
export interface TreeIndex {
  /** folderPath → immediate child folder names (sorted a–z). */
  foldersByParent: Map<string, string[]>;
  /** folderPath → file nodes directly inside that folder, sorted a–z. */
  filesByFolder: Map<string, GraphNode[]>;
  /** folderPath → total file count under that folder (recursive). */
  countsByFolder: Map<string, number>;
}

export function buildTree(graph: Graph): TreeIndex { … }
```

O(n) over nodes, cached via `useMemo(() => buildTree(graph), [graph])` inside `StructureColumns`.

### Column layout

Horizontal flex strip, scrollable horizontally, 100% viewport height:

```
┌──────────┬──────────┬──────────┬──────────────────────────┐
│ column 1 │ column 2 │ column 3 │ FilePreviewPanel (360)   │
│ 240px    │ 240px    │ 240px    │                          │
└──────────┴──────────┴──────────┴──────────────────────────┘
```

- Each column: `width: 240px`, `flex: 0 0 240px`, vertical scroll, 1px right border `var(--border-subtle)`. No fill — the 1px divider carries the structure.
- Preview panel: `width: 360px`, `flex: 0 0 360px`, no right border.
- Strip: `display: flex`, `overflowX: auto`, `scrollSnapType: x mandatory`, each column `scrollSnapAlign: start`.

### Column header (sticky, 24px)

Top of each column, sticky at `top: 0`:

- `mono-label` / 10px / `var(--text-quaternary)` / `letter-spacing: 0.08em`.
- Text: folder name uppercase. Root = `VAULT`.
- Below the header: 1px `var(--border-subtle)` divider.

### Row anatomy (`--row-h-cozy` = 32px)

```
[icon 14]  Label                                         [count/time]  [›]
```

- **Icon** (14px, stroke 1.5):
  - Folder: square-bracket glyph.
  - File: document glyph.
- **Label** (`caption-large`):
  - Active row: `var(--text-primary)`, font-weight 500.
  - Inactive: `var(--text-secondary)`.
- **Trailing meta** (right-aligned, tabular-nums, 11px, `var(--text-quaternary)`):
  - Folder rows: recursive file count from `countsByFolder`.
  - File rows: relative mtime (`2h`, `3d`, `2w`, `1m`).
- **Trailing chevron `›`** (10px, stroke 2):
  - Folder rows: visible on hover OR when the folder is the active column's ancestor.
  - File rows: never.
- **Active rail**: 2px left border `var(--accent-brand)` + row background `var(--bg-surface-alpha-4)`.
- **Hover**: background `var(--bg-surface-alpha-2)`.
- **Sort order**: folders first (a–z), then files (a–z), case-insensitive.

### Interactions

| Input | Effect |
|---|---|
| Click folder row | Truncate `trail` to that folder's column index, push the folder — so clicking a folder *in* column N makes column N+1 appear (and pops N+2…). |
| Click file row | `setSelectedFile(path)`. Does NOT open the sheet. |
| Double-click file row | `sheet.open(path)`. |
| `↵` on file | `sheet.open(path)`. |
| `⌘↵` on file | `router.push("/file/<path>")` (full-route open). |
| `→` on folder | Push folder (same as click). |
| `↑` / `↓` | Move selection within the active column. Active column = rightmost populated. |
| `←` | Pop the trail (back one column). |
| `/` | Focus a filter input shown at the top of the active column only. Per-column state; clears on trail change. |
| `Esc` | If filter focused, clear it. Else collapse trail back to `[""]`. |

Active column is always the last one in `trail`. Keyboard focus lives on a row inside that column.

### Filter

When `/` fires, the active column's header area swaps from the sticky folder label to a textarea-like input (same height, same tracking, editable). Input uses the same fuzzy-score as the command palette (imported from `@/lib/fuzzy`). Non-matching rows render at `opacity: 0.3` (not hidden — so you can see the structure). On Esc or trail change, filter clears.

---

## File preview panel (`FilePreviewPanel.tsx`)

### Frame

- `width: 360px`, `flex: 0 0 360px`, `padding: 20px`, background `var(--bg-marketing)` (same as columns), no left border (the last column's right-border does the job).

### Empty state (no `selectedFile`)

Single centered caption `Select a file to preview.` in `var(--text-quaternary)`, `caption-large`, vertically centred via `display: flex + alignItems: center + justifyContent: center`.

### Loading state (selectedFile changed, fetch pending)

Two skeleton bars (`var(--bg-surface-alpha-2)`, 8px tall, 12px spacing, with 60% and 90% widths) animated with the existing `cipher-cursor-blink` keyframe. 150ms minimum display so it doesn't flash on fast responses.

### Loaded state — stack (top to bottom, 16px gap between blocks)

**1. Header block**
```
work / projects                               ← mono-label quaternary (parent folder path)
Q3 plan                              [ ↗ ]   ← heading-3 primary + open-sheet icon button
```
- Open-sheet button: 24×24 with 14px arrow-out-of-box icon. Hover background `var(--bg-surface-alpha-2)`. Radius 6. Click → `sheet.open(path)`.

**2. Metadata row** (single line, tabular-nums, `caption-large`)
```
2h ago · 5 backlinks · 3 outlinks · 412 words
```
- `·` separator is `var(--text-quaternary)`.
- Counts from `node.backlinks / node.outlinks`.
- Word count: if `/api/file` returns `wordCount`, use it; else sum of `sections.text.split(/\s+/).length`.

**3. First heading + snippet**
- First H1 or H2 from `sections[0].heading` — `body-large`, primary.
- Next: `sections[0].text` clipped to 4 lines (`-webkit-line-clamp: 4`, `body`, `var(--text-secondary)`).
- No Markdown rendering — plain text. Keeps it fast and doesn't fight the sheet for styling.

**4. Tags row**
- If `frontmatter.tags` or inline `#tags` exist, render each as a 20px-tall pill (same chip style as the chat empty-state hints: `var(--bg-surface-alpha-2)`, border `var(--border-subtle)`, radius 999, 10px horizontal padding, `caption` 12px, `var(--text-tertiary)`).
- Wrap within the panel; no horizontal scroll. If > 6 tags, truncate to 5 + `+N more` chip.

**5. LINKED FROM · N** (`mono-label` section header)
- Up to 5 backlink rows, 24px tall (`--row-h-compact`), same `.app-row` shape as the ⌘K palette:
  ```
  [doc 12]  basename                           folder-path
  ```
  - Basename: `caption-large`, primary.
  - Folder path: right-aligned, `caption`, quaternary.
  - Click → moves the Miller columns trail to the backlinked file's folder + selects the file. (In-place navigation, not a new surface.)

**6. LINKS TO · N** (`mono-label` section header)
- Same treatment as §5 but showing outlinks.

Both backlink/outlink rows clickable-through to rearrange the column trail. Power of the design: clicking a link *moves the structure*, not the view.

### Data fetch

- On `selectedFile` change, `fetch("/api/file?path=" + encodeURIComponent(path))`. Cache result in a local `Map<path, FileData>` for the component's lifetime — clicking back and forth is instant after first hit.
- Parse `sections`, `frontmatter`, `tags` from the envelope. If any field is missing, render that block blank (don't error).
- Network error → panel shows `Couldn't load file metadata.` in `var(--text-quaternary)`.

---

## Toolbar — `MapModeToggle`

Rendered in `PageShell`'s `toolbar` slot — reuses the 40px toolbar row that Timeline already uses.

```
┌────────────────────────────────────────────────────────────────┐
│ [ Graph ] Structure                                    42 ↕ … │
└────────────────────────────────────────────────────────────────┘
```

- Segmented pill, 26px tall, `var(--bg-surface-alpha-2)` background, border `var(--border-subtle)`, radius 8. Two items.
- Active item: `var(--bg-elevated)` background, primary text, `0 1px 2px rgba(0,0,0,0.2)` inner-shadow. Matches the ChatProvider toggle pattern.
- Inactive item: transparent, `var(--text-tertiary)`, clickable.
- Width: `auto` — labels drive width.
- On change: persist to `localStorage["cipher-map-mode-v1"]`, re-render body.

No toolbar actions beyond the toggle in v1. (Graph-specific zoom / filter controls stay inside the canvas as they already do.)

---

## Data model summary

All components consume the same `Graph` payload already fetched by `MapPage`:

```ts
interface GraphNode {
  id: string;       // vault-relative path ("work/q3-plan.md")
  title: string;    // basename or frontmatter title
  folder: string;   // "work/projects" — "" for root
  backlinks: number;
  outlinks: number;
  mtime: number;    // epoch ms
}

interface GraphEdge { source: string; target: string; }

interface Graph { nodes: GraphNode[]; edges: GraphEdge[]; }
```

`buildTree(graph)` derives the `TreeIndex` once. No backend change.

---

## Accessibility

- All interactive rows are `<button>` or have `role="button" + tabIndex=0` with keyboard handlers.
- Active selection is driven by `aria-current="true"` on the row in the active column.
- `aria-label` on the toolbar toggle: "Map view mode". Each item: `aria-pressed`.
- File preview's open-sheet icon has `aria-label="Open file in sheet"`.

---

## Verification

1. `npx tsc --noEmit` clean.
2. `npm run build` green.
3. Visit `/browse/graph` → force-directed canvas renders (no blank). Nodes + edges visible, hover highlights work, idle pulses fire. Header subtitle matches `{nodes}·{edges}`.
4. Toolbar pill shows `Graph | Structure`. Click `Structure` → columns appear within ~30ms. Click `Graph` → canvas reappears (no re-fetch; `graph` state is cached in `MapPage`). Mode persists after reload.
5. Structure: root column lists top-level folders + root files. Click a folder → second column appears. Click another folder → it replaces the second column, never stacks 4 unintentionally. Click a file → preview panel hydrates with header + metadata + snippet + backlinks.
6. `⌘↵` on a file → full-page route `/file/<path>` opens.
7. `←` pops the trail; `↑`/`↓` navigate within the active column; `/` focuses filter (non-matches dim); `Esc` clears filter or collapses to root.
8. Backlink / outlink mini-row click → Miller columns trail re-points to the linked file's folder, file becomes selected, preview panel updates in place.
9. Empty vault: graph mode shows existing empty-state copy; structure mode shows a single empty root column with `No folders in vault.` below the sticky header.
10. Theme toggle (dark ↔ light) → both modes render with correct token-driven colors (no hard-coded hex leaks).
11. Resize window continuously: graph canvas re-settles (doesn't clip), column strip reflows, preview panel stays 360px.
12. Open a file with zero backlinks and zero outlinks → both `LINKED FROM · 0` / `LINKS TO · 0` headers render but with empty lists below (no error state).

---

## One-sentence summary

Fix the Graph view's blank-on-mount flex-layout bug in place, rename its page `MapPage`, and add a `Graph | Structure` toolbar toggle that swaps in a new Miller-columns explorer with a 360px file-preview panel rendering reproduced-backlinks/outlinks that in-place re-point the column trail — reusing `/api/vault/graph` + `/api/file`, zero new backend, Linear-grade typography carrying the whole visual weight.
