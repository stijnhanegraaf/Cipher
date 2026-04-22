# Browse surface — full-page vault file browser

Status: draft
Date: 2026-04-22
Owner: @stijn

## Context

Clicking a pinned folder in the sidebar opens a right-side drawer (`VaultDrawer`) that is unvirtualized, scrolls with visible jank on long sections, and only shows a curated set of top-level categories (Work, System, Entities, Projects, Research, Journal). Many real vault folders — `skills`, `meetings`, `memory`, `private`, `timelines`, `twitter`, and anything else outside the predefined list — are invisible to the app.

We need a file browser that:

- Shows every folder and file on disk, respecting whatever structure the user already has in Obsidian.
- Opens from pinned folders as a jump-to shortcut.
- Scrolls smoothly at any vault size.
- Renders `.md` beautifully and previews images / PDFs without a detour.

This spec replaces the drawer with a full-page Browse surface (tree + preview). A follow-up spec will cover writing dashboard task toggles back to the correct `.md` file; that work is explicitly out of scope here.

## Non-goals

- Drag-and-drop move, rename, delete, or create from the tree. Read-first surface.
- Full-text search across file contents (chat retrieval owns that).
- Mermaid / KaTeX / custom markdown extensions.
- Multi-select, bulk ops.
- Mobile layout. Below ~700px we show a “tree too narrow — open full view” fallback.
- Dashboard task writeback (separate spec).

## Decisions

1. **Tree + preview layout (Obsidian-style).** Tree on the left (~280px, resizable), preview on the right. Chosen over Miller columns because vault filenames are long and horizontal scrolling loses context.
2. **Replace the drawer entirely.** `VaultDrawer` is deleted. One surface for folder navigation.
3. **Pure filesystem, no categorization.** Root of `/browse` shows whatever’s on disk, alphabetized, folders-first. Matches Obsidian and works for any vault structure.
4. **Inline preview.** Tree stays put; the preview pane renders the selected file.
5. **Everything renders**, not just `.md`: images, PDFs, other files each have a rendering path.
6. **Pinned folders become `router.push('/browse/' + path)`**. Single code change in the sidebar click handler.

## Architecture

### Routes

- `/browse` — vault root.
- `/browse/<vault-relative-path>` — that folder selected, tree scrolled/expanded to it.
- `?file=<vault-relative-file>` — which file the preview pane renders. Deep-linkable.

All three are the same page component. Path and query drive state.

### Page layout

```
┌─────────────────────────────────────────────────────────────┐
│ TopBar (breadcrumb · filename · "Open full view" · Pin)     │
├────────────┬────────────────────────────────────────────────┤
│ Filter     │                                                │
│ ─────────  │                                                │
│ ▸ folder A │            Markdown / image / PDF              │
│ ▾ folder B │                                                │
│   ▸ sub    │                                                │
│   file.md  │                                                │
│ file.png   │                                                │
│ ...        │                                                │
│            │                                                │
│ (tree)     │            (preview pane)                      │
└────────────┴────────────────────────────────────────────────┘
```

### Tree pane

- Library: `react-arborist`. Virtualized, keyboard-native, focus-managed.
- Width ~280px, drag-resizable between 220 and 480. Width persisted in `localStorage`.
- Row height 24px. Chevron for folders, file-type glyph for files (md / image / pdf / generic).
- Sort: folders first, then files, both case-insensitive alpha.
- Expand state persisted in `localStorage` keyed by vault path.
- Filter input at the top: debounced 80ms, substring match against currently loaded nodes, hides non-matches, keeps matching ancestors visible.
- Keyboard:
  - ↑/↓ move focus
  - → expand / select first child
  - ← collapse / go to parent
  - Enter — preview selected file
  - ⌘Enter — navigate to `/file/<path>`
  - `/` — focus the filter input

### Preview pane

Rendering by file extension:

- `.md` — `<MarkdownRenderer>` (existing, `react-markdown` + `remark-gfm`). Max width 72ch, centered. Wiki-links resolve to `?file=<path>` on the same Browse page. Headings get anchor ids. External links open in a new tab.
- Images (`.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.svg`) — `<img>` with `contain` fit, lazy, async decode. Click to zoom (inline modal).
- PDFs — `<iframe>` pointed at `/api/vault/asset?path=…`. Browser-native viewer. No PDF.js bundled.
- `.heic` — rendered server-side via the existing vault asset endpoint if we add a decode step; otherwise falls through to "Other".
- Other (`.txt`, `.json`, `.csv`, `.mp4`, …) — a card with filename, size, mtime, and two actions: "Reveal in Finder" (hits a new `POST /api/vault/reveal` that runs `open -R <absolute-path>` on the host) and "Download" (a direct link to `/api/vault/asset?path=…&download=1` which sets `Content-Disposition: attachment`). No custom viewers in v1.

Preview header strip:
- Breadcrumb (each segment is a `/browse/...` link)
- Filename
- "Open full view" → `/file/<path>` (existing file page)
- "Pin this folder" toggle (writes `.cipher/sidebar.json` via existing pins API)

Empty state (no file selected):
- If a folder is selected: cards-grid of its direct children (name, type, mtime).
- If nothing is selected: the grid for the vault root.

### Data layer

