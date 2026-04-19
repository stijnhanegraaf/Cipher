# Chat overhaul — grounded streaming Q&A (sub-project 1) — Design Spec

**Date:** 2026-04-19
**Status:** Approved for planning
**Scope:** Replace the current shallow `/chat` surface (intent router → structured view cards only, no LLM) with a streaming, citation-grounded Q&A experience backed by a local Ollama model and a hybrid retrieval pipeline. Linear-dense UI rewrite at the same time because the new data flow reshapes the layout.

> **Decomposition note.** The user's full ask ("make chat truly helpful and smart and nice designed — conversational research partner that reads, writes, cites") decomposes into three sub-projects:
>   1. **This spec** — grounded streaming Q&A with citations + new chat UI.
>   2. **Agentic actions** — tool-calling (create note, toggle task, add link). Separate spec later; depends on the LLM loop this spec introduces.
>   3. **Structured-view polish** — redesign of the existing `ViewRenderer` cards (current_work, timeline, etc.). Separate spec or absorbed later.
>
> Scope of this doc is sub-project #1 only.

---

## Context

Today `/chat` looks like a chat but isn't one. `POST /api/query` runs `detectIntent()` → `buildView()` and returns a structured `ResponseEnvelope`. The LLM is never called — there is no LLM in the stack. That means questions like "what did I write about the Q3 plan" get no answer; only a narrow set of six pre-defined intents (`current_work`, `entity_overview`, `timeline_synthesis`, `system_status`, `browse_*`, `topic_overview`, `search_results`) produce anything meaningful.

`src/components/ChatInterface.tsx` is a 1072-line monolith with word-by-word fade animation, slash commands, inline task toggles, and intent-specific rendering paths. The empty state (`ChatEmptyState.tsx`) is a centered Raycast-style input with a purple padlock icon, which (a) clashes with the new `CIPHER_` brand wordmark and (b) is generic.

This spec adds a real LLM answer path *alongside* the intent router and rewrites the UI to match. The intent router still fires first for the six deterministic cases — those view cards are actually good UX and replacing them with prose would be a regression. Everything else falls through to the LLM.

---

## Goals

1. Real answers to open-ended questions, grounded in the vault's note content with visible citations.
2. Local / private — no cloud calls. Ollama on `localhost:11434`.
3. UI that fits the rest of the app (Linear-dense, token-driven, no avatars, no chat bubbles).
4. Preserve the existing structured view cards for intent matches — zero regression on `current_work` / timeline / etc.
5. Split the 1072-line `ChatInterface.tsx` into a shell + small focused components.

Non-goals (explicit — see Scope fences):

- No agentic tool-calling.
- No upgrades to `ViewRenderer` view cards.
- No cloud LLMs, no BYOK, no multi-user, no server-side history.
- No non-`.md` indexing (PDFs, images, attachments).
- No in-UI model switcher. Model selected via env var for v1.

---

## Architecture

### Endpoint — `POST /api/chat`

Streams `application/x-ndjson`. Each line is one event.

```ts
type ChatEvent =
  | { type: "envelope"; envelope: ResponseEnvelope }          // intent-router match
  | { type: "index-progress"; done: number; total: number }   // first-run embedding build
  | { type: "token"; text: string }                           // LLM stream
  | { type: "citation"; id: number; path: string; heading?: string; snippet: string }
  | { type: "done" }
  | { type: "error"; code: "ollama-down" | "model-missing" | "empty-vault" | "unknown"; message: string };
```

Request body:

```ts
interface ChatRequest {
  query: string;
  history: { role: "user" | "assistant"; content: string }[];  // last 4 turns max, client-trimmed
}
```

### Server pipeline

