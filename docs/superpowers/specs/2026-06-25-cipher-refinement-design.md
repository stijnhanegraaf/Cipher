# Cipher Refinement — Design Spec

- **Date:** 2026-06-25
- **Branch:** `refinement`
- **Status:** Approved design, ready for implementation plan
- **Author:** Stijn (with Claude Opus 4.8)

## 1. Purpose

Refine Cipher's UI to feel genuinely crafted (in the spirit of the
`multica` and `paperclip` reference apps), implement the missing Obsidian
reading features, make search correct and trustworthy, eliminate dead ends
and wrong-data surfaces, and raise code quality — all without degrading the
parts that are already good.

This is a multi-phase effort on the `refinement` branch. Each phase is
independently shippable and ends "green" (tests + typecheck + lint pass,
manual verification on the sample vault, committed).

## 2. Current state (grounding)

Cipher is a local-first **Next.js 16 / React 19 / TypeScript (strict)** app
(~25.5k LOC) that reads an Obsidian-style markdown vault from the filesystem
and renders an AI-native reader: file browser, markdown reader, ⌘K command
palette, streaming chat with hybrid keyword+embeddings retrieval, a hand-rolled
force-directed graph, plus Today/System/Timeline/Search pages and a
hot-swappable vault-connect flow. It is deliberately read-only.

**What's genuinely good (must be preserved):**
- The `lib/chat/` AI subsystem: provider abstraction (Ollama/OpenAI/Anthropic),
  embedder resolver with graceful keyword-only degradation, atomic on-disk
  embedding index with mtime invalidation, token-budgeted hybrid retrieval,
  citation parsing.
- The three-tier **vault-layout probe** (`getVaultLayout()`) that makes Cipher
  work on arbitrary vault structures.
- `view-models.ts` as a single typed contract; the `view-builder` → `builders/*`
  split.
- URL-as-state for the detail sheet (`useSheet`) and `?file=`/`?sheet=` deep links.
- Atomic, vault-portable settings under `.cipher/`.
- Typing discipline: `strict: true`, exactly one `any` (justified), zero
  TODO/FIXME rot, only targeted lint disables.

**Concentrated problems (what this effort fixes):**
- **Search renders almost nothing.** `buildSearchResults()` tags results with a
  `kind` vocabulary (`note`/`project`/`research`/…) that does not match what the
  UI groups by (`canonical_note`/`topic`/…); only `entity` overlaps, so most
  results are computed but dropped. Header still shows "Found N results".
- **Backlinks not shown while reading.** Computed in `vault-graph` and shown in
  the graph HUD + structure preview, but the main reader (`DetailPage`, `/file`)
  shows only TOC + frontmatter + content. The README claims otherwise.
- **Tags are display-only** (not clickable/searchable/navigable). **No embeds
  `![[...]]`, no callouts `> [!note]`, no canvas, no block references.**
- **Dead ends / wrong data:** missing `/api/browse/hints` → fake "Alice / Q3 plan"
  chat chips shown to everyone; orphaned `/audit` route hardcoded to the author's
  vault and unreachable from the UI; misrouted `/files` slash command; wiki-links
  bypass `/api/resolve` so most 404; decorative Timeline range filter; absent
  empty/error states on Topic/Entity/Search/Graph; `alert()` as a failure path;
  chat answers rendered as raw (unformatted) markdown.
- **Code-structure debt:** god files (`globals.css` 1700, `GraphCanvas` 1279,
  `DetailPage` 1043, `vault-reader` 957, `intent-detector` 849), duplicated and
  drifted search engines (incl. an unescaped-regex/ReDoS bug in dead code),
  ~7 reimplementations of the directory walk, 4 hand-rolled frontmatter parsers,
  3 copied `safeJoin`s (with the write endpoints `/api/file` PUT and `/api/toggle`
  missing the escape check), an abandoned `vault-reader` split, fetch-on-mount in
  21 components with no data layer, **zero tests**.
- **Privacy contradiction:** KaTeX + highlight.js CSS load from a jsDelivr CDN at
  runtime, contradicting "nothing leaves your machine".
