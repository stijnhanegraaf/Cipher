# Cipher Phase 1 — Renderer Features — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add the Obsidian reading features that live in the markdown renderer — callouts, embeds/transclusion, block references + heading-anchor validation, and chat-answer markdown rendering — while decomposing `MarkdownRenderer.tsx` into focused, tested modules as the features land.

**Architecture:** `MarkdownRenderer.tsx` does all semantic work via react-markdown `components` overrides (no remark/rehype AST plugins beyond gfm/math/katex/highlight; `unist`/`mdast` are NOT installed and **no new deps are added** this phase). We extract side-effecting blocks and the components map into modules first (Tasks 0–2), then add features as override branches + a unified preprocessor + one shared anchor/section extractor. Embeds and block-refs need a server fs read (`/api/embed`, anchor validation on `/api/resolve`); callouts and chat-markdown are pure client. All new color is token-only (the `cipher-design/no-raw-color` rule enforces it; lint is at 0 and must stay 0).

**Tech Stack:** Next.js 16.2.3, React 19.2.4, TypeScript strict, Tailwind v4, react-markdown 10, Vitest. No new dependencies.

## Global Constraints

- **TypeScript `strict: true`** — no new `any`.
- **Token-only color** — no raw hex/`rgb()`/`hsl()`/Tailwind palette classes outside `globals.css` `:root`/`.light`; `cipher-design/no-raw-color` will error otherwise. New colors = new `--token`s (reuse `--hue-*`/`--accent-*`/`--status-*` where possible).
- **Lint stays 0** — every task ends with `npm run lint` exit 0 (no new findings, no new disables without a `-- reason`).
- **Conventional Commits**, ONE commit per task; footer exactly: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Every task ends green:** `npm run typecheck && npm run test:unit && npm run build` pass AND lint 0. RUN THE FULL GATE (incl. typecheck) before committing.
- **Don't rename existing exports** (`MarkdownRendererProps`, the `ui/index.ts` surface, `CheckboxIndicator`/`StatusDot` re-exports) — decomposition must keep the public API frozen.
- **Reuse Phase-0a/0b primitives:** `parseWikiTarget` (`src/lib/markdown/wikilink.ts`), `resolveLink` + `/api/resolve`, the per-hue chip/token system, the motion grammar (`--ease-signature`/`--dur-*` + reduced-motion guards), the `CodeBlock`/`.typeset` patterns.
- **Branch:** `refinement`.

## Resolved decisions (front-loaded — do not re-litigate)

1. **ONE shared extractor module `src/lib/markdown/anchors.ts`** owns `findBlockById`, `slugifyHeading`, `headingSlugs`/`headingTexts`, `validateAnchor`, and `extractSection`. Embeds, block-refs, and anchor-validation all consume it. Do NOT ship two block parsers (three drafts each invented one).
2. **12 callout types + alias map** per the callouts draft (not the 6-type subset). Unknown types fall back to canonical `note` while preserving `rawType`.
3. **Embed encoding = `embed://` link-sentinel** in the preprocessor (NOT `rehype-raw` — avoids a new plugin). The embed pass runs in the unified `preprocess.ts`, **ordered before** wiki-links (it consumes the leading `!`). Emit the `embed://` token on its own line to avoid invalid `<p>`/`<a>` nesting.
4. **Server vs client:** note/section/block content fetch + anchor validation = server (`/api/embed`, `/api/resolve`); image/PDF/AV embeds reuse `/api/vault/asset` (must NOT hit `/api/embed`); callouts + chat-markdown are pure client.
5. **No new dependencies** (no `unist`/`mdast`/`rehype-raw`/icon lib) — hand-roll SVG icons following `FileKindIcon.tsx`/`wikiLinkIcon` convention.
6. **Recursion (embeds) needs TWO guards** + a server backstop: a React-context depth counter (`MAX_EMBED_DEPTH=4`) AND an ancestor-path cycle set, plus the `/api/embed` `depth` param. A parse cache does NOT prevent render recursion.
7. **Streaming markdown (chat) correctness is step-ORDER-dependent:** protect `[^N]` citations → sentinel FIRST (remark-gfm eats `[^N]` as footnotes otherwise), then close fences, etc. A monotonic-prefix regression test is the flicker guard.