```
POST /api/chat
  │
  ├─ detectIntent(query)
  │   └─ if matched (current_work / entity_overview / timeline_synthesis /
  │      system_status / browse_* / topic_overview / search_results):
  │        emit { type: "envelope", envelope }      (existing buildView output)
  │        emit { type: "done" }
  │        return
  │
  └─ LLM path:
      ├─ ensureIndex()   ← lazily build <vault>/.cipher/embeddings.json on
      │                    first call or when any file mtime > index builtAt.
      │                    Emits index-progress events during build.
      │
      ├─ retrieve(query) → top 8 chunks  (see Retrieval section)
      │
      ├─ prompt = systemPrompt + history[last 4] + chunks labelled [1]..[8] + query
      │
      ├─ stream Ollama:  POST http://localhost:11434/api/chat  { model, messages, stream: true }
      │   on each chunk → emit { type: "token", text }
      │
      ├─ after stream closes: parse [^N] markers, dedupe, emit one
      │   { type: "citation", id, path, heading?, snippet } per unique match
      │
      └─ emit { type: "done" }
```

### Client flow

`src/components/ChatInterface.tsx` becomes a thin shell that owns:

- `messages: Turn[]` — persisted to `localStorage["cipher-chat-history-v1"]`, capacity 20 turns.
- `submit(query)` — builds request body (query + trimmed history), `fetch("/api/chat")`, iterates the NDJSON stream, updates the live turn in-place, persists to localStorage on `done`.
- Renders `<QACard />` for every turn + `<Composer />` pinned at the bottom.

### File structure

**New:**

| File | Responsibility |
|---|---|
| `src/app/api/chat/route.ts` | POST endpoint. Orchestrates intent check → retrieval → Ollama stream → NDJSON event emission. |
| `src/lib/chat/ollama.ts` | Ollama HTTP wrapper. `streamChat(messages)` returns `AsyncIterable<string>`. `embed(text)` returns `number[]`. `listTags()` for model detection. |
| `src/lib/chat/embeddings.ts` | Index build + load + query. Walks vault, chunks by H2/H3 (fallback 500-word windows), embeds, writes `<vault>/.cipher/embeddings.json`. Exports `ensureIndex(onProgress)` and `queryIndex(queryVec, topN)`. |
| `src/lib/chat/retrieval.ts` | Hybrid retrieval: `fuzzyScore`-based keyword shortlist (top 40) → embedding cosine rerank (top 8) → token-budget truncation (3000 tokens). |
| `src/lib/chat/prompt.ts` | Builds the final prompt: system message (tone, citation rules) + history + labelled chunks + user query. |
| `src/components/chat/QACard.tsx` | One Q&A unit. Header (`ASKED · <ago>` + question) + body (structured envelope OR streaming prose) + sources pills. |
| `src/components/chat/CitationPill.tsx` | Small 28px-tall pill; click opens sheet at path+heading. |
| `src/components/chat/Composer.tsx` | Bottom-pinned textarea + submit. Slash-command-compatible. |
| `src/components/chat/StreamingText.tsx` | Streams tokens into a span, renders a blinking `▌` cursor while active. Reuses `cipher-cursor-blink` keyframe. |
| `src/components/chat/ChatEmptyState.tsx` | (Replaces existing file.) Single `Ask about your vault.` line + centered Composer + three clickable example prompt chips. |

**Modified:**

| File | Change |
|---|---|
| `src/components/ChatInterface.tsx` | Rewritten. Target: < 250 lines. Owns state + orchestration only; visual bits live in the chat/ subcomponents. |
| `src/app/chat/page.tsx` | Unchanged — still just `<Suspense><ChatInterface /></Suspense>`. |
| `src/app/api/query/route.ts` | Unchanged (kept for the old palette `Ask chat` fallback URL). Eventually retire, but out of scope here. |

**Reuse (do NOT reimplement):**

- `detectIntent`, `buildView`, `ResponseEnvelope`, `ViewRenderer` — intent-router path.
- `fuzzyScore` from `src/lib/fuzzy.ts` — keyword shortlist.
- `getVaultLayout`, `getVaultPath` from `src/lib/vault-reader`.
- `useSheet` — citation pill click → opens sheet.
- `SlashCommandMenu` — composer slash commands.
- `useVault` — connection state.
- `cipher-cursor-blink` keyframe (from the brand refresh) — streaming cursor.
- All design tokens: `.app-row`, `var(--radius-pill)`, `var(--bg-surface-alpha-2)`, `var(--border-subtle)`, `mono-label`, `body-large`, `caption-large`.
- `localStorage` — history persistence (same pattern as `useRecentFiles`).