- **Personal infra in a public repo:** `scripts/context-sync-calendar.js` and
  `scripts/memory-diff-check.js` hardcode the author's iCloud UUIDs, email,
  secrets paths, depend on an uninstalled `rrule`, and cannot run here.

## 3. Goals / Non-goals

**Goals**
- A codified, enforced design-system foundation (OKLCH tokens, typeset markdown,
  motion grammar, interaction states) that every feature inherits.
- Obsidian reading-parity: backlinks, outgoing links, navigable tags, embeds,
  callouts, block references, robust frontmatter, Canvas rendering, tag-graph.
- One correct, tested search engine; expose semantic search in the general UI.
- Zero dead ends; correct data everywhere; complete empty/loading/error states.
- A test foundation (Vitest) covering the pure `lib/` core; refactor-as-we-go.
- One lightweight write: daily-note creation.
- Target arbitrary vaults: generalize the audit dashboard; remove personal infra.

**Non-goals (this round)**
- Full editing (inline note editing, properties editing UI, templates beyond the
  daily-note default). Cipher stays a reader; daily-note creation is the only write.
- A deep architectural overhaul (RSC migration of bespoke pages, replacing the
  `/api/query`-with-sentences indirection with typed endpoints, unifying the two
  file-tree data sources). Recorded as future work.
- Swapping Cipher's bespoke components for shadcn/ui. We refine the existing
  components in place.
- Community themes / CSS snippets.

## 4. Locked decisions

| # | Decision | Choice |
|---|---|---|
| 1 | Write scope | Read-only reading parity **+** daily-note creation (the one write) |
| 2 | Design depth | **Full foundation rebuild**, keeping bespoke components (no shadcn) |
| 3 | Heavy features | **All in:** Canvas rendering, block references, tag-graph coloring/filtering, daily-note |
| 4 | Code-structure work | **Refactor-as-we-go + fix bugs + tests** (no deep RSC overhaul) |
| 5 | Audit dashboard | **Generalize it** onto the layout probe + data spine + tokens, wired into nav |
| 6 | Target audience | **Arbitrary third-party vaults**; remove personal scripts |
| 7 | Sequencing | **Approach A:** foundation-first → features in dependency order → polish sweep last |

## 5. Design-system foundation

A written constitution comes first; every later phase is built in it.

### 5.1 `docs/DESIGN.md` (new artifact, authored in Phase 0)
A one-page constitution modeled on multica's `design.md`: the rules, an explicit
forbidden list, and a pre-commit checklist. Cipher is a **reader**, so it defines
**two typographic registers**:

- **Chrome (UI):** restrained — a tight size scale, two weights, hierarchy via
  color + spacing (not bold). Applies to sidebar, palette, toolbars, lists, cards.
- **Reading surface (note content):** generous and typeset — rem heading scale
  with slight negative letter-spacing, comfortable line-height, muted list
  markers, `text-wrap:balance` on headings, themed links. This is the product's
  primary surface; the existing `reader-prefs` model (serif/sans, size, width,
  line-height, zoom) is finally surfaced in the UI (toolbar + settings).

**Forbidden list (enforced):** no raw hex or Tailwind palette classes outside the
token layer; no arbitrary one-off values where a token exists; weights limited to
the two-weight chrome rule; no scale-on-hover; no spring/bounce easing except
intentional, named exceptions.

### 5.2 Color → OKLCH tokens
`globals.css` is already a CSS-custom-property token system and components already
consume `var(--token)`, so this is a **values migration, not a rename** (low churn):
- Convert token values to OKLCH; **design dark mode intentionally** (deep-gray
  background, not black; borders as white at low alpha; semantics brightened for
  contrast) rather than inverting light.
- Add `color-mix`-derived **state tokens** (hover/active/selected) so interaction
  states cannot drift.
- Add **per-entity single-hue tokens** for tags / note-kinds / link-states, with
  one `.chip` helper that `color-mix`es fill + text + border for both themes
  (add a color by adding one hue).
- One `--radius` scaled via `calc()`.
- Reorganize `globals.css` (1700 LOC) into token / base / component layers.

