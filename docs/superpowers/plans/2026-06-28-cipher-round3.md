# Cipher Round 3 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`). Each task: TDD pure logic, run the FULL gate before committing, ONE commit, footer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Leave NO stray uncommitted edits.

**Goal:** An Obsidian-quality graph, chat that understands the vault and stops re-indexing every query, a single persisted conversation that keeps streaming across navigation, and a fixed "Checking…" state.

**Architecture:** react-force-graph replaces the frozen bespoke graph; the embeddings index becomes a one-time, concurrent, resumable, cached build; retrieval injects vault structure + graph-neighbour expansion + citations; a global chat store owns streaming so it survives navigation; `provider.status()` gets a timeout.

**Tech Stack:** Next.js 16, React 19, TS-strict, Tailwind v4, Vitest, d3-force via `react-force-graph` (new dep). No other new deps.

## Global Constraints
- TS strict; no new `any`. **Token-only color** (eslint `no-raw-color` + stylelint, both via `npm run lint`). Lint MUST stay 0.
- Conventional Commits; ONE commit/task; footer above. Full gate green before each commit: `npm run typecheck && npm run test:unit && npm run build && npm run lint`.
- No behaviour regressions to existing features (API-provider chat, daily-note, vault-switch, audit, canvas, search, responsive). SSR-safe: no storage/matchMedia reads in render or `useState` initializers — hydrate post-mount.
- Branch: `refinement`. Spec: `docs/superpowers/specs/2026-06-28-cipher-round3-design.md`.
- Only new dependency permitted: `react-force-graph` (Task 5).

## Task order
`1 checking-fix → 2 index-lifecycle → 3 structure-retrieval → 4 chat-persistence → 5 graph`. Front-loads the quick bug + the re-index pain; graph (biggest) last.

---

## Task 1: Fix the stuck "Checking…" state
**Files:** Modify `src/lib/chat/providers/ollama.ts` (`status()` timeout), `src/app/api/chat/health/route.ts` (defensive), `src/components/chat/ModelPicker.tsx` (fetch-on-mount + surface errors); add `src/lib/chat/providers/ollama.test.ts` if none. Source: spec §C.

- [ ] **Step 1 — timeout `status()` (TDD):** in `ollama.ts`, wrap the `/api/tags` fetch with an `AbortController` + `setTimeout(~1500ms)` (clear on settle); on abort/timeout return `{ ok:false, models:[], defaultModel:"llama3.2:3b" }` (the existing offline shape). Add a test that a hanging fetch (mock that never resolves within the timeout) resolves to `ok:false` within ~the timeout, not forever. RED→GREEN.
- [ ] **Step 2 — health route can't hang:** confirm `health/route.ts` only awaits the now-timed `status()` + `detectCli` (already timed). If any await is still unbounded, wrap it. No infinite await remains.
- [ ] **Step 3 — ModelPicker on-mount + error surface:** fetch health in a mount effect (not only on popover open); replace the swallowed `catch { /* ignore */ }` so a failure sets an explicit "unreachable/offline" state (a real status, not a permanent `null` → no perpetual "Checking…"). Token-only.
- [ ] **Step 4 — verify:** full gate. Commit (`fix(chat): time-out provider.status() + fetch health on mount (no stuck "Checking…")`).

