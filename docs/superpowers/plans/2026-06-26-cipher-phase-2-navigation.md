# Cipher Phase 2 — Navigation Features — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax. Each task: TDD pure logic, run the FULL gate (typecheck + test + build + lint COUNT 0) before committing, ONE commit, footer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

**Goal:** Close the navigation parity gaps — a snippet-bearing backlinks panel (the #1 gap), an outgoing-links panel, navigable tags (clickable chips + tag page + search scope), and tag-graph coloring/filtering — while decomposing `DetailPage.tsx` (~1068 lines) into focused, tested modules as the features land.

**Architecture:** Backlinks need a server endpoint (snippets require reading source-note content); outgoing/tags/tag-index likewise need fs. One pure `tags.ts` extraction module is consumed by tag chips, the tag page, search scope, AND tag-graph. Backlinks + outgoing share ONE `LinkRowList` chrome but different data sources. `DetailPage` is decomposed sub-step-by-sub-step (hooks, states, TOC, properties) so each commit leaves it smaller and green. All new color is token-only (the `cipher-design/no-raw-color` rule enforces it; lint is 0 and must stay 0).

**Tech Stack:** Next.js 16, React 19, TS-strict, Tailwind v4, Vitest. No new dependencies.

## Global Constraints
- **TS strict; no new `any`.** **Token-only color** (raw hex only in globals.css `:root`/`.light`; new colors = new `--token`s; reuse `--hue-*`/chip system). **Watch `var(--token, KEYWORD)` fallbacks** — only reference tokens that actually exist (a Phase-1 bug: `var(--hue-yellow, orange)` painted raw orange because the token didn't exist; the lint rule can't see fallbacks).
- **Lint stays 0** (check the COUNT, not just exit code). **Conventional Commits**, ONE commit/task, the footer above.
- **Don't rename frozen exports** (`ui/index.ts` surface, `useSheet`, `PageShell`). **Server-only modules stay `import "server-only"`.**
- **GraphCanvas/DetailPage edits are surgical** — confine to named seams (see T3/T8 risk notes); do NOT touch the graph simulation/camera/pointer code or DetailPage's motion-sheet machinery beyond the cited seams.
- **Branch:** `refinement`.

## Resolved decisions (front-loaded)
1. **ONE tag module** `src/lib/markdown/tags.ts`: `extractTags(content, frontmatter): string[]` (content-first arg order), `normalizeTag(raw): string`, `primaryTag(tags): string`. Tag-graph + tag-page + chips + search ALL consume it; no second extractor.
2. **Backlinks (snippets, server) ≠ Outgoing (extractLinks+resolveLink, surfaces broken)** — different data, SHARED `LinkRowList` chrome (promoted from `FilePreviewPanel.LinkSection`). Snippet-bearing backlinks win over the title-only client reducer (drop `deriveLinkRows`/`useFileBacklinks`).
3. **`WIKILINK_RE` factored into `wikilink.ts`**, shared by `vault-reader.extractLinks` + `extractMentionSnippets`.
4. **New server endpoints:** `/api/vault/backlinks` (T2), `/api/file/links` (T4), `/api/vault/tags` (T6). **Pure Vitest-covered modules:** tags, backlinks, outgoing, frontmatter-badges, tag-query, tag-color, primaryTag.
5. **Cut from scope:** `useFileEditor` (edit/save — defer); tag-graph multi-tag filter (ship primary-tag filter); tag-graph's own extractTags (use T1).

## Draft source files (paste-ready content + test tables)
`.superpowers/sdd/p2-drafts/{backlinks,outgoing,tags,tag-graph,decomposition}.md` — each task points to its section.

## Task order
`T0 decomp-types → T1 tags module → T2 backlinks core+endpoint → T3 DetailPage spine + backlinks mount → T4 outgoing → T5 properties/tags row + TagChip → T6 tag page → T7 tags-as-search-scope → T8 tag-graph (riskiest, last)`.

---

## Task 0: Decomposition prep — shared types + theme
**Files:** Create `src/lib/types/file-envelope.ts`, `src/components/detail/detail-theme.ts`; modify `DetailPage.tsx`, `FileFullPage.tsx`, `FilePreviewPanel.tsx`. Source: `decomposition.md` (A+B).
**Interfaces:** Produces a shared `FileEnvelope`/`FileData` type (matching `/api/file`'s envelope) + the extracted `theme` token-indirection object.
- [ ] Extract the triplicated file-envelope type to `file-envelope.ts`; repoint the 3 consumers' imports.
- [ ] Extract DetailPage's inline `theme` object to `detail-theme.ts`; repoint.
- [ ] Verify: build + typecheck green; lint 0 (pure move, no behavior change). Commit (`refactor(detail): extract shared file-envelope type + theme`).

## Task 1: Tag module `tags.ts` (PURE)
**Files:** Create `src/lib/markdown/tags.ts` + `tags.test.ts`; modify `FilePreviewPanel.tsx` (delete private `deriveTags`, import). Source: `tags.md` + `tag-graph.md` §extraction.
**Interfaces:** `extractTags(content: string, frontmatter: Record<string, unknown>): string[]`, `normalizeTag(raw: string): string`, `primaryTag(tags: string[]): string`.
- [ ] **TDD:** write `tags.test.ts` first — the ~13 cases from the draft: `normalizeTag` (strip `#`, lowercase, ws→`-`, keep nested `/`); `extractTags` (frontmatter `tags[]`/scalar/`tag:` alias + inline `#tag`, **fence-masked** via `buildFenceMask` promoted from `anchors.ts`, leading-letter rule `/(?:^|\s)#([\p{L}][\p{L}\p{N}_/-]*)/gu` so `#hex` colors and all-numeric are rejected, fm-first dedupe); `primaryTag` (`tags[0] ?? ""`). RED.
- [ ] Implement `tags.ts`. GREEN. Delete `FilePreviewPanel.deriveTags`, import the shared one (keep its display identical).
- [ ] Verify full gate + lint 0. Commit (`feat(markdown): centralized tag extraction module`).

## Task 2: Backlinks core — `extractMentionSnippets` + `/api/vault/backlinks`
**Files:** Modify `wikilink.ts` (add `WIKILINK_RE`), `vault-reader.ts` (`extractLinks` uses it); create `src/lib/markdown/backlinks.ts` + `.test.ts`, add `getBacklinks` to `vault-graph.ts`, create `src/app/api/vault/backlinks/route.ts` + `route.test.ts`. Source: `backlinks.md` §2–4.
**Interfaces:** `extractMentionSnippets(content, targetName, radius?): MentionSnippet[]`, `extractMentionSnippet(...): string`; `getBacklinks(targetPath): Promise<Backlink[]>` (`{sourcePath, sourceTitle, snippet}`); `GET /api/vault/backlinks?path=` → `{backlinks}` / 409 / 500.
- [ ] Factor `WIKILINK_RE` into `wikilink.ts`; repoint `extractLinks` (keep its test green).
- [ ] **TDD** `backlinks.test.ts` — the 10 cases from the draft (alias, anchor-ignored, nested-path last-segment, escaped-pipe table parity, ±90 window clamped to sentence/line + ellipsis, two-mentions, case/ws normalize mirroring `resolveLink:836`, empty→[]/no-throw). RED→GREEN.
- [ ] `getBacklinks` in vault-graph.ts (cached edges where `target===path` → `readVaultFile(source)` → snippet → title + mtime-sort). Route mirrors `graph/route.ts` (resolve `path` via `resolveLink` first; 200/409/500). Route test: 409-no-vault + `{backlinks}` shape.
- [ ] Verify full gate + lint 0. Commit (`feat(vault): backlinks with context snippets + endpoint`).

## Task 3: DetailPage spine + Backlinks mount (decomposition rides in)
**Files:** Create `src/components/detail/useFileContent.ts`, `useAnchorScroll.ts`, `DetailStates.tsx`, `TableOfContents.tsx`, `useActiveHeading.ts`, `src/components/browse/BacklinksPanel.tsx`, `src/components/browse/LinkRowList.tsx`; modify `DetailPage.tsx`, `FileFullPage.tsx`, `FilePreviewPanel.tsx` (use `LinkRowList`), `README.md`. Source: `decomposition.md` T1–T4 + `backlinks.md` §5–6.
- [ ] **T3a:** extract `useFileContent` (fetch+loading+error) + `useAnchorScroll` (the entangled anchor-scroll view effect, DetailPage ~259-324 — SPLIT fetch from scroll or the sheet's scroll-on-load breaks); converge FileFullPage onto `useFileContent`. Verify build+typecheck; lint 0.
- [ ] **T3b:** move skeleton + error/404 + keyframes → `DetailStates.tsx`. Verify build; (visual: error+retry).
- [ ] **T3c:** move TOC → `TableOfContents.tsx` + `useActiveHeading` (IntersectionObserver + scrollToHeading + reset-scroll). Verify build.
- [ ] **T3d (FEATURE):** promote `FilePreviewPanel.LinkSection` → `LinkRowList.tsx` (`variant: "resolved"|"broken"`); build `BacklinksPanel.tsx` (token-only, self-fetches `/api/vault/backlinks`, header `LINKED MENTIONS · N`, 2-line clamped snippet rows, cancel-on-unmount + per-path cache). Mount in DetailPage body (`!editMode`, guarded on `data`) and FileFullPage (`variant="block"`). Fix the README backlinks claim. Verify full gate + lint 0; (visual: mentions render, click re-points sheet, empty/loading/error degrade silently).
- [ ] Commit (`feat(detail): backlinks panel + decompose DetailPage spine`). (One commit for the whole T3, or split T3a-d into commits if cleaner — keep each green.)

## Task 4: Outgoing-links panel
**Files:** Create `src/lib/links/outgoing.ts` + `.test.ts`, `src/app/api/file/links/route.ts` + test, `src/components/browse/OutgoingLinksPanel.tsx`; modify `LinkRowList.tsx` (broken-row variant), the two readers (mount). Source: `outgoing.md`.
**Interfaces:** `computeOutgoingLinks(links, resolve): OutgoingLink[]` (resolver injected → pure; `{target, resolvedPath|null, broken}`, deduped, first-appearance order), `dropSelfLinks(links, selfPath)`; `GET /api/file/links?path=` → `{links}`.
- [ ] **TDD** `outgoing.test.ts` — `computeOutgoingLinks` (resolved/broken/dedupe/case-insensitive-broken/order) + `dropSelfLinks` (anchor-insensitive). RED→GREEN.
- [ ] Route mirrors `api/file/route.ts` (`extractLinks` → `computeOutgoingLinks(resolveLink)` → `dropSelfLinks`). `OutgoingLinksPanel` (resolved = buttons, broken = non-interactive `--text-quaternary` rows + broken chip, token-only). Mount beside BacklinksPanel in both readers.
- [ ] Verify full gate + lint 0. Commit (`feat(detail): outgoing links panel (resolved + broken)`).

## Task 5: Properties/tags row + clickable TagChip
**Files:** Create `src/components/detail/PropertiesPanel.tsx`, `src/lib/markdown/frontmatter-badges.ts` + `.test.ts`, `src/components/ui/TagChip.tsx`; modify `DetailPage.tsx` (badge JSX → PropertiesPanel + tags row), `FilePreviewPanel.tsx` (use shared `TagChip`), `ui/index.ts`. Source: `tags.md` §chips + `decomposition.md` T5.
- [ ] **TDD** `frontmatter-badges.test.ts` — `getBadgeVariant` + `selectFrontmatterBadges` (which frontmatter keys → badges, variant mapping). RED→GREEN.
- [ ] Move DetailPage badge JSX (~877-933) into `PropertiesPanel.tsx`. Build `TagChip.tsx` = `<Link className="chip" style={{"--sc": "var(--hue-tag)"}}>` (token-only, real nav to `/browse/tag/[tag]` + middle-click). Add a tags row (gated on `extractTags().length>0`) in the reader; use shared `TagChip` in FilePreviewPanel too.
- [ ] Verify full gate + lint 0 (no-raw-color). Commit (`feat(detail): properties panel + clickable tag chips`).

## Task 6: Tag page + tag index
**Files:** Create `src/lib/vault-tags.ts`, `src/app/api/vault/tags/route.ts` + test, `src/app/browse/tag/[tag]/page.tsx`, `src/components/browse/TagPage.tsx`; modify `vault-reader.setVaultPath` + `cache/write-invalidation.ts` (`invalidateTagCache`). Source: `tags.md` §page.
**Interfaces:** `collectTags(): Promise<Map<tag, TagEntry[]>>`, `notesForTag(tag): Promise<TagEntry[]>`, `invalidateTagCache()`; `GET /api/vault/tags?tag=` (one tag) / bare (index) → `{tags}`/`{notes}`.
- [ ] `vault-tags.ts` — per-vault cache mirroring `vault-graph.ts` (walk via shared `walkFiles` → `readVaultFile` → `extractTags` → `Map`; 60s TTL or invalidate on write/setVaultPath). Wire `invalidateTagCache` into write-invalidation + setVaultPath.
- [ ] Route (`?tag=` → notes, bare → index, 409 no-vault). Page = Suspense wrapper (copy `topic/[name]` pattern); `TagPage` on `PageShell` + `useSheet`, rows → `sheet.open`/`/file/[...path]`.
- [ ] Verify build+typecheck + route smoke (no-vault shape); lint 0. (visual: chip → tag page → open note). Commit (`feat(vault): tag page + tag index endpoint`).

## Task 7: Tags as search scope
**Files:** Create `src/lib/builders/tag-query.ts` + `.test.ts`; modify `src/lib/builders/search.ts`. Source: `tags.md` §search.
**Interfaces:** `parseTagQuery(query): { tags: string[]; rest: string }`.
- [ ] **TDD** `tag-query.test.ts` — `parseTagQuery` (single `#tag`, tag+text, multi-tag, none, **`#ai` <3-char regression** — must NOT be eaten by the `length>2` filter). RED→GREEN.
- [ ] In `buildSearchResults`: call `parseTagQuery` BEFORE the term-length filter; intersect `notesForTag(t)` for each tag, then score `rest` over that set (empty `rest` → recency order). No SearchPage change.
- [ ] Verify full gate + lint 0. Commit (`feat(search): #tag scope in full-text search`).

## Task 8: Tag-graph coloring + legend/filter (RISKIEST — last)
**Files:** Create `src/lib/color/tag-color.ts` + `.test.ts`, `src/components/browse/GraphLegend.tsx`; modify `vault-graph.ts` (add `tags`/`tag` to `GraphNode`, set in buildGraph — zero extra I/O), `GraphCanvas.tsx` (3 surgical surfaces only), `MapPage.tsx`. Source: `tag-graph.md`.
**Interfaces:** `tagColor(tag): string` (returns a `--hue-*` token NAME; semantic overrides + FNV-hash fallback ring; pure, DOM-free).
- [ ] **TDD** `tag-color.test.ts` — semantic overrides, determinism, fallback-in-palette, `""→--hue-tag`, distribution. RED→GREEN.
- [ ] `vault-graph.ts`: add `tags`/`tag` (primaryTag) to `GraphNode`, populate in buildGraph's existing pass (no new file reads).
- [ ] **GraphCanvas — edit ONLY 3 surfaces** (do NOT touch sim/camera/pointer): (a) `activeIds` memo — add `visibleTags?: Set<string>` clause; (b) node-fill `fillStyle` (~731-746) — replace with a `nodeColor(n)` helper that resolves the tag's token→literal via a per-frame `Map` (≤7 `getComputedStyle` calls, reuse the existing one ~585), keeping degree→radius/glow and hover/selected `colAccent` orthogonal; (c) delete the dead `slot`/`folderSlot` code (~43-58, 199) in the same commit. `GraphLegend` = `.chip` rows (`--sc: var(--hue-*)`) toggling `visibleTags`; `MapPage` owns the state + derives the tag list.
- [ ] Verify build+typecheck + Vitest (`tagColor`); lint 0. **Named dev-server visual check** (canvas coloring is getComputedStyle-bound, not unit-testable — confirm nodes color by tag + theme-switch recolors + legend filters). Commit (`feat(graph): color + filter nodes by tag`).

---

## Final verification
- [ ] lint 0 / typecheck 0 / all tests pass / build green.
- [ ] `DetailPage.tsx` is a ~250-line coordinator; heavy parts in tested modules. No new deps.
- [ ] Backlinks (with snippets) render in both readers; README backlinks claim now true. Tags clickable → tag page; `#tag` search works; graph colors/filters by tag.
- [ ] Dev-server visual checks (backlinks, tag chips/page, broken outgoing links, tag-graph) in light+dark — or flagged pending eyeball.

## Spec coverage (vs design spec §8 + carried)
| Spec §8 item | Task |
|---|---|
| Backlinks panel (linked mentions + snippet) | 2, 3 |
| Outgoing-links panel | 4 |
| Navigable tags (clickable + tag page + search scope) | 1, 5, 6, 7 |
| Tag-graph coloring/filtering | 8 |
| Decompose DetailPage | 0, 3, 5 (interleaved) |
| (carried) timeline.ts duplicate slugifyHeading → anchors.ts | fold into T1/T2 cleanup |

## Self-review notes
- One `tags.ts` (decision #1) prevents a second extractor; T1/T5/T6/T7/T8 all consume it.
- T8 (GraphCanvas) and T3 (DetailPage) are the risk; both confined to named seams, each sub-step ships green.
- No new deps (confirmed across drafts).
- The Phase-1 `var(--token, KEYWORD)` bug class: every new color token must EXIST — verify before use.