---

## Retrieval

### Index build

Triggered lazily on first LLM-path query, or when any `.md` file's mtime exceeds the index `builtAt`. Progress streamed to the client as `index-progress` events (`done`/`total` counts).

**Chunking:**
- Parse each `.md` file into sections by H2/H3 headings.
- Files without H2/H3: split into 500-word windows.
- Skip chunks shorter than 50 words (after whitespace collapse).
- Each chunk keeps `{ id: "<path>#<heading-slug>", path, heading?, text, mtime }`.

**Embedding:**
- Model: `nomic-embed-text` (768 dims, fast on CPU, good enough for vault-scale).
- `POST http://localhost:11434/api/embeddings { model, prompt }` → `embedding: number[]`.
- Batch size: one chunk per request — keeps progress granular and memory low.

**Storage:**
- Path: `<vault>/.cipher/embeddings.json`.
- Shape: `{ model, builtAt, chunks: [{ id, path, heading?, text, vec, mtime }] }`.
- Written atomically (tmp file + rename).
- Rebuild triggers: (a) missing file, (b) `model` mismatch, (c) any vault file's mtime > `builtAt`.

**Scale sanity check:**
- 250 files × ~5 sections × ~100ms embed = ~125s cold build on a typical laptop. Progress UI keeps it tolerable. Warm path: index is just JSON, no per-file stat loop beyond a single `max(mtime)` check against the index timestamp (use `find <vault> -name '*.md' -newer <vault>/.cipher/embeddings.json` or equivalent Node-stat sweep).

### Query pipeline (`retrieval.ts`)

```ts
export async function retrieve(query: string): Promise<RetrievedChunk[]> {
  const index = await ensureIndex(/* onProgress */);
  // 1. Keyword shortlist — top 40 by fuzzyScore against chunk.text.
  const shortlist = index.chunks
    .map((c) => ({ c, score: fuzzyScore(query, c.text) }))
    .filter((x) => x.score !== Infinity)
    .sort((a, b) => a.score - b.score)
    .slice(0, 40)
    .map((x) => x.c);

  // 2. Embed the query once.
  const qVec = await embed(query);

  // 3. Cosine similarity against the shortlist, take top 8.
  const ranked = shortlist
    .map((c) => ({ c, sim: cosine(qVec, c.vec) }))
    .sort((a, b) => b.sim - a.sim)
    .slice(0, 8);

  // 4. Token-budget truncate: cap at ~3000 tokens total. Longest chunks trimmed first.
  return truncateToBudget(ranked.map((r) => r.c), 3000);
}
```

### Prompt shape (`prompt.ts`)

```
SYSTEM:
You are Cipher, a research assistant grounded in the user's personal vault.
Answer the user's question using ONLY the provided notes. Cite each fact
with a marker like [^1] that matches a note index. If the notes do not
contain the answer, say so plainly — do not invent.

NOTES:
[1] alice.md — Plans
    "…"
[2] q3-plan.md — Growth
    "…"
(…)

CONVERSATION:
user: <earlier question>
assistant: <earlier answer>
user: <current query>
```

Citations: the model writes `[^1]`, `[^2]`, etc. inline. The server parses these on stream close, dedupes, and emits one `citation` event per unique `[^N]` mapped back to `{ path, heading, snippet }` from the retrieved chunk list.

---

## UI

### Page shell

Uses existing `PageShell` primitive. Header title `Chat`, subtitle `· <modelName>` pulled from env at build time. Header `actions` slot: a single `Clear chat` icon button that wipes `cipher-chat-history-v1` and resets state.

### Layout

`PageShell` body is a flex column, scrolling:

```
┌──────────────────────────────────────────────┐
│ < QACard #1 >                                │
│                                              │
│ < QACard #2 >                                │
│                                              │
│ < QACard #3 — currently streaming >          │
│                                              │
│  (24px bottom spacer)                        │
├──────────────────────────────────────────────┤
│ < Composer — pinned bottom, 48px >           │
└──────────────────────────────────────────────┘
```

