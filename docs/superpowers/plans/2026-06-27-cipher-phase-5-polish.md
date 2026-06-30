# Cipher Phase 5 — Polish Sweep — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`). Each task: run the FULL gate (typecheck + test + build + lint COUNT 0) before committing, ONE commit, footer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Leave NO stray uncommitted edits.

**Goal:** Close out the accumulated polish/deferral list from Phases 0a–4 plus the design-spec §11 sweep — complete every empty/loading/error state, a real accessibility pass, token/CSS hygiene (incl. stylelint to catch what the JS rule can't), and a correctness+code-cleanup sweep. No new features; no behavior regressions.

**Architecture:** Four themed sweep tasks ordered by user value: (1) UI states, (2) accessibility, (3) token/CSS hygiene + stylelint, (4) correctness + code cleanup. Each is mostly mechanical against a known list; pure-logic fixes keep/extend their Vitest coverage.

**Tech Stack:** Next.js 16, React 19, TS-strict, Tailwind v4, Vitest. May add `stylelint` (devDep) in T3.

## Global Constraints
- TS strict; no new `any`. Token-only color (lint 0 by COUNT). Conventional Commits; ONE commit/task; the footer above. Full gate green before each commit. No behavior regressions — these are polish fixes, not rewrites.
- Branch: `refinement`.

## Known-item inventory (from the progress ledger / cohesion reviews)
`.superpowers/sdd/phase5-deferred-raw.txt` (raw). Consolidated below per task.

## Note on visual verification
Human visual eyeball (callouts/embeds/typeset/chat/backlinks/tags/tag-graph/canvas/audit in light+dark) has been PENDING across all phases because no browser automation is available in this environment. It is a **verification gap, not a code defect** — every visual surface is token-driven and unit/CSS-reasoning-verified. This is flagged for the human to do a dev-server pass (`VAULT_PATH=$(pwd)/public/sample-vault npm run dev`) before public release. It is NOT a Phase-5 code task.

---

## Task 1: UI states sweep (highest user value)
**Goal:** Every surface has proper empty / loading / error / not-found states; no blank screens, no silent failures, no `alert()`.
**Files:** `src/components/browse/{TopicPage,EntityPage,SearchPage,MapPage,FileTree,ImagePreview,PdfPreview,GenericPreview}.tsx`, `src/components/chat/ChatEmptyState.tsx` (offline banner), `src/components/browse/BacklinksPanel.tsx`, `src/components/ui/markdown/` (async wiki-link loading), `src/components/browse/TodayPage.tsx` (any residual `alert`). Source: design-spec §11 + ledger.

- [ ] **Step 1 — audit current states:** grep each listed component for its `loading`/`error`/`!data` branches; list which lack an empty/not-found or error state (TopicPage/EntityPage had none; SearchPage/MapPage/FileTree empty-on-null; Image/Pdf previews no error fallback; chat no offline banner).
- [ ] **Step 2 — add the missing states** (token-only, reuse the existing shimmer/skeleton + a shared EmptyState pattern): TopicPage/EntityPage not-found; SearchPage/MapPage/FileTree empty + error; Image/Pdf preview broken-asset fallback; ChatEmptyState offline/unconfigured-LLM banner (it already accepts a `banner` prop — wire it); BacklinksPanel "No linked mentions yet" line + a row cap with "+N more"; async wiki-link click shows a brief loading affordance during `/api/resolve`.
- [ ] **Step 3 — standardize loading:** replace plain "Loading…"/"Searching…" text with the shimmer/skeleton used elsewhere, where cheap. Replace any remaining `alert()` (e.g. TodayPage) with the toast pattern.
- [ ] **Step 4 — verify:** full gate + lint 0. Where a pure helper is added, unit-test it. Commit (`feat(ux): complete empty/loading/error states across surfaces`).

## Task 2: Accessibility pass
**Goal:** keyboard, ARIA, and reduced-motion consistency.
**Files:** `src/components/ui/CodeBlock.tsx` (aria-live), `src/components/chat/StreamingMarkdown.tsx` (cursor reduced-motion), `src/components/AppShell.tsx` (+ a `Window` augmentation for `__setThemeColor`), `src/components/browse/GraphLegend.tsx` (drop redundant `role="button"`), `src/components/Sidebar.tsx` (pin drag — keyboard reorder + grip affordance), assorted custom controls (aria-pressed/labels). Source: ledger a11y items.

- [ ] **Step 1:** CodeBlock copy button gets an `aria-live="polite"` status region (announces "Copied"). StreamingMarkdown cursor honors `prefers-reduced-motion` explicitly (or confirm the global rule covers it + document).
- [ ] **Step 2:** Add a `declare global { interface Window { __setThemeColor?: (t: string) => void } }` so the AppShell cast is unnecessary; remove the inline cast. Drop the redundant `role="button"` on the GraphLegend `<button>`.
- [ ] **Step 3:** Pinned items (Sidebar `Reorder`) get a visible grip + keyboard reorder (arrow keys) + aria. Sweep custom interactive controls for missing `aria-pressed`/`aria-label`.
- [ ] **Step 4 — verify:** full gate + lint 0. Commit (`feat(a11y): aria-live, reduced-motion, keyboard reorder, typed window`).

## Task 3: Token/CSS hygiene + stylelint
**Goal:** close the CSS-side token gap the JS `no-raw-color` rule structurally can't see, and tokenize remaining magic values.
**Files:** add `stylelint` + config; `src/app/globals.css` (component-rule raw hex in `.btn-*`/`.glass`/`.pill`; `--hue-idea` `.light` override; magic-ms durations `.anchor-highlight`/`.cipher-cursor-blink` → tokens); `src/components/VaultConnectDialog.tsx` + `src/components/chat/Composer.tsx` (remaining `var(--text-on-brand, #fff)` fallbacks); `package.json` (lint script runs stylelint too). Source: ledger token items.

- [ ] **Step 1 — stylelint:** add `stylelint` + a minimal config with a rule banning raw hex/rgb/hsl in `globals.css` OUTSIDE the `:root`/`.light` token blocks (e.g. `color-no-hex` scoped, or a custom selector-scoped rule); wire into `npm run lint` (or a `lint:css` script the gate runs). It must initially report the known violations.
- [ ] **Step 2 — fix the violations:** convert `.btn-*`/`.glass`/`.pill` raw hex/rgba in component rules to tokens (add tokens to `:root`/`.light` as needed); drop the remaining `var(--text-on-brand, #fff)` fallbacks (token exists); add a `.light` override for `--hue-idea` if it reads poorly in light (else document why shared); tokenize the magic-ms durations.
- [ ] **Step 3 — verify:** `lint` (JS) 0 AND `stylelint` 0; full gate green. Commit (`chore(css): stylelint token enforcement + fix component-rule raw colors`).

## Task 4: Correctness + code-cleanup sweep
**Goal:** the real correctness fixes + the mechanical dedups/cleanups; no behavior change except the stated fixes.
**Files:** `src/components/ui/markdown/components.tsx` (react-markdown v10 task-list CheckboxIndicator), `src/lib/markdown/frontmatter.ts` (+test: closing-fence right-anchor + CRLF/`---x`), `src/lib/markdown/backlinks.ts` (snippet `. ` heuristic; route 500 `backlinks:[]` in `route.ts`), `src/lib/builders/timeline.ts` (dedup `slugifyHeading` → `anchors.ts`), `src/lib/vault-search.ts` (redundant assignment + dead `combined`), `src/lib/search/search-core.ts` (double-lowercase frontmatterText; `halfLifeDays` rename/doc; parallelize `collectVaultFiles` reads), `src/lib/canvas/parse-canvas.ts` (freeze/return-fresh `EMPTY`), `src/components/ui/markdown/Embed.tsx` (drop redundant double `EmbedDepthProvider`), test-hygiene (daily route test self-contained; vault-reader.test tmpdir `afterEach`). Source: ledger correctness+cleanup items.

- [ ] **Step 1 — correctness (test-first where logic):** fix the react-markdown v10 GFM task-list handling so `CheckboxIndicator` renders (it now keys off `className="task-list-item"` not the `checked` prop) — add a component test; frontmatter closing-fence right-anchor (`---trailing` no longer leaks) + CRLF/`---x` tests; backlinks snippet `. ` boundary guard (don't split on abbreviations/decimals) + the route 500 returns `{backlinks:[]}`.
- [ ] **Step 2 — mechanical cleanups:** dedup timeline `slugifyHeading` onto `anchors.ts`; remove `vault-search` redundant assignment + dead `combined`; fix double-lowercase + rename `halfLifeDays`→`linearDecayDays` (+doc) in search-core; `Promise.all` (bounded) the `collectVaultFiles` reads; freeze `parse-canvas` `EMPTY` (or return a fresh literal); drop the redundant outer `EmbedDepthProvider` wrap.
- [ ] **Step 3 — test hygiene:** make the daily-route never-clobber test self-contained (write its own sentinel, no cross-`it` dependency); add `afterEach` tmpdir cleanup to the vault-reader auditsDir suite.
- [ ] **Step 4 — dead-end verification:** confirm no dead ends remain (the `/browse/audit` nav link, `/files` slash command, wiki-link resolve, Timeline range filter, `/api/browse/hints`) — a grep/smoke pass.
- [ ] **Step 5 — verify:** full gate + lint 0; all new/changed tests pass. Commit (`fix+chore: correctness fixes + code-cleanup sweep`).

---

## Final verification (whole effort)
- [ ] lint 0 (JS + stylelint) / typecheck 0 / all tests pass / build green.
- [ ] No dead ends; every surface has complete states; a11y pass done; token-only enforced on both JS and CSS sides.
- [ ] No new deps beyond stylelint (dev). No stray uncommitted edits.
- [ ] (Human) dev-server visual pass across all features in light + dark — the one remaining verification gap.

## Spec coverage (vs design spec §11)
| Spec §11 item | Task |
|---|---|
| Complete empty/loading/error/not-found states | 1 |
| Replace alert() with toast | 1 |
| Motion grammar consistency / hover via CSS | 2 (+ carried where relevant) |
| Stray emoji glyphs → SVG | 1/2 (fold where touched) |
| Standardize loading (shimmer/skeleton) | 1 |
| Accessibility pass | 2 |
| Verify no dead ends | 4 |
| (carried) token/CSS hygiene + all code/correctness deferrals | 3, 4 |

## Self-review notes
- These are KNOWN deferred items (tracked since Phase 0a), not new design — hence a direct plan, not an exploration workflow.
- Visual eyeball is a human verification gap (no browser automation), explicitly NOT a code task.
- Tasks are independent; order is by user value (states → a11y → CSS → cleanup). Each ends green.
- If any "fix" turns out to risk a regression in untested UI, prefer a documented justified-skip over a risky rewrite (consistent with how the lint backlog was handled in Phase 0b).