### 5.3 Motion grammar
One signature easing; fixed durations (150ms color/opacity, 200ms expand);
ease-out; no bounce; hover changes background only. A handful of purpose-built CSS
`@keyframes` (note-open fade, search-result enter, indexing shimmer), each guarded
by `prefers-reduced-motion`. Keep framer-motion only for genuinely complex cases
(detail sheet, graph); stop using it for what CSS does better.

### 5.4 Interaction & chrome details
- **Active-survives-hover** rule (a selected row stays distinct while hovered).
- `focus-visible` ring token; 1px press translate.
- Thin, stable-gutter (`scrollbar-gutter: stable`), hover-revealed, theme-aware
  scrollbars.
- 44px touch targets only under `pointer: coarse`, with documented exemptions for
  genuinely small inline controls; `touch-action: manipulation`.
- No-flash pre-paint theme bootstrap (already present) extended to sync
  `<meta name="theme-color">`.
- A few bespoke SVG glyphs for Cipher-specific concepts (cipher identity,
  embedding/index state), using `currentColor` so they inherit tokens.

### 5.5 Enforcement
An ESLint rule (or, if impractical, a CI grep) that bans raw hex / Tailwind
palette classes outside the token layer, plus the optional lint+typecheck+test CI
gate, so "no AI slop" is mechanically enforced.

## 6. Phase 0 — Foundation + safety net + high-trust bug fixes

**Safety net**
- Add **Vitest**, `test:unit`, and `typecheck` scripts; seed tests on the pure
  `lib/` core.
- **Shared utilities** replacing duplication:
  - one recursive `walkMd` (replaces ~7 divergent copies; consistent depth +
    ignore list for `node_modules`/`.git`/`.obsidian`/`.cipher`);
  - one `safeJoin` (replaces 3 copies **and** adds the missing escape check to
    `/api/file` PUT and `/api/toggle` write endpoints);
  - a **real YAML frontmatter parser** (a small dependency, e.g. `yaml`), replacing
    the 4 hand-rolled parsers; handles multi-line lists, nesting, dates.
- **Vendor KaTeX + highlight.js CSS locally** (remove the jsDelivr CDN runtime
  dependency).

**Independent high-trust bug fixes** (no feature dependency)
- Wiki-links route through `/api/resolve` before opening (fixes most `[[...]]`
  404s where display text ≠ path).
- Replace hardcoded `vault=Obsidian` with the real `vault.name` in `DetailPage`
  and `MarkdownRenderer` "Open in Obsidian" links.
- The missing `/api/browse/hints`: implement it to return real suggestions derived
  from the vault's entities/projects/recent notes (the fake "Alice / Q3 plan"
  fallback chips in `ChatEmptyState` are removed once real hints exist).
- Fix the misrouted `/files` slash command (currently lands on Today).
- Wire graph + health cache invalidation to file writes (`/api/file`, `/api/toggle`).
- Minimal fix to the search kind-mismatch so results **render now** (full
  unification lands in Phase 3).
- Remove `scripts/context-sync-calendar.js` and `scripts/memory-diff-check.js`
  from the repo.
- Fix stale `docs/ARCHITECTURE.md` references (files that no longer exist).

## 7. Phase 1 — Renderer features

All in `MarkdownRenderer` (decomposed as we touch it: preprocessor + component
overrides + callout renderer).

- **Typeset markdown:** apply §5 reading-surface styles — heading scale, muted
  markers, `color-mix`-themed links, dark fenced-code with a hover copy button,
  horizontally-scrollable tables, `text-wrap:balance`.
- **Callouts** `> [!type]`: parse the blockquote-callout syntax; render per-type
  icon + color from the per-hue tokens; support the collapsible `[!type]-` variant.
- **Embeds / transclusion** `![[note]]`, `![[note#heading]]`, `![[note#^block]]`,
  `![[image]]`: resolve via the resolver and inline-render the referenced section
  or image. **Recursion guard:** depth limit + cycle detection; clean
  "embed not found" state.
- **Block references** `[[note#^blockid]]`: resolve block anchors; validate heading
  anchors against the target's actual headings.