Content width cap: `contentMaxWidth={720}` passed to `PageShell`. 32px horizontal padding matches the rest of the app.

### `QACard` structure

No bubbles. No avatars. Each card:

```
ASKED · 2m ago                          ← mono-label, var(--text-quaternary), tracking 0.08em
what did I write about the q3 plan      ← body-large, var(--text-primary)
                                        ← 12px gap

<body>                                  ← one of:
                                        ─ ViewRenderer (chat-summary variant) if envelope is an intent match
                                        ─ <StreamingText /> followed by <SourcesRow /> if LLM
                                        ─ A single <ErrorRow /> if the server emitted `error`

                                        ← 24px gap to next card
```

### Streaming prose + cursor

`<StreamingText>` keeps a buffer of concatenated `token` events. While the turn is still open (no `done` yet), a 1-char `▌` is appended, styled with `var(--font-mono)` and the existing `cipher-cursor-blink` keyframe. On `done`, the cursor is removed.

Inline `[^N]` markers are replaced during render with a tiny superscript button, `font-size: 10px`, `color: var(--accent-brand)`. Clicking it scrolls the matching source pill into view and briefly (300ms) tints it with `var(--bg-surface-alpha-4)`.

Markdown support: bold, italic, links (`[text](url)` → renders as link; internal wiki-links `[[name]]` → open sheet via `useSheet`), inline code, fenced code blocks, unordered lists, ordered lists. Tables, images, and HTML are stripped in v1 — unlikely in a chat answer, and adding a full Markdown stack is out of scope. Reuse whatever light parser is already in `ViewRenderer` if one exists; otherwise a 50-line local renderer.

### `SourcesRow`

```
SOURCES · 3
[ alice.md ]  [ q3-plan.md ]  [ oct-1.md ]
```

- Label: `mono-label`, quaternary, count tabular-numeric right.
- Pills: 28px tall, 8px horizontal padding, `var(--radius-pill)`, border `var(--border-subtle)`, background `var(--bg-surface-alpha-2)`.
- Click: `sheet.open(path, heading)`.
- `⌘+click`: `router.push(/file/<path>)`.
- Hover: background → `var(--bg-surface-alpha-4)`.

### `Composer`

- Textarea auto-grows from 44px up to 6 lines (~140px), then scrolls internally.
- `⌘+Enter` or `Enter` (without shift) submits.
- `⌘↵` kbd label on the right.
- Slash commands menu reused from the current `SlashCommandMenu` (unchanged).
- Border: `var(--border-standard)`; focus border: `var(--accent-brand)` (matches the current composer).

### Empty state

Replaces `ChatEmptyState.tsx`:

```
                (vertical-center, 30dvh from top)

       Ask about your vault.            ← heading-3, var(--text-tertiary)

       [ Composer centered, 520px wide ]

       Try:
       • summarise this week's notes
       • what is Alice working on
       • find notes related to Q3 plan   ← 3 clickable caption-large chips
                                            Wired to actual entity names when
                                            a vault is connected (fallback
                                            to the literal strings above).
```

No purple padlock icon. No separate `<h1>Ask about your vault</h1>` + giant icon block. One heading, one composer, three hints.

### Index-build progress UI

While the server streams `index-progress` events on first-run:

```
INDEXING VAULT · 47/243
━━━━━━━━━░░░░░░░░░░░░░░░░
```

Rendered inside the QACard body where prose would otherwise stream. On completion it's replaced by the streaming tokens. Subsequent queries bypass this entirely (index already fresh).

### Error states

Single row inside the QACard body, no prose:

| Error code | Copy |
|---|---|
| `ollama-down` | "Ollama isn't running. Start it with `ollama serve`." (code span) |
| `model-missing` | "Model `<name>` not pulled. Run `ollama pull <name>`." |
| `empty-vault` | "No notes in the vault yet — add a `.md` file first." |
| `unknown` | "Something went wrong. Check the server logs." |

Row background: `var(--bg-warning-alpha)` if defined, else `var(--bg-surface-alpha-2)` with a 2px left border in `var(--text-warning)`.

### Keyboard

