# Cipher Round 3 — Design Spec

- **Date:** 2026-06-28
- **Branch:** `refinement`
- **Status:** Approved design (decisions locked via Q&A), ready for implementation plan
- **Author:** Stijn (with Claude Opus 4.8)

## Purpose

Make the graph genuinely Obsidian-quality (it currently looks bad and is "impossible to use"), make the chat truly understand the vault and stop re-indexing on every question, persist + continue chats across navigation, fix the stuck "Checking…" LLM state, and craft the touched UI.

## Locked decisions (from Q&A)

| # | Topic | Decision |
|---|---|---|
| A | Graph | **Full graph library → `react-force-graph`** (d3-force layout + canvas; the Obsidian-style choice). Sigma.js is the noted WebGL alternative for very large vaults. |
| B | Chat history | **Single conversation that persists** (no thread list). |
| B2 | Chat storage | **localStorage** (do NOT write files into the user's real Obsidian vault). |
| B3 | Cross-page streaming | **Global chat store/context + AbortController** — streaming continues across navigation. |
| C | "Checking…" bug | Fix the **un-timed `provider.status()`** (timeout + fetch-on-mount + surface errors). |
| D | Retrieval depth | **Full structure-aware**: embed title+heading+path+body, inject vault layout/tags/titles into the system prompt, graph-neighbour expansion, cite sources. |
| D2 | Index lifecycle | **One-time persisted build** (not lazily on every chat), **concurrent/batched embeds**, **resumable/incremental**, explicit "Index vault" control + progress, chat uses the cache. |

## Current state (grounding — from parallel exploration)

- **Graph** (`src/components/browse/GraphCanvas.tsx`, 1259 lines): layout is **pre-baked** via a synchronous 900-iteration settle on mount then **frozen** — the rAF loop only animates cosmetics. Dragging a node moves only that node (no neighbour relaxation). Radius clamped 1.2–5px (no hierarchy). Edges ~0.18 alpha, `0.4/scale` width (near-invisible). Hover doesn't dim others; single-click is hijacked for a bespoke focus-HUD; **open is double-click**. O(n²)/tick + blocking mount settle. `buildGraph()` (`src/lib/vault-graph.ts`) supplies nodes/edges/degree/tags; 7-hue `tag-color.ts`.
- **Chat** (`src/components/ChatInterface.tsx`): `turns` in React state, persisted to localStorage `cipher-chat-history-v1` (cap 20, streaming excluded). NDJSON stream owned by the `submit()` closure — **no AbortController**; navigating away unmounts and drops the partial answer. Rendering is good markdown (`StreamingMarkdown.tsx`: react-markdown + gfm + katex + highlight + `[^N]` citations).
- **Retrieval** (`src/lib/chat/retrieval.ts`, `embeddings.ts`, `prompt.ts`): flat RAG over **body-only** chunk text; `SYSTEM_PROMPT` says nothing about the vault structure; embeddings exclude title/heading/path; structure primitives (`getVaultLayout`, `buildGraph`, `extractTags`) exist but never feed chat. Active provider **ollama-cloud**; the live index at `/Users/stijn/Developer/Obsidian/.cipher/embeddings.json` is **empty/legacy** → retrieval returns `[]`.
- **Indexing** (`embeddings.ts:55` `ensureIndex`): lazily rebuilt **on every chat query**; embeds all chunks **sequentially** (`for … await embed()`); **saved only at the very end** (line 117). For the 2437-chunk real vault over ollama-cloud this never finishes within a request → re-indexes from 0 every time ("INDEXING VAULT 28/2437…").
- **"Checking…" bug** (`src/app/api/chat/health/route.ts`, `providers/ollama.ts:33`, `cli.ts:245`, `ModelPicker.tsx`): `provider.status()` awaits an **un-timed** fetch/spawn that can hang forever; `ModelPicker` fetches health only on popover-open and swallows errors into a permanent `null`.

## Goals / Non-goals

**Goals:** the workstreams below, each token-only (eslint+stylelint), TS-strict, TDD where logic exists, lint 0, no behaviour regressions to existing features.

**Non-goals (this round):** chat thread list / multi-session (single conversation only); writing chats into the vault (localStorage only); a full chat-UX rewrite (rendering is already good — polish only); embeddings provider changes (use the configured one).

---

## Workstream A — Graph: Obsidian-quality via `react-force-graph`

**Replace** the frozen hand-rolled canvas layout/sim with `react-force-graph` (the `react-force-graph-2d` canvas build — d3-force layout, canvas render, built-in pan/zoom/drag/hover; this is what Obsidian-style graphs use). Keep the existing data source `buildGraph()` and the tag-colour tokens (custom node paint resolves `--hue-*` via `getComputedStyle`).

**Must deliver the Obsidian feel:**
- **Live force layout** that visibly settles (d3-force alpha cooling); cools to idle (no constant repaint).
- **Drag a node → neighbours relax** (pin via `fx/fy` on drag, `d3ReheatSimulation`/`alphaTarget` on release).
- **Degree-scaled node radius** with a real range (small leaves → large hubs), via `nodeVal`/custom paint.
- **Zoom-gated labels**: labels fade in past a zoom threshold; declutter (don't draw all labels when zoomed out). Hub labels first.
- **Hover highlights neighbourhood, dims the rest** (nodes + edges), like Obsidian.
- **Edges visible**: brighter/weighted, sensible width that doesn't vanish when fit; optionally curved.
- **Single-click opens** the note (the standard); hover = highlight. Keep ⌘/double-click semantics sane.
- **Fit-to-view, zoom controls, keyboard pan/zoom**; orphan handling; tag-filter legend ported (`GraphLegend`).
- Performant on the 2437-node real vault (no main-thread freeze; the lib handles Barnes-Hut).
**Files:** rewrite `GraphCanvas.tsx` onto react-force-graph (or a new `ForceGraph.tsx` that `MapPage` mounts); keep/port `GraphLegend.tsx`, `tag-color.ts`. Add the `react-force-graph` dependency. Retire the bespoke sim/pre-settle/focus-HUD (or keep a slim HUD if cheap). Verify token-only (canvas paint resolves tokens).

## Workstream B — Chat persistence + cross-page continuation

A **global chat store** (React context provider mounted above the router in `AppShell`, or a small module store) that owns: the single conversation `turns`, the in-flight stream, and an `AbortController`. localStorage-backed (lift the cap; persist the streaming turn's partial text too). The `/chat` page becomes a thin view that reads/writes the store. **Streaming keeps running after navigation** (it lives in the store, not the page) and the page re-attaches to the live stream on return. "New chat" clears. **Files:** new `src/lib/chat/chat-store.tsx` (context + provider + hook), mount in `AppShell`, refactor `ChatInterface.tsx` to consume it, AbortController on the fetch.

## Workstream C — Fix the stuck "Checking…"

`provider.status()` for ollama (local fetch + CLI spawn) gets a **~1.5s timeout/AbortSignal**; `health/route.ts` never hangs. `ModelPicker` **fetches health on mount** (not only on open) and **surfaces failures as an explicit offline/unreachable state** instead of swallowing into a permanent `null`. **Files:** `providers/ollama.ts`, `providers/cli.ts` (`detectCli` already times out — verify), `app/api/chat/health/route.ts`, `components/chat/ModelPicker.tsx`.

## Workstream D — Retrieval understands the vault (+ index lifecycle)

**D1 Index lifecycle (fixes the re-indexing):**
- Build **once**, persist, and **reuse**; do NOT re-run a full build on every chat. Chat uses the cached index; rebuild only for new/changed files (incremental by mtime).
- **Concurrent/batched embeds** (bounded concurrency, e.g. 8–16 in flight) instead of 2437 sequential awaits.
- **Resumable / incremental save** — persist progress periodically so an interrupted build resumes rather than restarting from 0.
- **Explicit "Index vault" control** with progress + status in the chat/model UI; chat answers use whatever's indexed and prompt to (re)index when empty/stale, rather than silently blocking each question on a full rebuild.

**D2 Structure-aware retrieval:**
- **Embed `title + heading + path + body`** (not body-only) so titles/sections drive similarity.
- **Inject vault structure into the system prompt**: a `getVaultLayout()` folder-role summary + tag list + a note-title index, so the model knows the vault's shape.
- **Graph expansion**: after the top cosine hits, pull in their linked/backlinked notes (`buildGraph`/`getBacklinks`) so answers follow wiki-links; boost by query↔tag overlap.
- **Citations**: answers cite `[note]` sources (renderer already supports `[^N]`); carry `frontmatter.type`/`tags` into chunk metadata + the context labels.
**Files:** `src/lib/chat/embeddings.ts` (lifecycle + structure embed), `retrieval.ts` (graph expansion + tag boost), `prompt.ts` (structure injection + citations), `app/api/chat/route.ts` (assemble), an index-build/status endpoint + UI control.

## Workstream E — Craft pass (folded into A–D)

Tighten every touched element — graph controls/legend/labels, chat composer/messages/empty-state, the health pill, the index-progress UI — for straightforward, human UX. Token-only; honour reduced-motion. Not a rewrite; polish.

---

## Execution shape

Opus writes the spec + plan; Sonnet implements per task with reviews. Recommended order: **C (quick bug) → D1 index-lifecycle (stops the re-index pain) → D2 structure retrieval → B chat persistence → A graph (biggest)**. A and D are the large ones; A is the top quality priority (must feel like Obsidian).

## Risks
- **Graph lib integration (A):** matching token colours + the craft requirements on react-force-graph's canvas paint API; retiring the bespoke focus-HUD without losing useful behaviour. Mitigate: custom `nodeCanvasObject`/`linkCanvasObject`, port legend, verify on the 2437-node vault.
- **Index build cost (D1):** embedding 2437 chunks over ollama-cloud is slow even concurrent; resumable + incremental + explicit control are what make it usable. Don't block chat on a full build.
- **Cross-page stream (B):** store must own the AbortController + partial text; avoid setState-after-unmount; persist partial safely.
- **No new behaviour regressions:** existing API-provider chat path, daily-note, vault-switch (round 2) untouched.
- **New dep:** `react-force-graph` (+ its d3-force transitive deps) — approved (graph-library decision).

## Spec coverage
| Workstream | Plan task(s) |
|---|---|
| C "Checking" fix | task 1 |
| D1 index lifecycle | task 2 |
| D2 structure retrieval | task 3 |
| B chat persistence + cross-page | task 4 |
| A graph (react-force-graph) | task 5 |
| E craft | folded into each |