- **Chat answers render as markdown:** route streamed answers through the same
  renderer with streaming-safe incremental rendering (tolerate incomplete syntax
  mid-stream).

## 8. Phase 2 — Navigation features

Decompose `DetailPage` (1043) into a thin coordinator + TOC + properties +
backlinks panel + a `useFileContent` hook.

- **Backlinks panel** ("Linked mentions" with a per-mention context snippet) in
  both the `DetailPage` sheet and the `/file` full page. Source: `vault-graph`.
- **Outgoing-links panel:** resolved links out of the note.
- **Navigable tags:** clickable everywhere; a **tag page** `/browse/tag/[tag]`
  listing notes with that tag; tags as a **search scope**; tags shown in the detail
  sheet. Tag extraction from frontmatter (via the new YAML parser) + inline `#tag`.
- **Tag-graph coloring/filtering:** color graph nodes by tag and filter the graph
  by tag in `MapPage`/`GraphCanvas`. Extract a testable `ForceSimulation` class +
  `renderGraph` + `useGraphControls` **only as far as tag-coloring requires**
  (full `GraphCanvas` extraction is a bonus, not a requirement — it is the riskiest
  file).

## 9. Phase 3 — Search unification

- **One engine:** shared `collectVaultFiles()` (whole-vault via the new `walkMd`,
  fixing the "files outside known folders are unsearchable" gap) + one
  `scoreFileAgainstTerms()`. Both the palette and the full-text page consume it.
  Delete the dead `searchVault` duplicate and its unescaped-regex/ReDoS bug.
- **Fix every search bug together:** unify the result `kind` vocabulary with the
  UI's grouping (the "Found N / empty list" bug); recency boost applies only to
  matched files; **stop silently dropping short (≤2-char) terms** — score them too;
  search **frontmatter + tags** (never searched today); fix excerpts (locate around
  any matched term, preserve casing).
- **Expose semantic search** in the general Search UI via a "semantic" toggle that
  reuses `retrieval.ts` (gracefully degrades to keyword when no embedder).
- **FileTree filter fix:** filter against a full index, not only expanded/loaded
  nodes.

## 10. Phase 4 — Heavier views + the one write

- **Canvas (`.canvas`) rendering:** read-only render of Obsidian Canvas JSON
  (text/file/link/group nodes + edges) with pan/zoom, reusing interaction patterns
  from the existing graph canvas; isolated in its own view. MVP = text/file/image
  nodes + edges + pan/zoom; cosmetics (group styling, edge labels) deferred if
  time-pressed. Parser is pure and unit-tested.
- **Generalize the audit dashboard:** rebuild onto the layout probe + data spine +
  design tokens (it currently uses raw Tailwind palette classes and breaks in light
  mode); graceful empty state when no audits folder exists; wire into nav +
  command palette (it is currently unreachable).
- **Daily-note creation** (the one write): a "Create today's note" action (palette
  command + Today-page button) using a template (from the vault's template folder
  if detected, else a minimal default), respecting the journal folder + date format
  from the layout probe, via the existing atomic-write pattern. **Never overwrites:**
  if today's note exists, open it.

## 11. Phase 5 — Polish sweep

- Complete **empty / loading / error / not-found** states everywhere (Topic,
  Entity, Search, Graph, FileTree, Image/Pdf previews, chat offline banner, audit).
- Replace `alert()` (TodayPage) with the existing toast system.
- Apply the **motion grammar** consistently; replace ad-hoc inline-JS hover
  handlers with CSS `:hover` gated by `@media (hover:hover)` (fixes stuck hover on
  touch).
- Replace stray emoji glyphs (🔗 copy-link, `▼`, `▌` cursor) with the SVG icon
  language.
- Standardize loading states (shimmer/skeleton) across pages.
- Accessibility pass: focus management, reduced-motion consistency, drag handles +
  keyboard reorder for pinned items, ARIA on custom controls.
- Verify no dead ends remain (the `/audit` link, `/files` route, wiki-link resolve,
  Timeline range filter all functional).

## 12. Testing strategy

