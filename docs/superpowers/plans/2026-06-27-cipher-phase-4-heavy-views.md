# Cipher Phase 4 — Heavy Views + The One Write — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`). Each task: TDD pure logic, run the FULL gate (typecheck + test + build + lint COUNT 0) before committing, ONE commit, footer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Leave NO stray uncommitted edits.

**Goal:** The three heaviest remaining features — daily-note creation (the one write), a generalized audit dashboard, and Canvas (.canvas) rendering.

**Architecture:** All three are independent (separate routes/components/parsers). Each has a PURE core (Vitest, node env) + a thin server route (fs reads stay server-side) + a client view. Daily-note is the ONLY writer (create-or-open, never clobber, atomic exclusive write). Audit is reworked onto the layout probe + data spine + token-only UI (removing its raw-Tailwind-color eslint allowlist). Canvas renders as DOM-positioned nodes inside a CSS-transform pan/zoom container (NOT a hand-rolled `<canvas>` — reuses MarkdownRenderer for text nodes, token color works via `var()` with no allowlist).

**Tech Stack:** Next.js 16, React 19, TS-strict, Tailwind v4, Vitest. No new deps.

## Global Constraints
- TS strict; no new `any`. **Token-only color** (no raw hex / Tailwind palette outside globals.css; only reference tokens that EXIST — no `var(--x, KEYWORD)` fallbacks). Lint stays 0 (COUNT). Conventional Commits; ONE commit/task; the footer above. Full gate green before each commit.
- Daily-note is the ONLY write feature; **never overwrite an existing note** (create-or-open). Atomic exclusive write (`wx`/`link`), call `invalidateAfterWrite`.
- Server fs reads in `/api/*` + `src/lib`. Reuse `getVaultLayout`, `safeJoin`, `readVaultFile`, `parseFrontmatter`, `parseTable`, `MarkdownRenderer`, the GraphCanvas pan/zoom MATH (not its canvas draws).
- Branch: `refinement`.

## Resolved decisions (front-loaded)
1. **Order:** daily-note → audit → canvas (front-load the write-safety risk; end on the biggest build). Independent, so order is flexible.
2. **Canvas = DOM-positioned nodes** in a pan/zoom CSS-transform container + one SVG edge layer. NOT `<canvas>`. No `no-raw-color` allowlist entry needed.
3. **Daily-note never overwrites:** two layers — `readVaultFile` pre-check → 200-open; AND a TOCTOU-safe exclusive create (`writeFile(...,{flag:"wx"})` or `link`), `EEXIST` → 200-open. NO `rename`-over-existing.
4. **Audit degrades gracefully:** most vaults have NO audits folder → a calm "No audits in this vault" empty state (NOT a broken "Unknown/0" card). Branch on `{available}` before touching status. Remove the raw-Tailwind `statusColors` map + the eslint allowlist.
5. **MVP time-boxes:** Canvas = text/file/image/group nodes + straight edges w/ arrowheads + pan/zoom/fit/keyboard (defer dragging/bezier/labels/minimap). Daily-note = tier-3 `defaultTemplate` only (defer `.obsidian/daily-notes.json` + templates-folder tiers). Audit = tiers 1+2+derive (defer content-heuristic tier).

## Draft source files (paste-ready content + test tables)
`.superpowers/sdd/p4-drafts/{daily-note,audit,canvas}.md`.

## Task order
`T1 daily-note → T2 audit → T3 canvas`.

---

## Task 1: Daily-note creation (the one write)
**Files:** Create `src/lib/daily-note.ts` + `.test.ts`, `src/app/api/daily/route.ts` + `route.test.ts`; modify `src/components/AppShell.tsx` (palette action), `src/components/browse/TodayPage.tsx` (button). Source: `.superpowers/sdd/p4-drafts/daily-note.md`.
**Interfaces (pure):** `formatDailyDate(date): string`, `dailyNotePath(layout, date): string`, `parseDateParam(s): Date | null` (strict; rejects `2026-02-30`/`2026-13-01`/non-strings), `defaultTemplate(date): string`; `POST /api/daily` create-or-open.

