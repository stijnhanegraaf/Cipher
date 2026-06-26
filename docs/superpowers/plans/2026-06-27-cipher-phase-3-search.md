# Cipher Phase 3 — Search Unification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`). Each task: TDD pure logic, run the FULL gate (typecheck + test + build + lint COUNT 0) before committing, ONE commit, footer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

**Goal:** Make full-text search actually work and trustworthy — fix the headline "results render nothing" kind-vocabulary mismatch, unify scoring into one ReDoS-safe whole-vault module, search frontmatter + tags, fix excerpts + short terms + the recency-surfaces-non-matches bug, make the FileTree filter reach collapsed folders, and add an optional semantic-search toggle.

**Architecture:** One pure `search-core.ts` (scoring/tokenize/excerpt/recency, all pure + injected `now`) + one `search-kinds.ts` vocab module (single source of truth shared by the builder AND both views) + a thin `collectVaultFiles` IO wrapper over the whole-vault `walkFiles`. `buildSearchResults` is rewritten to delegate (keeping its `SearchResultsData` return shape byte-compatible so the `/api/query` intent path is unaffected). The dead `searchVault` (+ its ReDoS bug) is deleted. FileTree filter reuses the in-memory vault index. Semantic is an additive `/api/search` toggle reusing `retrieve()` (which already degrades to keyword-only).

**Tech Stack:** Next.js 16, React 19, TS-strict, Tailwind v4, Vitest. No new dependencies.