- **Vitest** unit tests on the pure `lib/` core: `fuzzy`/`rankScore`,
  `intent-detector` classification, `vault-tree.buildTree`, the unified search
  scorer, the new YAML frontmatter parser, the wiki-link/embed resolver (incl.
  block/heading-anchor resolution), the callout parser, the Canvas JSON parser,
  and `safeJoin` (fuzz with `../` escapes — it is a security boundary).
- **Light component tests** (React Testing Library) for: search results rendering
  with the kind fix; the backlinks panel.
- **Per-phase manual verification** on `public/sample-vault` via the dev server
  (drive + screenshot key flows).
- **CI gate** (recommended): GitHub Action running `lint` + `typecheck` +
  `test:unit`.

## 13. Code-structure decomposition (refactor-as-we-go)

Only files each phase already touches:
- `MarkdownRenderer` (512) → preprocessor + overrides + callout renderer — Phase 1.
- `DetailPage` (1043) → coordinator + TOC + properties + backlinks + `useFileContent`
  hook — Phase 2.
- `vault-reader` (957) → finish the abandoned split (extract parse-primitives /
  layout-probe / resolver), dedupe verbatim-duplicated helpers, kill dead code, fix
  the `vault-reader`/`vault-readers` naming trap — opportunistically across phases.
- search duplication → one module — Phase 3.
- `GraphCanvas` (1279) → extract `ForceSimulation` + `renderGraph` + `useGraphControls`
  to the extent tag-coloring needs — Phase 2/4.
- `globals.css` (1700) → token / base / component layers — Phase 0.
- A small typed `api-client` + `useResource` hook, introduced **only where we
  already touch** fetch-in-component code (not a blanket migration).

## 14. Risks & mitigations

1. **OKLCH migration touches everything visual** → keep token *names* stable
   (migrate values only); do it in Phase 0 while feature surface is small; QA with
   before/after screenshots.
2. **Embed recursion / cycles** → depth limit + cycle detection + tests.
3. **Canvas scope balloons** → isolated read-only view; time-boxed MVP; defer
   cosmetics.
4. **Decomposing Graph/DetailPage regresses behavior** → extract pure logic first
   with tests; keep behavior identical; decompose only what the phase needs.
5. **Daily-note clobbering** → never overwrite; open existing; atomic write;
   respect detected format.
6. **Streaming markdown renders partial syntax oddly** → tolerate incomplete
   syntax mid-stream; test with partial inputs.
7. **Large overall scope** → every phase independently shippable and ends green;
   can pause / reprioritize between phases.

## 15. Sequencing & verification gates

| Phase | Delivers | Green when |
|---|---|---|
| 0 Foundation | DESIGN.md, OKLCH tokens, Vitest, shared utils, independent bug fixes | tokens migrated + visually verified; safeJoin/walk/YAML shared & tested; high-trust bugs fixed |
| 1 Renderer | typeset markdown, callouts, embeds, block refs, chat-markdown | parser/resolver tests pass; renders correctly on sample vault |
| 2 Navigation | backlinks + outgoing panels, navigable tags, tag-graph | backlinks/tags work in sheet + full page; DetailPage decomposed |
| 3 Search | one unified, correct, tested engine; semantic toggle | search returns correct grouped results; scorer tests pass |
| 4 Heavy views | Canvas, generalized audit, daily-note | canvas renders sample; audit works on arbitrary vault; daily-note safe |
| 5 Polish | every empty/error state, motion grammar, dead-end fixes, a11y | no dead ends; consistent states; reduced-motion clean |

**Execution model:** planned with Opus 4.8; implemented by Sonnet with review
checkpoints. Work on the `refinement` branch, one phase per chunk, each ending with
tests + typecheck + lint + manual verify + commit.

## 16. Out of scope (future work)
- RSC migration of bespoke pages + a real client data layer (kill fetch-on-mount
  waterfalls and `useVault` fan-out).
- Replace the `/api/query`-with-sentences indirection with typed endpoints
  (`/api/system`, `/api/entity?name=`).
- Unify the two file-tree data sources (react-arborist HTTP tree vs graph-derived
  Miller columns).
- Full editing (note editing, properties UI, templates), community themes.