## Draft source files (paste-ready content + exact test tables)

`.superpowers/sdd/p1-drafts/{callouts,embeds,blockrefs,chat-markdown,decomposition}.md` — each task points to its section.

## Task ordering

`0 decomp-prep → 1 components factory → 2 unified preprocessor → 3 callouts → 4 shared anchors → 5 embeds → 6 block-refs → 7 chat-markdown`. Tasks 0–2 are pure decomposition (no features); 3 is the first feature (smallest surface); 4 is the shared foundation before 5/6; 7 depends only on Task 1 and can be picked up any time after.

---

## Task 0: Decomposition prep — lift side-effecting blocks

**Files:** Create `src/components/ui/markdown/hljs-theme.ts`, `src/components/ui/markdown/MermaidBlock.tsx`, `src/components/ui/markdown/CopyHeadingLink.tsx` (with `wikiLinkIcon` + `textToId`). Modify `src/components/ui/MarkdownRenderer.tsx`. Source: `.superpowers/sdd/p1-drafts/decomposition.md` (R1, R2, R4).

**Interfaces:** Produces `ensureHljsCss()`, `MermaidBlock`, `CopyHeadingLink`, `textToId(children)` (now exported + testable).

- [ ] **Step 1:** Move the hljs CSS loader (R1) verbatim into `hljs-theme.ts`; export `ensureHljsCss`. Update the renderer import.
- [ ] **Step 2:** Move `MermaidBlock` (R2) into its own file. **Drop the raw-hex fallback `…,#c0392b` at the current L68** (the no-raw-color rule runs on the new path) — replace with a token (`var(--status-blocked)`) or the mermaid theme's named value.
- [ ] **Step 3:** Move `CopyHeadingLink` + `wikiLinkIcon` + `textToId` (R4) into `CopyHeadingLink.tsx`; export `textToId`.
- [ ] **Step 4:** Write `src/components/ui/markdown/textToId.test.ts` (node env) — `textToId` smoke: nested children → slug string.
- [ ] **Step 5:** Verify — `npm run typecheck && npm run test:unit && npm run build` green; lint 0; grep confirms `#c0392b` gone.
- [ ] **Step 6:** Commit (`refactor(markdown): lift hljs/mermaid/heading-link out of MarkdownRenderer`).

---

## Task 1: Decomposition — components factory

**Files:** Create `src/components/ui/markdown/components.tsx`; modify `MarkdownRenderer.tsx` (becomes a thin shell). Source: `decomposition.md` Seam B.

**Interfaces:** Produces `createMarkdownComponents({ onNavigate }): Components` (the react-markdown override map). `MarkdownRendererProps` and the `ui/index.ts` surface stay frozen.

- [ ] **Step 1: Write the failing test** `src/components/ui/markdown/components.test.tsx` (`// @vitest-environment jsdom`) — render a representative doc (heading, link, list, inline+fenced code, table, blockquote) through the factory's components via MarkdownRenderer; assert key nodes render (heading anchor id, a `md-link`, a `CodeBlock`). RED.
- [ ] **Step 2:** Extract the `components={…}` map (current ~L173–421) verbatim into `createMarkdownComponents`. Keep behavior byte-identical (same classes, same overrides). `MarkdownRenderer` calls the factory in its `useMemo`.
- [ ] **Step 3: GREEN** + verify full gate + lint 0.
- [ ] **Step 4:** Commit (`refactor(markdown): extract react-markdown components into a factory`).

---

## Task 2: Decomposition — unified preprocessor

**Files:** Create `src/lib/markdown/preprocess.ts` + `preprocess.test.ts`; modify `MarkdownRenderer.tsx` `useMemo`. Source: `decomposition.md` Seam A.