| Key | Action |
|---|---|
| `Enter` (composer) | Submit |
| `Shift+Enter` | Newline |
| `⌘↵` | Submit (explicit) |
| `/` at pos 0 | Open slash command menu |
| `⌘K` | Open command palette (unchanged) |

### History

- Persisted to `localStorage["cipher-chat-history-v1"]` on every `done`.
- Capacity 20 turns (40 messages). FIFO.
- Re-opening the tab: turns render immediately from localStorage, no server call.
- "Clear chat" (header action) wipes the key and resets in-memory state.

---

## Model & config

- Default model: `llama3.2:3b` (3B params, fits comfortably on a laptop, decent instruction-following).
- Embedding model: `nomic-embed-text` (hard-coded, single-purpose; switching it invalidates the index).
- Ollama base URL: `http://localhost:11434` (hard-coded — v1; follow-up if the user ever needs remote Ollama).
- Override chat model via env var `CIPHER_CHAT_MODEL`. Read at request time, not build time.
- No per-user or per-vault override in UI. Dropdown is a follow-up.

### Health check on load

On first mount of `/chat`, client fires `GET /api/chat/health` — a tiny endpoint that calls Ollama's `GET /api/tags` and returns `{ ok: boolean, model: string, hasModel: boolean, hasEmbedModel: boolean }`. If either required model is missing, the empty state shows a banner with the pull commands *before* the user types. Silent pass if all good.

(Adds one more tiny endpoint: `src/app/api/chat/health/route.ts`.)

---

## Critical files — summary

**New (11):**

- `src/app/api/chat/route.ts`
- `src/app/api/chat/health/route.ts`
- `src/lib/chat/ollama.ts`
- `src/lib/chat/embeddings.ts`
- `src/lib/chat/retrieval.ts`
- `src/lib/chat/prompt.ts`
- `src/components/chat/QACard.tsx`
- `src/components/chat/CitationPill.tsx`
- `src/components/chat/Composer.tsx`
- `src/components/chat/StreamingText.tsx`
- `src/components/chat/ChatEmptyState.tsx` (replaces the root `ChatEmptyState.tsx` — move it into `chat/`)

**Modified (1):**

- `src/components/ChatInterface.tsx` (full rewrite, target < 250 lines)

**Deleted (1):**

- `src/components/ChatEmptyState.tsx` (moved to `chat/`)

No other file changes. No new runtime dependencies — everything uses `fetch`, `fs/promises`, built-ins.

---

## Verification

1. `npx tsc --noEmit` — clean.
2. `npm run build` — green.
3. Intent-router path: `curl -X POST localhost:3000/api/chat -H 'content-type: application/json' -d '{"query":"current work","history":[]}'` streams a single `envelope` event then `done`.
4. LLM path: `curl … -d '{"query":"what did I write about retention","history":[]}'` streams `token` events, followed by `citation` events, then `done`. (Requires Ollama running with `llama3.2:3b` pulled.)
5. Empty vault: swap to a vault with zero `.md` files, fire the same LLM-path query — one `error` event with `code: "empty-vault"`.
6. Ollama stopped (`ollama stop`): first LLM-path query emits `{ type: "error", code: "ollama-down" }` and the client renders the "Ollama isn't running" row.
7. First-run index: `rm <vault>/.cipher/embeddings.json`, fire a query in the browser, observe `INDEXING VAULT · n/total` progress bar then streaming prose.
8. Citation pill click → opens the sheet at the cited path + heading anchor.
9. ⌘K palette's `Ask chat: "<query>"` fallback row routes to `/chat?q=<query>` and auto-fires. (This path exists from the palette overhaul — this spec preserves it.)
10. History: submit 3 Q&A turns, reload the tab, see all 3 render immediately from localStorage. Click Clear chat, page is empty again and localStorage is cleared.

---

## One-sentence summary

Add a streaming `/api/chat` backed by a local Ollama model and a hybrid (fuzzy shortlist → embedding rerank) retrieval pipeline over a lazily-built per-vault embedding index, routing deterministic intents to the existing `ViewRenderer` and everything else to cited LLM prose, and rewrite the 1072-line `ChatInterface` as a Linear-dense `QACard`-based surface with a fresh empty state.