Existing endpoints reused:

- `GET /api/file?path=<vault-path>` — markdown parse + content. For `.md` preview.
- `GET /api/vault/folders?q=<substring>` — pin dialog autocomplete, kept.
- Pins: `GET/PUT /api/settings/sidebar` (or equivalent behind `src/lib/settings.ts`).

New endpoints:

- `GET /api/vault/tree?path=<vault-relative>&depth=1` — direct children of `path` as `[{name, path, type: "folder"|"file", ext, size, mtime}]`. Returns 404 if the path leaves the vault. Lazy: callers fetch one level per expand.
- `GET /api/vault/asset?path=<vault-relative>&download=<0|1>` — streams raw bytes with correct content-type. Used for images, PDF embeds, and explicit downloads. 404 outside vault, 404 on missing file. No parsing. `download=1` sets `Content-Disposition: attachment`.
- `POST /api/vault/reveal` body `{path}` — runs `open -R <absolute-path>` (macOS) to reveal the file in Finder. 404 outside vault; returns 501 on non-macOS platforms for now.

Server cache:

- `Map<path, children[]>` with 30s TTL, invalidated on write operations through `/api/file`. Repeated expand/collapse is free. Cache key is vault-prefixed so switching vaults doesn’t leak.

### Performance rules

- Tree rows only render when visible (arborist handles it).
- Children fetched lazily per expand. No initial full-vault walk.
- `MarkdownRenderer` wrapped in `React.memo` keyed on `{path, content}`. Scrolling the tree does not re-render the preview.
- In-memory LRU cache in the page for the last 20 fetched file contents so back/forth between notes is instant.
- Filter is debounced 80ms and runs against loaded nodes only; it never hits disk.
- No Framer Motion per row. Expand is a CSS transition or instant.
- No `useLayoutEffect` attached to scroll. No per-row event listeners — delegated through the tree’s handler.
- Images: `loading="lazy" decoding="async"`.

### Pinned folder integration

- `PinEntry.path` in `src/lib/settings.ts` stays as-is (vault-relative folder path).
- The click handler currently opening `VaultDrawer` in `AppShell.tsx` becomes `router.push('/browse/' + encodePathSegments(path))`.
- Browse page header shows a "Pin this folder" toggle bound to the same `sidebar.json`.
- Pin dialog autocomplete (`/api/vault/folders`) unchanged.
- `<Reorder>` drag-reorder of pins unchanged.

### Drawer removal

- Delete `src/components/VaultDrawer.tsx` and its usages.
- Delete `GET /api/vault/structure` (drawer was the only caller).
- Remove `scopedPath` state in `AppShell.tsx`.
- Remove imports / props related to the drawer across the tree.

## Error handling

- `GET /api/vault/tree` missing path → 404, UI shows a "Folder not found" card with a link to `/browse`.
- `GET /api/vault/asset` missing file → 404, preview pane shows a broken-file card.
- `GET /api/file` failing on `.md` → preview shows the raw error card (reuses current file-page error UI pattern).
- Filter input matches nothing → tree shows a "No matches" row; clearing the filter restores the tree.
- Vault path changes (user switches vault) → localStorage keys include the vault path, so expand state stays scoped.

## Verification

Manual, via `pnpm dev`:

1. Root view — `/browse` lists every folder and loose file at the vault root, alpha-sorted, folders first. The test vault’s `skills`, `meetings`, `twitter`, `work` are all visible.
2. Deep expand — expand `twitter/2026/apr`; rows virtualize; memory usage steady; no jank at 500+ nodes.
3. Markdown preview — select an `.md` file; content renders with gfm tables, code blocks, wiki-links. Clicking a wiki-link updates `?file=` and re-renders without a page reload.
4. Image preview — select a `.png`; inline image renders; click opens zoom modal.
5. PDF preview — select a PDF; iframe viewer loads.
6. Other files — select a `.mp4`; card shows size/mtime + Reveal/Download buttons.
7. Pinned folder — click a pinned folder in the sidebar; navigates to `/browse/<path>`, that folder is expanded and selected.
8. Deep link — paste `/browse/projects/alpha?file=projects/alpha/notes.md` in a new tab; tree opens to it, preview shows the file.
9. Filter — type in the filter; only matching files/folders are visible within 80ms; ancestors stay expanded; Escape clears.
10. Keyboard — arrow keys move selection, `/` focuses filter, Enter previews, ⌘Enter opens full view.
11. Drawer gone — no route or button anywhere opens `VaultDrawer`; grep for `VaultDrawer` in `src/` returns zero results after the change.
12. Scroll — scrolling the tree at 10k nodes stays at 60fps on a 2024 MacBook Air.
13. Performance — profiling a fast flip between 20 files shows no repeated markdown re-render on unrelated state changes.

## Open risks

- `react-arborist` is well-maintained but adds a new dependency. Bundle impact ~30kb gzip.
- HEIC images are not browser-decodable; v1 shows them as "other" if server decode isn’t added.
- If the vault root has tens of thousands of top-level entries (rare), initial root fetch can feel slow. Mitigation: same 30s server cache; if it becomes a real issue, fetch the root in two batches.

## Next step

Once this spec is approved, hand off to the writing-plans skill to produce an executable implementation plan.