## Task 2: Index lifecycle — one-time, concurrent, resumable, cached
**Files:** Modify `src/lib/chat/embeddings.ts` (`ensureIndex` → concurrent + incremental + resumable save), `src/lib/chat/retrieval.ts` (don't trigger a full rebuild per query); add `src/app/api/chat/index/route.ts` (explicit build + status) + a UI control (in `ModelPicker` or chat header) showing index status + an "Index vault" action; tests `embeddings.test.ts`. Source: spec §D1.

**Interfaces:** keep `EmbeddingIndex { embedder, model, dim, builtAt, chunks: IndexChunk[] }`; `IndexChunk { id, path, heading?, text, vec, mtime }`. Add `embedConcurrent(pending, embedder, { concurrency, onProgress, onPartial }): Promise<IndexChunk[]>` (pure-ish helper, testable with a mock embedder). `GET /api/chat/index` → `{ built: boolean; count: number; stale: boolean }`; `POST /api/chat/index` → streams progress, returns when done.

- [ ] **Step 1 — incremental rebuild (TDD):** change `ensureIndex` so it only re-embeds files whose `mtime > existing chunk mtime` (keep unchanged chunks); drop chunks for deleted files. Test (mock embedder + mock walk): unchanged vault → 0 new embeds (reuses cache); one changed file → only its chunks re-embed; deleted file → its chunks removed. RED→GREEN.
- [ ] **Step 2 — concurrent embeds:** add `embedConcurrent` with bounded concurrency (default 12) preserving order; replace the sequential `for … await embed()`. Test: all chunks embedded, order preserved, concurrency cap respected (count in-flight via a mock), one failing chunk doesn't abort the batch. RED→GREEN.
- [ ] **Step 3 — resumable partial save:** persist the index every N chunks (e.g. 50) via the existing atomic write, so an interrupted build resumes from the saved chunks next run (the incremental step then skips them). Test: a build that "stops" after 50 then re-runs embeds only the remainder.
- [ ] **Step 4 — don't rebuild per chat query:** `retrieve()` uses `loadExistingIndex()` (cached) and does NOT call `ensureIndex` inline; if the index is empty/missing it returns `[]` with a clear "needs indexing" signal (so the chat route can tell the user to index, instead of silently launching a full build on every "test"). The full build happens via the explicit endpoint/action.
- [ ] **Step 5 — explicit build endpoint + UI:** `GET/POST /api/chat/index` (status + build-with-progress, reuse the NDJSON progress shape). A small UI control (chat header / ModelPicker) shows "Indexed N · up to date / stale / not built" + an "Index vault" button that runs the build with the existing progress bar. Token-only.
- [ ] **Step 6 — verify:** full gate. Dev-server check (pending-ok): asking a question no longer re-indexes from 0; an explicit index build completes + persists + reused. Commit (`feat(chat): one-time concurrent resumable vault index (stop re-indexing every query)`).

## Task 3: Structure-aware retrieval + citations
**Files:** Modify `src/lib/chat/embeddings.ts` (embed `title+heading+path+body`), `src/lib/chat/retrieval.ts` (graph-neighbour expansion + tag boost), `src/lib/chat/prompt.ts` (inject vault structure + citations), `src/app/api/chat/route.ts` (assemble); tests for the pure pieces. Source: spec §D2.

**Interfaces:** `buildVaultStructureSummary(): string` (folder roles from `getVaultLayout` + tag list + note-title index — server, cached); extend `RetrievedChunk` with `title?`/`tags?`; `expandViaGraph(topPaths: string[], pool, max): IndexChunk[]` (pure-ish, uses `buildGraph`/`getBacklinks`).

- [ ] **Step 1 — structure-aware embed text:** the text embedded per chunk becomes `\`${title}\n${heading ?? ""}\n${path}\n${body}\`` (compose helper, pure + tested: title/heading/path present in the embedded string). Bump a small index `version`/embedder marker so existing indexes rebuild once. RED→GREEN.
- [ ] **Step 2 — graph expansion + tag boost (TDD):** after the cosine top-K, `expandViaGraph` pulls linked/backlinked notes of the top hits into the candidate pool (capped), and a tag-overlap boost nudges query↔note tag matches up. Test (mock graph + chunks): a linked neighbour of a top hit is included; tag-overlapping chunk ranks above an equal-cosine non-overlapping one. RED→GREEN.
- [ ] **Step 3 — system prompt structure injection:** `buildVaultStructureSummary()` returns a compact folder-role + tags + title-index summary; `buildPrompt` prepends it to `SYSTEM_PROMPT` (budgeted/truncated) and labels each context chunk with `path`/`title`/`tags` so the model can cite. Test: the summary includes folder roles + tags; `buildPrompt` output contains it + per-chunk source labels.
- [ ] **Step 4 — citations:** ensure answers can cite `[note]`/`[^N]` sources — the chunk labels + `parseCitations` already support `[^N]`; confirm the assembled context numbers chunks so the model cites them, and `parseCitations` resolves them. Test a sample.
- [ ] **Step 5 — verify:** full gate. Dev-server check (pending-ok): with the index built, a question pulls relevant notes + the model references the vault structure + cites sources. Commit (`feat(chat): structure-aware retrieval (titles, vault layout, graph expansion, citations)`).

## Task 4: Chat persistence + cross-page streaming
**Files:** Create `src/lib/chat/chat-store.tsx` (context provider + `useChat` hook); modify `src/components/AppShell.tsx` (mount provider above content), `src/components/ChatInterface.tsx` (consume the store), the chat fetch (AbortController in the store). Source: spec §B.

**Interfaces:** `ChatProvider` (React) + `useChat(): { turns, streaming, partial, send(query), newChat(), stop() }`. State persisted to localStorage `cipher-chat-history-v2` (single conversation incl. the partial streaming turn); stream + `AbortController` live in the store.

- [ ] **Step 1 — store (TDD where logic):** `chat-store.tsx` — holds `turns` + the in-flight stream; `send()` opens the NDJSON fetch with an `AbortController`, appends tokens to a `partial` turn in the store, finalizes on done; `stop()` aborts; `newChat()` clears. Persist to localStorage (SSR-safe: hydrate post-mount; persist partial too). A pure reducer (turns + token → next turns) is unit-tested. RED→GREEN.
- [ ] **Step 2 — mount above the router:** wrap content in `<ChatProvider>` in `AppShell` so the store outlives the `/chat` page. The stream keeps writing to the store after navigation (it's not tied to ChatInterface).
- [ ] **Step 3 — ChatInterface consumes the store:** refactor `ChatInterface` to read `turns`/`streaming`/`partial` from `useChat` and call `send`/`newChat`/`stop`; on mount it RE-ATTACHES to an in-flight stream (shows the live partial) instead of restarting. Remove the component-local stream closure.
- [ ] **Step 4 — verify:** full gate. Dev-server check (pending-ok): start an answer, navigate away + back → it kept streaming and the page re-attaches; reload → conversation persists; "New chat" clears. Commit (`feat(chat): global chat store — persists + keeps streaming across navigation`).

## Task 5: Graph — Obsidian-quality via react-force-graph
**Files:** Add `react-force-graph` dep; create `src/components/browse/ForceGraph.tsx` (the new graph) consuming `buildGraph()` data + `tag-color.ts`; modify `src/components/browse/MapPage.tsx` to mount it + keep `GraphLegend.tsx`; retire/trim `GraphCanvas.tsx` (the bespoke sim). Source: spec §A.

**Interfaces:** `ForceGraph({ graph, visibleTags, onOpen })` where `graph` is the existing `buildGraph()` shape (nodes `{id,path,title,tags,tag,degree/backlinks}`, edges `{source,target}`).

- [ ] **Step 1 — dependency + data adapter:** `npm i react-force-graph` (note the version in the report). Write a pure adapter `toForceGraphData(graph): { nodes, links }` mapping `buildGraph()` → react-force-graph's `{nodes:[{id,...}], links:[{source,target}]}`; unit-test the mapping (nodes/links counts, degree carried, orphan handling). RED→GREEN.
- [ ] **Step 2 — ForceGraph component (the Obsidian feel):** mount `ForceGraph2D` with: degree-scaled `nodeVal`/custom `nodeCanvasObject` (radius range so hubs are clearly bigger; token colour via `getComputedStyle(--hue-*)`); **zoom-gated labels** in `nodeCanvasObject` (draw label only above a zoom threshold; hubs first); **hover → highlight neighbourhood, dim the rest** (`onNodeHover` + `nodeColor`/`linkColor` based on a highlight set); visible weighted edges (`linkColor`/`linkWidth`, not vanishing when fit); **single-click `onNodeClick` → `onOpen(path)`**; drag enabled (react-force-graph pins `fx/fy` on drag + reheats — neighbours relax for free); `cooldownTicks`/`onEngineStop` so it settles then idles (no constant repaint); fit-to-view on load. Token-only paint.
- [ ] **Step 3 — wire MapPage + legend + filter:** `MapPage` renders `<ForceGraph graph onOpen visibleTags>`; the existing tag-filter `GraphLegend` toggles `visibleTags`, and filtered-out nodes dim/hide. Remove the dependency on the old `GraphCanvas` (delete it or leave unmounted — prefer delete to avoid dead code; if deletion is large, leave a thin note). Keep keyboard pan/zoom + fit if the lib supports, else its built-ins.
- [ ] **Step 4 — verify:** full gate (no new lint/stylelint issues; canvas paint resolves tokens so no raw color). Dev-server check (pending-ok, the key one): on the real 2437-node vault — live settle, draggable with neighbour relaxation, readable labels at zoom, hover highlights + dims, edges visible, single-click opens, no main-thread freeze. Commit (`feat(graph): Obsidian-quality force graph via react-force-graph`).

---

## Final verification
- [ ] typecheck 0 / test:unit pass / build green / lint 0 (eslint+stylelint).
- [ ] "Checking…" resolves (no hang). Index builds once, concurrently, resumably, and is reused (no re-index per query). Chat understands vault structure + cites sources. Conversation persists + keeps streaming across navigation. Graph feels like Obsidian (drag/hover/labels/zoom/single-click-open) on the 2437-node vault.
- [ ] Only new dep is `react-force-graph`. No stray uncommitted edits. Human dev-server visual pass on graph + chat.

## Spec coverage
| Spec workstream | Task |
|---|---|
| C "Checking" fix | 1 |
| D1 index lifecycle | 2 |
| D2 structure retrieval | 3 |
| B chat persistence + cross-page | 4 |
| A graph (react-force-graph) | 5 |
| E craft | folded into each |

## Self-review notes
- Pure cores (status timeout, embedConcurrent, incremental rebuild, structure-embed text, graph expansion + tag boost, structure summary, chat reducer, toForceGraphData) are the tested surfaces; integration/UI/visual are gate + dev-server verified.
- Task 2 is the one that stops the re-index pain; Task 5 is the top quality priority (must feel like Obsidian) and the biggest.
- Index `version` bump in Task 3 forces a one-time rebuild so structure-aware vectors take effect.
- react-force-graph handles drag-relaxation + Barnes-Hut, directly fixing the two worst graph complaints (frozen layout, broken drag).