## Global Constraints
- TS strict; no new `any`. Token-only color (lint 0 by COUNT). Conventional Commits; ONE commit/task; the footer above. Full gate green before every commit.
- **`buildSearchResults` MUST keep its signature + `SearchResultsData` return shape** (it's reached via `detectIntent → buildView` in `/api/query`) — non-search intents must be unaffected. Do NOT touch the intent router.
- Pure functions take an injected `now` (no `Date.now()` in scorers) for deterministic tests.
- Branch: `refinement`.

## Resolved decisions (front-loaded)
1. **CORE and CORRECTNESS are ONE rewrite, not two.** `scoreFileAgainstTerms`/`buildExcerpt`/`tokenizeQuery`/`applyRecencyBoost` (CORE) ABSORB the correctness fixes (tag/frontmatter weights, 2-char floor, casing/heading-fallback excerpt, recency-only-on-match). Do NOT do a second edit pass on `buildSearchResults`. (Plan "Task 2" is folded into Task 1; its fixes map to specific Task-1 pure-fn behaviors + tests.)
2. **Kind vocabulary = ONE module** `src/lib/builders/search-kinds.ts` (`SEARCH_KIND_ORDER` incl. `other`, `SEARCH_KIND_LABEL`, `toSearchKind`) imported by the producer + BOTH views. (Reject a separate UI-taxonomy map.) Ship this vocab sub-step FIRST within Task 1 so rendering is unblocked even before the scoring rewrite completes.
3. **Delete dead `searchVault`** (+ re-export + unused `SearchResult` interface) in Task 1; KEEP `listVaultFiles` (live callers).
4. **Semantic is additive + LAST** via a NEW `/api/search` route (do NOT overload `/api/query`); exact stays default + embedding-independent; degrade to keyword-only transparently.
5. **`.md`-only** index for the FileTree filter (consistent with ⌘K) — intentional, note in PR.

## Draft source files (paste-ready content + test tables)
`.superpowers/sdd/p3-drafts/{core,correctness,semantic,filetree}.md`.

## Task order
`T1 core + kind-fix (+ correctness folded in) → T3 FileTree filter (independent) → T4 semantic toggle (additive, last)`.

---

## Task 1: Search core + kind-render-fix (the headline) + correctness
**Files:** Create `src/lib/builders/search-kinds.ts` + `.test.ts`, `src/lib/search/search-core.ts` + `.test.ts`; modify `src/lib/builders/search.ts` (rewrite body to delegate), `src/components/views/SearchResultsView.tsx`, `src/components/browse/SearchPage.tsx`; delete `searchVault` + `SearchResult` in `src/lib/vault-search.ts` + the re-export in `vault-reader.ts`. Source: `.superpowers/sdd/p3-drafts/core.md` + `correctness.md`.

**Interfaces (all pure unless noted):**
- `search-kinds.ts`: `SEARCH_KIND_ORDER: string[]` (incl. `"other"` last), `SEARCH_KIND_LABEL: Record<string,string>`, `toSearchKind(k: string): string`.
- `search-core.ts`: `tokenizeQuery(text, minLen=2): string[]`; `escapeRegExp(s): string`; `scoreFileAgainstTerms(file: ScorableFile, terms, weights?): ScoredFile` (recency-free; `matched`/`hits`); `applyRecencyBoost(scored, now, halfLifeDays=90, maxBoost=2): ScoredFile` (no-op when `!matched`); `buildExcerpt(content, headings, terms, radius?): string`; `toScorable(parsed): ScorableFile`; `collectVaultFiles(restrictTo?): Promise<ScorableFile[]>` (thin IO wrapper, whole-vault via `walkFiles`, `[]` when no vault, never throws).

- [ ] **Step 1 — kind vocab (unblocks the headline bug FIRST):** create `search-kinds.ts`; write `search-kinds.test.ts` (each of the 9 `kindFromPath` outputs passes through; `canonical_note`→`other`; `undefined`→`other`; **drift guard: `SEARCH_KIND_ORDER` ⊇ every `kindFromPath` output**). Wire BOTH `SearchResultsView.tsx` (lines ~11-18/24/34/103-114) and `SearchPage.tsx` (~50-64) to bucket via `toSearchKind` + order via `SEARCH_KIND_ORDER` (keep `other` last); DELETE the `.filter(byKind[kind]?.length)` loss in SearchPage. RED→GREEN.
- [ ] **Step 2 — pure core (TDD):** write `search-core.test.ts` first — `scoreFileAgainstTerms` (TF; heading>content via weights content1/heading5/tag4/frontmatter3; tag-only match; frontmatter-only match; zero hits → `{score:0,matched:false}`; case-insensitive; ReDoS inputs `a(` / `(a+)+` don't throw — escaped literals; empty terms; custom weights); `applyRecencyBoost` (no-boost-when-!matched; boost-when-matched; half-life decay; clamp ≥0; deterministic with injected `now`); `tokenizeQuery` (2-char kept, 1-char dropped, lowercased/split, empty); `buildExcerpt` (original casing preserved, heading-only fallback, both-side ellipsis, no leading `…` at index 0); `escapeRegExp`; `toScorable`. RED→implement→GREEN.
- [ ] **Step 3 — `collectVaultFiles`:** thin wrapper over `walkFiles` (whole-vault, `.md`) + cached `readVaultFile` + `extractTags` + flattened frontmatter text. Test (stub `walkFiles`/`readVaultFile`/`getVaultPath`): walks whole vault (a non-layout-folder file appears — fixes scope bug), no-vault→`[]`, `restrictTo` honored, skips unreadable.
- [ ] **Step 4 — rewrite `buildSearchResults` to delegate:** `parseTagQuery` (from Phase 2 T7) → `tokenizeQuery` → `collectVaultFiles(restrictTo)` → `map(applyRecencyBoost(scoreFileAgainstTerms(...), now))` → **filter on `matched`** (NOT `score>0`) → sort → top 12 → `buildExcerpt` → emit `kind: toSearchKind(kindFromPath(path))`. Delete the old probed/extras loop, inline scoring, inline excerpt. **Keep the `SearchResultsData` return shape identical.** Add a boundary test: a fresh non-matching file is ABSENT; a stale matching file is PRESENT (locks the recency fix).
- [ ] **Step 5 — delete dead code:** remove `searchVault` (vault-search.ts ~23-99) + its re-export (vault-reader.ts ~877) + unused `SearchResult` interface (~383-388). Keep `listVaultFiles`. Confirm no callers (`grep`).
- [ ] **Step 6 — verify:** full gate + lint 0 (count). Render regression: results tagged `note`/`work`/`project` now appear in both views. Dev-server check (on resume): `/browse/search?q=<known-term>` renders grouped results with a correct count; previously-dropped kinds visible.
- [ ] **Step 7 — commit** (`feat(search): unified ReDoS-safe whole-vault scoring + fix kind-render mismatch`).

## Task 3: FileTree filter reaches collapsed folders
**Files:** Create `src/lib/browse/filter-paths.ts` + `.test.ts`; modify `src/components/browse/FileTree.tsx` (swap the filter branch ~85-89; delete `filterTree` ~191-201; keep lazy `<Tree>` when filter empty). Reuse `useVaultIndex`/`/api/vault/index`. Source: `.superpowers/sdd/p3-drafts/filetree.md`.

**Interfaces:** `filterPaths(files: {path}[], needle: string): {path}[]` (pure; trim/lowercase; empty→`[]`; match basename OR path; rank basename-hit > path-only > shorter > lexicographic; no mutation).

- [ ] **Step 1 (TDD):** `filter-paths.test.ts` — empty/whitespace→`[]`; **basename match finds a COLLAPSED/never-loaded file (the core regression)**; case-insensitive; basename ranked above path-only; path-segment match; no-match→`[]`; deterministic tie-break (assert exact array); input not mutated; sub-3-char needle matches (NOT the search `length>2` rule). RED→implement→GREEN.
- [ ] **Step 2:** In `FileTree`, when `debouncedFilter.trim()` is non-empty render a flat list of `filterPaths(index.files, debouncedFilter)` rows (reuse the file Row, `onSelectFile`, ⌘Enter→`onOpenFull`); else render the existing lazy tree unchanged.
- [ ] **Step 3 — verify:** full gate + lint 0. Dev-server check (on resume): type a deep never-expanded file's basename → it appears; clear filter → lazy tree restored. Commit (`fix(browse): file-tree filter matches collapsed/unloaded files`).

## Task 4: Semantic search toggle (additive, last)
**Files:** Create `src/app/api/search/route.ts` + `.test.ts`, `src/lib/builders/semantic-search.ts` + `.test.ts`; modify `src/components/browse/SearchPage.tsx` (mode state + segmented control + `fetchSearch(q, mode)` + keyword-only notice). Reuse `retrieve()`, `resolveEmbedder`, `embedLabel`. Source: `.superpowers/sdd/p3-drafts/semantic.md`.

**Interfaces:** `chunksToSearchResults(query, chunks): SearchResultsData` (pure: `label` via `nameFromPath`, `path` passthrough, `excerpt` from chunk text + heading prefix, `kind` via `toSearchKind(kindFromPath(path))`, dedup by path keeping highest score); `GET /api/search?q=&mode=exact|semantic`.

- [ ] **Step 1 (TDD):** `semantic-search.test.ts` — `chunksToSearchResults` field mapping; dedup-by-path keeps highest; empty→`{query,results:[]}`. RED→GREEN.
- [ ] **Step 2 — route:** `mode:"exact"` → `buildSearchResults` (unchanged path); `mode:"semantic"` → `retrieve()` → `chunksToSearchResults`, `source = resolveEmbedder()?.id ?? "keyword-only"`; blank query → 400 (mirror `/api/query`); **transparent degrade:** semantic with no embedder / zero chunks → run `buildSearchResults`, tag `source:"keyword-only"`. Route test (mock `retrieve`/`resolveEmbedder`/`buildSearchResults`): exact calls only the builder; semantic calls `retrieve`+maps; `resolveEmbedder→null` → keyword-only + non-empty fallback; blank→400.
- [ ] **Step 3 — SearchPage:** `useState<"exact"|"semantic">("exact")`, a token-only segmented control, add `mode` to the fetch effect deps, POST `/api/search`, show an `embedLabel("keyword-only")` notice when degraded. `?q=` with no mode = exact (existing links unaffected).
- [ ] **Step 4 — verify:** full gate + lint 0. Dev-server check (on resume): toggle Semantic with embedder running (re-ranked + backend badge); stop embedder, toggle Semantic (keyword-fallback notice, results still render); Exact identical throughout. Commit (`feat(search): optional semantic search toggle (degrades to keyword)`).

---

## Final verification
- [ ] lint 0 / typecheck 0 / all tests pass / build green.
- [ ] Search RENDERS grouped results (headline bug fixed); whole-vault scope; frontmatter+tags searched; correct-cased excerpts; short terms work; recency never surfaces non-matches; dead `searchVault` gone.
- [ ] FileTree filter finds collapsed files; semantic toggle works + degrades.
- [ ] `buildSearchResults` return shape unchanged (intent path unaffected) — boundary test green.

## Spec coverage (vs design spec §9)
| Spec §9 item | Task |
|---|---|
| One unified engine (collectVaultFiles + scorer), delete dead searchVault | 1 |
| Kind-vocabulary render fix (results show) | 1 (vocab sub-step first) |
| recency-only-on-match; short terms; frontmatter+tags; excerpt | 1 (folded correctness) |
| FileTree filter (collapsed folders) | 3 |
| Expose semantic in general search | 4 |

## Self-review notes
- One core + one vocab module (decision #1/#2) prevents the two-rewrites-of-buildSearchResults conflict the drafts had.
- `buildSearchResults` shape frozen → `/api/query` intent path safe (boundary test).
- Semantic strictly additive + degrades → no hard embeddings dependency.
- Carried Phase-2 minors (BacklinksPanel empty-state, snippet `. ` heuristic, etc.) remain Phase-5.
