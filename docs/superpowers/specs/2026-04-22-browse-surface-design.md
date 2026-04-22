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
- Matches the reading quality of tools like [scratch](https://github.com/erictli/scratch): math, mermaid, rich code highlighting, wiki-link autocomplete, raw ↔ rendered toggle, adjustable typography.

This spec replaces the drawer with a full-page Browse surface (tree + preview). A follow-up spec will cover writing dashboard task toggles back to the correct `.md` file; that work is explicitly out of scope here.

## Non-goals

- Drag-and-drop move, rename, delete, or create from the tree. Read-first surface.
- Full-text search across file contents (chat retrieval owns that).
- Mermaid / KaTeX / custom markdown extensions.
- Multi-select, bulk ops.
- Mobile layout. Below ~700px we show a “tree too narrow — open full view” fallback.
- Dashboard task writeback (separate spec).
- WYSIWYG editor. The `.md` source view (toggleable) is read-only in v1. Editing still happens in `/file/<path>` as today. Bringing a scratch-style TipTap editor to this app is its own follow-up spec.

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

### Markdown rendering enhancements

`MarkdownRenderer` (src/components/ui/MarkdownRenderer.tsx) already handles GFM, headings, wiki-links via `vault://` intercept. Extend it with:

- **KaTeX math** — inline `$…$` and block `$$…$$`. Add `remark-math` + `rehype-katex`. KaTeX CSS is lazy-loaded on first math render to keep cold-path bundle small.
- **Mermaid diagrams** — fenced code blocks with language `mermaid` render as SVG. Use the `mermaid` package. Lazy-load it on demand: the code-block renderer detects `language === "mermaid"` and dynamically imports the library + calls `mermaid.run()` against the rendered node. Fallback: if Mermaid fails, show the raw code block with a small error chip.
- **Syntax highlighting** — replace the plain `<code>` rendering with `rehype-shiki` using one light + one dark theme picked by the app theme. Shiki ships pre-built grammars; limit to the 20 most common languages to cap bundle (ts/tsx/js/jsx/py/go/rust/swift/java/kotlin/rb/php/sql/sh/bash/zsh/yaml/json/toml/html/css/md).
- **Images with captions** — an `<img>` directly inside a paragraph where the paragraph contains only that image becomes a `<figure>` with `alt` text as the `<figcaption>`. Relative image paths (e.g. `![](./screenshot.png)`) resolve to `/api/vault/asset?path=…` relative to the current file.
- **Wiki-link autocomplete** — when the `.md` source view is showing, typing `[[` opens a popover listing vault files filtered by substring. Source view is still read-only in v1 (no persistence), but the popover is useful for "find a file by typing its name" scanning. Reuses `/api/vault/folders` pattern but against files.
- **Task list semantics** — preserve existing `[ ]` / `[x]` checkbox rendering via `StatusDot`. Task toggling from the preview (writing back to the `.md`) is explicitly deferred to the separate Task writeback spec.
- **Heading anchors** — current `id="heading-…"` convention stays. Add a small "copy link" icon on hover for each heading that copies `/browse/<path>?file=<file>#heading-…` to the clipboard.

### Raw ↔ rendered toggle

- Icon button in the preview header (next to "Open full view"), labeled "Source". Toggles between rendered view and a read-only source view showing the raw `.md`.
- Keyboard shortcut: `⌘⇧M` (same as scratch; standard enough to remember).
- Source view uses CodeMirror 6 in read-only mode with markdown syntax highlighting, soft-wrap, line numbers off, same typography as the rendered view (so the font choice applies everywhere).
- Toggle state is per-file during the session but resets on navigation to avoid a surprising "everything is suddenly source" when switching files. (A sticky default can be revisited later.)

### Reader preferences

A panel accessible from the preview header via a "Reader settings" icon (or `⌘,`). Applies to the markdown preview and source view only — not to the rest of the app chrome (sidebar, dashboard, etc. keep their own styling).

- Typography: font family (Sans / Serif / Mono), size (12–20px), bold weight (Regular / Medium / Semibold / Bold), line height (1.3–2.0, 0.1 step), text direction (LTR / RTL).
- Page width: Narrow (56ch) / Comfortable (72ch, default) / Wide (96ch) / Custom (px).
- Zoom: 75–150%, 5% step. Applies only to preview content.
- Persisted in `localStorage` under `cipher.reader-prefs.v1`. Vault-agnostic — one set of prefs across all vaults.
- Implementation: all prefs map to CSS custom properties on the `.markdown-content` root (`--md-font`, `--md-size`, `--md-line-height`, `--md-weight`, `--md-dir`, `--md-max-width`, `--md-zoom`). The renderer never reads prefs directly; styles are the single source of truth.

### App-wide theme (light / dark / system)

Separate from reader prefs. Already partially present; this spec makes it explicit:

- Top-level toggle in a general Settings surface: Light / Dark / System. System follows `prefers-color-scheme`.
- Applies a `data-theme` attribute on `<html>` which all app styles key off.
- Shiki themes and KaTeX dark-mode styles switch with this.

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
- KaTeX CSS and `mermaid` package are dynamically imported on first use only. Neither sits in the initial bundle.
- Shiki highlighter is initialized lazily per language on first render. Grammars cached in a module-scope `Map`.
- CodeMirror (raw view) is dynamically imported on first toggle to source view.
- Reader-pref CSS variable changes do not retrigger the markdown parse — they re-style the already-rendered DOM.

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
14. Math — a file with `$E = mc^2$` and a block `$$\int_0^1 x^2 dx$$` renders correctly; KaTeX CSS only loads when the first math file is opened.
15. Mermaid — a file with a ` ```mermaid ` flowchart block renders the diagram; `mermaid` is not in the initial bundle (verify via Network tab).
16. Code highlighting — `.md` with fenced `ts`, `py`, `rust`, `sql`, `bash` blocks renders each with syntax colors; switching app theme flips to the matching Shiki theme without flash.
17. Image caption — `![A diagram of the system](./diagram.png)` renders as `<figure>` with the alt as caption; the image src resolves via `/api/vault/asset`.
18. Raw toggle — `⌘⇧M` on an open `.md` flips to source view; shortcut reverses; state does not persist across navigation.
19. Reader prefs — changing font size in the reader-settings panel updates the current preview without a remount and persists after reload. Setting page width to Wide widens the rendered content but does not touch the sidebar.
20. Theme — switching app theme to Dark updates Shiki + KaTeX + app chrome; reloading respects the stored choice.

## Open risks

- `react-arborist` is well-maintained but adds a new dependency. Bundle impact ~30kb gzip.
- Mermaid is ~450kb gzipped. Hard requirement: lazy-loaded, never in the initial bundle.
- Shiki is ~120kb gzipped for the grammar set we pick. Lazy-loaded per language on first use.
- KaTeX CSS is ~50kb. Lazy-loaded the first time a math-containing file renders.
- If the combined render bundle on a math-heavy note feels too big on slow connections, we can defer Mermaid further behind a per-file opt-in.
- HEIC images are not browser-decodable; v1 shows them as "other" if server decode isn’t added.
- If the vault root has tens of thousands of top-level entries (rare), initial root fetch can feel slow. Mitigation: same 30s server cache; if it becomes a real issue, fetch the root in two batches.

## Next step

Once this spec is approved, hand off to the writing-plans skill to produce an executable implementation plan.