**Interfaces:** Produces `preprocessMarkdown(src: string, opts: { interactive: boolean }): string` — unifies the two existing wiki-link functions (obsidian:// vs vault://) into one pipeline (the embed stage is added in Task 5).

- [ ] **Step 1: Write `preprocess.test.ts`** (node env) FIRST — both modes: `[[a|b]]` interactive → `vault://` + alias label; non-interactive → `obsidian://` with real vault name; plain text untouched. RED.
- [ ] **Step 2:** Implement `preprocessMarkdown` consolidating `preprocessWikiLinks`/`preprocessWikiLinksDataAttr`. GREEN.
- [ ] **Step 3:** Verify full gate + lint 0. Commit (`refactor(markdown): unify wiki-link preprocessing`).

---

## Task 3: FEATURE — Callouts

**Files:** Create `src/lib/markdown/callout.ts` + `callout.test.ts`, `src/components/ui/Callout.tsx` (+ `CalloutIcon`). Modify `components.tsx` (blockquote override), `globals.css` (missing `--hue-*` tokens + `.callout--*` rows + `<details>` styling). Source: `.superpowers/sdd/p1-drafts/callouts.md` (full content + the ~13-case test table).

**Interfaces:** Produces `parseCallout(firstLine): Callout | null` (pure) and the `Callout` component. `Callout = { type, rawType, title, foldable, defaultOpen }`.

- [ ] **Step 1: Write `callout.test.ts`** FIRST from the draft's table (plain, custom title, lowercase, fold `-`/`+`, alias `hint`→`tip`/`summary`→`abstract`, unknown→`note` fallback, `[!]`→null, leading-`>` tolerant, whitespace trim, fold-no-title). RED.
- [ ] **Step 2:** Implement `callout.ts` — regex `/^\s*>?\s*\[!([^\]]+)\]([-+]?)\s*(.*)$/`, alias map, `foldable`/`defaultOpen` rules; `title` raw or null (default-title is a render concern, kept out of the parser). GREEN.
- [ ] **Step 3:** Implement `Callout.tsx` (`"use client"`): non-foldable → `<div class="callout callout--TYPE">` + `.callout__title` (icon + `title ?? defaultTitle(type)`) + body; foldable → `<details open={defaultOpen}>` + `<summary class="callout__title">` (icon + title + chevron with motion-grammar rotate + reduced-motion guard). `CalloutIcon` = hand-rolled SVG switch over the 12 types (currentColor).
- [ ] **Step 4:** Wire the `components.tsx` blockquote override: extract the first line via a `firstLineText(children)` helper; `parseCallout` → if null render `<blockquote>` unchanged (zero regression); else strip the marker token from the first paragraph and render `<Callout>`.
- [ ] **Step 5:** `globals.css` — add the missing `--hue-*` tokens (near the existing hue block, aliasing semantic tokens; new hues follow the `--hue-idea` precedent in `:root`/`.light` only), the missing `.callout--TYPE` rows, and `<details>`/`<summary>` callout styling. Token-only.
- [ ] **Step 6:** Verify — Vitest `parseCallout` green; full gate + lint 0. **Dev-server visual check** (controller, if browser available): callout colors/icons/collapse in light + dark.
- [ ] **Step 7:** Commit (`feat(markdown): render Obsidian callouts`).

---

## Task 4: Shared anchor/section extraction (foundation, no UI)

**Files:** Create `src/lib/markdown/anchors.ts` + `anchors.test.ts`. Source: `.superpowers/sdd/p1-drafts/blockrefs.md` + `embeds.md` (reconciled into one module per decision #1).

**Interfaces:** Produces (all pure, node-tested):
- `findBlockById(content, id): { line: number; text: string } | null`
- `slugifyHeading(text): string`
- `headingSlugs(content): string[]` / `headingTexts(content): string[]` (fenced-code excluded)
- `validateAnchor(content, anchor): { kind: "none"|"block"|"heading"; valid: boolean; value: string }`
- `extractSection(content, anchor, isBlock): string` (whole / heading same-or-higher-level slice / block slice; CRLF-safe)

- [ ] **Step 1: Write `anchors.test.ts`** FIRST — the full matrix from the drafts: `findBlockById` (id with/without `^`, own-line, list item, mid-line non-match, first-of-dupes, empty→null); `slugifyHeading` cases; `headingSlugs` excludes `#` inside a fence; `validateAnchor` none/block/heading valid+invalid (case-insensitive text OR slug); `extractSection` heading-includes-child + stops-at-same-or-higher-level (fixes the `extractSections` descendant bug), block paragraph/list/table, missing→empty/found:false. RED.
- [ ] **Step 2:** Implement `anchors.ts` (reuse `extractSections`' heading regex; strip fenced code before heading scan). GREEN.
- [ ] **Step 3:** Verify (pure — no build-visual): `npm run test:unit -- src/lib/markdown/anchors.test.ts` green; typecheck + lint 0. Commit (`feat(markdown): shared anchor/section extraction`).

---

## Task 5: FEATURE — Embeds / transclusion (RISKIEST — recursion)

**Files:** Create `src/lib/markdown/embed.ts` + test, `src/lib/markdown/embed-guard.ts` + test, `src/app/api/embed/route.ts` + test, `src/components/ui/markdown/Embed.tsx` + `EmbedDepthProvider`/`EmbedGuardContext`. Modify `preprocess.ts` (add `rewriteEmbeds` stage, ordered before wiki-links), `components.tsx` (`a`-override branches on `embed://`). Source: `.superpowers/sdd/p1-drafts/embeds.md`.

**Interfaces:** `parseEmbed(inner): { target, anchor, kind: "image"|"pdf"|"av"|"note" }` (reuses `parseWikiTarget`); `checkGuard(depth, ancestors, target): { ok: boolean; reason?: "depth"|"cycle" }` with `MAX_EMBED_DEPTH=4`; `GET /api/embed?path=&anchor=&depth=` → resolved section content or typed error.

- [ ] **Step 1: TDD `parseEmbed`** (classifies image/pdf/av by extension, note otherwise; splits anchor via `parseWikiTarget`). RED→GREEN.
- [ ] **Step 2: TDD `checkGuard`** — depth boundary at `MAX_EMBED_DEPTH`, self-embed (cycle), A→B→A (ancestor set). RED→GREEN.
- [ ] **Step 3: `/api/embed` route** + test (mirror `toggle/route.test.ts`): `resolveLink` → `safeJoin`/`readVaultFile` → `extractSection` (Task 4). Status codes: 200 (heading + block), 404 note-not-found, 404 section-not-found, 409 depth exceeded, 400 traversal. Images are NOT served here.
- [ ] **Step 4: `Embed.tsx`** — fetches `/api/embed` for note embeds, renders a NESTED `MarkdownRenderer` wrapped in `EmbedDepthProvider(depth+1)` + ancestor chain; images render `<img src=/api/vault/asset>` directly (bypass endpoint). All UI states token-only: loading, resolved, image, not-found, section-not-found, cycle, depth-exceeded.
- [ ] **Step 5:** `preprocess.ts` — add `rewriteEmbeds` rewriting `![[...]]` → an `embed://` token **on its own line**, ordered BEFORE the wiki-link stage. `components.tsx` `a` override branches on `embed://` → `<Embed>`.
- [ ] **Step 6:** Verify — Vitest (`parseEmbed`, `checkGuard`, route 400/404×2/200×2/409); full gate + lint 0. Dev-server visual check (nested render, image, broken/cycle/depth chips).
- [ ] **Step 7:** Commit (`feat(markdown): embeds / transclusion with recursion guards`).

---

## Task 6: FEATURE — Block refs + heading-anchor validation

**Files:** Modify `src/app/api/resolve/route.ts` (add anchor validation), the renderer link path (`components.tsx`/`WikiLink`). No new module (proves the seams). Source: `.superpowers/sdd/p1-drafts/blockrefs.md`.

**Interfaces:** `/api/resolve` response gains `anchor: { kind, valid, value }` (via `validateAnchor` from Task 4). `resolveLink` stays path-only (unchanged).

- [ ] **Step 1:** `/api/resolve` — after `resolveLink`, read the target via cached `readVaultFile`, call `validateAnchor(content, rawAnchor)`, include `anchor` in the JSON.
- [ ] **Step 2:** Renderer — style an unresolved/invalid anchor distinctly (token-only); on a valid block-ref, scroll-to + highlight the block (the deferred `onNavigate` anchor spot from Phase 0a).
- [ ] **Step 3:** Verify — Vitest integration on `/api/resolve` (`note#^id`→valid, `note#Ghost`→invalid); full gate + lint 0. Dev-server visual check (broken vs valid anchor; scroll).
- [ ] **Step 4:** Commit (`feat(markdown): validate + navigate block/heading anchors`).

---

## Task 7: FEATURE — Chat streaming markdown (RISKY — flicker)

**Files:** Create `src/lib/markdown/streaming.ts` + `streaming.test.ts`, `src/components/chat/StreamingMarkdown.tsx` (+ `remarkCitationTokens`). Modify `QACard.tsx` (swap `StreamingText` → `StreamingMarkdown`). Source: `.superpowers/sdd/p1-drafts/chat-markdown.md`.

**Interfaces:** `sanitizeStreamingMarkdown(raw, active): string` + `closeOpenFences(raw): string` (pure); `StreamingMarkdown` renders streamed markdown with citation pills.

- [ ] **Step 1: TDD `closeOpenFences` + `sanitizeStreamingMarkdown`** — the draft's ~16 cases, INCLUDING the load-bearing ones: protect `[^N]` → sentinel FIRST (#10), verbatim when `active:false` (#15), monotonic-prefix (no earlier-rendered content disappears as more streams in) (#16). The 6 steps in ORDER: protect citations → close fences → drop dangling backtick → trim unmatched emphasis → defang half-link → strip lone `$`. RED→GREEN.
- [ ] **Step 2:** `StreamingMarkdown.tsx` — `remarkCitationTokens` walks text nodes emitting a citation node → `<CitationMarker>` (reuses `SourcesRow`/`CitationPill`); render via the shared markdown config (Task 1); throttle the parsed view to ~33ms (rAF), live cursor on the raw value, flush on `done`. `active:false` → render verbatim.
- [ ] **Step 3:** Wire `QACard.tsx` (swap at the `StreamingText` site); `SourcesRow`/`CitationPill` unchanged.
- [ ] **Step 4:** Verify — Vitest pure (closeOpenFences 6, sanitize ~16 incl. ordering/verbatim/monotonic); jsdom component test (`<strong>` renders; citation button `aria-label="Source 1"` fires `onCitationClick(1)`; cursor iff active); full gate + lint 0. Dev-server visual check (live stream, no flicker, pills).
- [ ] **Step 5:** Commit (`feat(chat): render streaming answers as markdown with citations`).

---

## Final verification (after all tasks)
- [ ] `npm run lint` exit 0; `npm run typecheck` exit 0; `npm run test:unit` all pass; `npm run build` succeeds.
- [ ] `MarkdownRenderer.tsx` is a thin coordinator; heavy logic in tested modules (`callout`, `anchors`, `embed`, `embed-guard`, `streaming`, `preprocess`, `components`).
- [ ] No new dependencies in package.json.
- [ ] Dev-server visual checks captured (callouts, embeds incl. nested+image+broken, block-ref nav, streaming chat) in light + dark — OR flagged as pending human eyeball.

## Spec coverage (this plan vs design spec §7)
| Spec §7 item | Task |
|---|---|
| typeset markdown | (done in Phase 0b) |
| callouts | 3 |
| embeds / transclusion (+ recursion guard) | 5 (+ 4 extractor) |
| block references + heading-anchor validation | 6 (+ 4) |
| chat answers render as markdown (streaming-safe) | 7 |
| decompose MarkdownRenderer | 0, 1, 2 (interleaved) |

## Self-review notes
- One shared `anchors.ts` (decision #1) prevents the triple-invented extractor; Tasks 5/6 both consume it.
- No new deps confirmed across all five drafts (no unist/mdast/rehype-raw/icon lib).
- Riskiest: Task 5 (embed recursion — two guards + server backstop, TDD'd) and Task 7 (streaming flicker — monotonic-prefix test is the guard).
- `#c0392b` raw-hex in the current MermaidBlock (uncaught by the CSS-blind eslint rule) is removed in Task 0.