- [ ] **Step 1 (TDD pure):** `daily-note.test.ts` first — `formatDailyDate` (ISO local, not UTC), `dailyNotePath` (nested `wiki/journal` join), `parseDateParam` (round-trip + reject invalid/non-string), `defaultTemplate` (parses via `parseFrontmatter` to `type: daily`). RED→implement `daily-note.ts`→GREEN.
- [ ] **Step 2 — route `POST /api/daily`:** `getVaultPath` (409 no-vault) → `parseDateParam` (400 bad date) → `getVaultLayout` (422 no journalDir) → `dailyNotePath` → `safeJoin` (400 escape) → `readVaultFile` pre-check (exists → **200 open, touch nothing**) → **atomic exclusive create** (`writeFile(abs, defaultTemplate(date), {flag:"wx"})`; `EEXIST` → 200 open) → `invalidateAfterWrite` → 201 created. **NO rename-over-existing anywhere.**
- [ ] **Step 3 — route test:** `mkdtemp` + `setVaultPath` (like vault-reader.test.ts); call twice, writing sentinel bytes first → assert **201 then 200, file bytes UNCHANGED** (the never-clobber guarantee); plus 409 no-vault, 422 no-journal, 400 bad-date.
- [ ] **Step 4 — wiring:** palette "Open today's note" (409→connect dialog, 422→toast); TodayPage button (201 "Created"/200 "Opened" toast, then `sheet.open(path)`). Token-only (`var(--accent-brand)`).
- [ ] **Step 5 — verify:** full gate + lint 0. Commit (`feat(vault): create-or-open today's daily note (atomic, never clobbers)`).

## Task 2: Generalize the audit dashboard
**Files:** Modify `src/lib/vault-reader.ts` (+`auditsDir` in VaultLayout + 3 probe tiers), `src/lib/vault-readers.ts` (`readAuditDashboard`), `src/lib/vault-reader.test.ts`, `src/app/api/audit-dashboard/route.ts` (thin), `eslint.config.mjs` (remove the AuditDashboard allowlist); create `src/lib/audit/parse.ts` + `.test.ts`, `src/components/browse/AuditPage.tsx`, `src/app/browse/audit/page.tsx`; delete `src/components/AuditDashboard.tsx`, `src/app/audit/page.tsx`; nav wiring (`AppShell.tsx`, `Sidebar.tsx`, expose `hasAudits` via `/api/vault`/`useVault`). Source: `.superpowers/sdd/p4-drafts/audit.md`.
**Interfaces (pure):** `emojiToStatus`, `parseOverallStatus`, `parseLatestStatus`, `parseAuditRows(table)` in `src/lib/audit/parse.ts` (emit `ok|warn|error|unknown`; **default unknown** — fixes default-to-green; resolve columns by HEADER NAME not position).

- [ ] **Step 1 — layout probe:** add `auditsDir` to `getVaultLayout` — tier1 `.cipher/layout.json` override, tier2 name probe (incl. `system/audits` so legacy `wiki/system/audits` matches), derive-from-`systemDir` fallback; null when absent. Extend `vault-reader.test.ts` (top-level, `system/audits` under `wiki/`, `.cipher` override wins, null when absent). RED→GREEN.
- [ ] **Step 2 — pure parser:** `audit/parse.ts` + tests (emoji/overall/latest/rows; header-order-swapped table proves name resolution; **missing status → `unknown` not green**). RED→GREEN.
- [ ] **Step 3 — reader + route on the spine:** `readAuditDashboard()` via `readVaultFile` + shared `parseTable`/`parseFrontmatter` (enrich from `latest-*.md`); rewrite route to a thin handler returning `{ available, overallStatus?, audits? }` (409 no-vault / 200 `available:false` / 200 `available:true`); DELETE the route's bespoke frontmatter/table parsers.
- [ ] **Step 4 — component + nav:** `AuditPage.tsx` on PageShell, token-only (StatusDot/Badge, motion tokens, inline-SVG chevron, shimmer loading, 60s + manual refresh); 3 states (no-vault→connect; `available:false`→calm "No audits in this vault" EmptyState; `available:true && 0 entries`→"folder found, no entries yet") — **branch on `{available}` BEFORE touching overallStatus**; new `/browse/audit`; delete old `AuditDashboard.tsx` + `/app/audit/page.tsx`; **remove the eslint allowlist** (now enforces token-only). Nav: palette entry always; sidebar row conditional on `vault.hasAudits`.
- [ ] **Step 5 — verify:** full gate + lint 0 (allowlist removed → net stricter; confirm no raw Tailwind color survives in AuditPage). Commit (`feat(audit): generalize dashboard onto layout probe + tokens + graceful empty state`).

## Task 3: Canvas (.canvas) rendering
**Files:** Create `src/lib/canvas/parse-canvas.ts` + `.test.ts`, `src/lib/canvas/canvas-color.ts`, `src/app/api/canvas/route.ts`, `src/lib/hooks/useCanvasContent.ts`, `src/components/browse/CanvasView.tsx` (+ `CanvasFullPage`); modify `src/lib/browse/file-kind.ts` (add `"canvas"`), `src/components/browse/PreviewPane.tsx` (branch), `src/components/browse/FileFullPage.tsx` (`.endsWith(".canvas")` short-circuit BEFORE `useFileContent`). Source: `.superpowers/sdd/p4-drafts/canvas.md`.
**Interfaces (pure):** `parseCanvas(json): ParsedCanvas` (never throws; tolerant; typed nodes text/file/link/group/unknown + edges; drops dangling edges) + `edgeAnchor(node, side, other)`; `canvas-color.ts` preset→token map; `GET /api/canvas?path=`.

- [ ] **Step 1 (TDD pure):** `parse-canvas.test.ts` first — the ~12 tolerance cases from the draft: garbage→`{nodes:[],edges:[]}` (null/`"nope"`/`{}`/`[]`/`{"nodes":null}`); text/file(`#subpath` split)/link/group/unknown nodes; drop node missing id/non-finite x; w/h defaults; color `"4"`→preset, `"#ff8800"`→hex, `"9"`/`"red"`→null; edge defaults (`fromEnd:"none"`,`toEnd:"arrow"`); drop dangling edge; raw-string JSON.parse path. Plus `edgeAnchor` (4 sides + null/auto). RED→implement→GREEN.
- [ ] **Step 2 — route + hook:** `GET /api/canvas?path=` mirrors `/api/file` (`getVaultPath`→`safeJoin`→`readFile`→`parseCanvas`; 400 missing/escape, 404 ENOENT); `useCanvasContent(path)` hook (loading/error/data + reload, cancel-on-unmount — mirror useFileContent).
- [ ] **Step 3 — CanvasView shell:** viewport + CSS-transform `transformLayer` (`translate(tx,ty) scale(s)`); pan (pointer drag) + wheel-zoom-toward-cursor (mirror GraphCanvas math, `{passive:false}`+preventDefault) + fit + keyboard; render group + text (→MarkdownRenderer) + image nodes (DOM, token-only). preset→token color; author-hex passthrough (parsed data, not a source literal → no allowlist).
- [ ] **Step 4 — file/link nodes + edges + wiring:** file-card (lazy-load `.md` via /api/file on viewport entry, or a titled "Open" card for MVP) + link-card nodes; SVG edge layer with a shared arrowhead marker; add `"canvas"` to `file-kind.ts`, branch in `PreviewPane.tsx`, and **short-circuit `.canvas` in FileFullPage BEFORE `useFileContent`** (else JSON is mis-parsed as markdown).
- [ ] **Step 5 — verify:** full gate + lint 0 (confirm no allowlist needed — DOM chrome is token-only; confirm the FileFullPage short-circuit). Commit (`feat(canvas): read-only Obsidian Canvas rendering (pan/zoom, text/file/image/group + edges)`).

---

## Final verification
- [ ] lint 0 / typecheck 0 / all tests pass / build green.
- [ ] Daily-note: create-or-open verified never clobbers (201-then-200, bytes unchanged). Audit: works on a vault with audits AND degrades calmly without (light+dark); no raw Tailwind color; reachable from nav. Canvas: a real `.canvas` renders (pan/zoom/fit/keyboard, text markdown, image, edges/arrows) light+dark.
- [ ] No new deps. No stray uncommitted edits.

## Spec coverage (vs design spec §10)
| Spec §10 item | Task |
|---|---|
| Canvas (.canvas) read-only rendering | 3 |
| Generalize audit dashboard (layout probe + tokens + nav + empty state) | 2 |
| Daily-note creation (the one write, never overwrite) | 1 |

## Self-review notes
- Daily-note safety (never clobber) is the load-bearing invariant — two layers + a bytes-unchanged test.
- Canvas-as-DOM avoids the canvas-color allowlist + reuses MarkdownRenderer; the FileFullPage short-circuit is the one easy-to-miss wiring risk.
- Audit removing its eslint allowlist makes the lint gate net stricter — a good forcing function for token-only.
- All carried minors (Phases 0b/1/2/3) still land in Phase 5.
