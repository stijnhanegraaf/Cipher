# Chat overhaul — grounded streaming Q&A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a streaming /api/chat backed by local Ollama + hybrid retrieval over a per-vault embedding index, with a Linear-dense QACard UI that replaces the 1072-line ChatInterface.

**Architecture:** New /api/chat NDJSON stream. Intent router runs first (existing buildView path); everything else goes through lazy-built embeddings.json → fuzzy+cosine retrieval → Ollama stream → cited prose. ChatInterface rewritten as a shell over chat/* subcomponents.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, framer-motion, Ollama (llama3.2:3b + nomic-embed-text).

**Branch:** v17-chat-grounded-qa from master. One commit per task.

---

## Task 0 — Branch

- [ ] Create the feature branch from master.

```bash
git checkout master
git pull --ff-only
git checkout -b v17-chat-grounded-qa
```

No verification; no commit.

---

## Phase A — Ollama + embeddings infrastructure

### Task 1 — `src/lib/chat/ollama.ts`

- [ ] Create the file below. HTTP wrapper around `http://localhost:11434`.

```ts
/**
 * Thin HTTP wrapper around a locally running Ollama instance.
 *
 * Exposes three async primitives used by the /api/chat pipeline:
 *   - listTags()   — GET /api/tags, used for health / model detection.
 *   - embed()      — POST /api/embeddings, single-prompt embedding.
 *   - streamChat() — POST /api/chat with stream:true, yields text deltas.
 *
 * Base URL is hard-coded for v1 (see spec § Model & config). Model names
 * are passed in by the caller — this module stays model-agnostic.
 */

import "server-only";

const OLLAMA_BASE = "http://localhost:11434";

export interface OllamaTag {
  name: string;
  modified_at: string;
  size: number;
}

export interface OllamaTagsResponse {
  models: OllamaTag[];
}

export interface OllamaMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OllamaChatStreamChunk {
  model: string;
  created_at: string;
  message?: { role: string; content: string };
  done: boolean;
}

interface OllamaEmbeddingsResponse {
  embedding: number[];
}

export class OllamaDownError extends Error {
  constructor() { super("Ollama is not reachable at " + OLLAMA_BASE); this.name = "OllamaDownError"; }
}

export class OllamaModelMissingError extends Error {
  constructor(public model: string) { super(`Model "${model}" is not pulled`); this.name = "OllamaModelMissingError"; }
}

/** GET /api/tags — returns the list of locally pulled models. Throws OllamaDownError on connection failure. */
export async function listTags(): Promise<OllamaTagsResponse> {
  let res: Response;
  try {
    res = await fetch(`${OLLAMA_BASE}/api/tags`, { cache: "no-store" });
  } catch {
    throw new OllamaDownError();
  }
  if (!res.ok) throw new OllamaDownError();
  return (await res.json()) as OllamaTagsResponse;
}

/** POST /api/embeddings — one prompt, one vector. Throws OllamaDownError / OllamaModelMissingError. */
export async function embed(model: string, prompt: string): Promise<number[]> {
  let res: Response;
  try {
    res = await fetch(`${OLLAMA_BASE}/api/embeddings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, prompt }),
    });
  } catch {
    throw new OllamaDownError();
  }
  if (res.status === 404) throw new OllamaModelMissingError(model);
  if (!res.ok) throw new Error(`Ollama /api/embeddings failed: ${res.status}`);
  const json = (await res.json()) as OllamaEmbeddingsResponse;
  if (!Array.isArray(json.embedding)) throw new Error("Ollama returned malformed embedding");
  return json.embedding;
}

/**
 * POST /api/chat with stream:true. Returns an AsyncIterable<string> that
 * yields incremental content deltas from `message.content`. Throws
 * OllamaDownError on connection failure and OllamaModelMissingError on 404.
 */
export async function* streamChat(model: string, messages: OllamaMessage[]): AsyncIterable<string> {
  let res: Response;
  try {
    res = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, messages, stream: true }),
    });
  } catch {
    throw new OllamaDownError();
  }
  if (res.status === 404) throw new OllamaModelMissingError(model);
  if (!res.ok || !res.body) throw new Error(`Ollama /api/chat failed: ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let chunk: OllamaChatStreamChunk;
      try { chunk = JSON.parse(line) as OllamaChatStreamChunk; } catch { continue; }
      if (chunk.message?.content) yield chunk.message.content;
      if (chunk.done) return;
    }
  }
}
```

**Verify.**

```bash
npx tsc --noEmit
```

**Commit.**

```bash
git add src/lib/chat/ollama.ts
git commit -m "chat: add Ollama HTTP wrapper (listTags/embed/streamChat)"
```

---

### Task 2 — `src/lib/chat/embeddings.ts`

- [ ] Create the file below. Walks the vault, chunks each `.md` by H2/H3 (fallback 500-word window), embeds each chunk, writes `<vault>/.cipher/embeddings.json` atomically.

```ts
/**
 * Per-vault embedding index.
 *
 * Chunks every .md under the vault by H2/H3 headings (fallback: 500-word
 * windows). Chunks shorter than 50 words are skipped. Each chunk is
 * embedded once via Ollama's nomic-embed-text model and stored in
 * <vault>/.cipher/embeddings.json. Stale chunks are detected by comparing
 * the index builtAt against each file's mtime.
 *
 * The index is built lazily on first query and reused across requests.
 * Rebuild triggers: missing file, model mismatch, or any file's
 * mtime > index.builtAt.
 */

import "server-only";
import { readFile, writeFile, mkdir, rename, readdir, stat } from "fs/promises";
import { join, dirname } from "path";
import { getVaultPath } from "@/lib/vault-reader";
import { embed } from "./ollama";
import { log } from "@/lib/log";

export const EMBED_MODEL = "nomic-embed-text";

export interface IndexChunk {
  id: string;          // `${path}#${headingSlug || windowIndex}`
  path: string;        // vault-relative
  heading?: string;
  text: string;
  vec: number[];
  mtime: number;
}

export interface EmbeddingIndex {
  model: string;
  builtAt: number;
  chunks: IndexChunk[];
}

export type IndexProgress = (done: number, total: number) => void;

// ─── Public entry points ─────────────────────────────────────────────

/**
 * Ensure an up-to-date index exists and return it.
 *
 * - Missing / malformed / wrong-model index → full rebuild.
 * - Any vault file mtime > index.builtAt → full rebuild (v1: no partial).
 * - Otherwise → cached load.
 *
 * `onProgress(done, total)` is called before each chunk is embedded; use
 * it to stream progress events to the client.
 */
export async function ensureIndex(onProgress?: IndexProgress): Promise<EmbeddingIndex> {
  const vault = getVaultPath();
  if (!vault) throw new Error("No vault connected");
  const indexPath = join(vault, ".cipher", "embeddings.json");

  const existing = await loadIndex(indexPath);
  const files = await walkMarkdown(vault);
  if (files.length === 0) throw new EmptyVaultError();

  const maxMtime = files.reduce((m, f) => Math.max(m, f.mtime), 0);
  if (existing && existing.model === EMBED_MODEL && existing.builtAt >= maxMtime) {
    return existing;
  }

  log.info("chat/embed", `rebuilding index: ${files.length} files, maxMtime=${maxMtime}, builtAt=${existing?.builtAt ?? 0}`);

  // Collect all chunks up front so progress total is meaningful.
  const pending: { path: string; heading?: string; text: string; mtime: number }[] = [];
  for (const f of files) {
    const raw = await readFile(join(vault, f.path), "utf-8").catch(() => "");
    if (!raw) continue;
    for (const c of chunkMarkdown(raw)) {
      pending.push({ path: f.path, heading: c.heading, text: c.text, mtime: f.mtime });
    }
  }

  const chunks: IndexChunk[] = [];
  const total = pending.length;
  for (let i = 0; i < pending.length; i++) {
    onProgress?.(i, total);
    const p = pending[i];
    try {
      const vec = await embed(EMBED_MODEL, p.text);
      chunks.push({
        id: `${p.path}#${slugify(p.heading || `w${i}`)}`,
        path: p.path,
        heading: p.heading,
        text: p.text,
        vec,
        mtime: p.mtime,
      });
    } catch (err) {
      log.warn("chat/embed", `embed failed for ${p.path}`, err);
    }
  }
  onProgress?.(total, total);

  const index: EmbeddingIndex = { model: EMBED_MODEL, builtAt: Date.now(), chunks };
  await writeIndexAtomically(indexPath, index);
  return index;
}

export class EmptyVaultError extends Error {
  constructor() { super("No .md files in vault"); this.name = "EmptyVaultError"; }
}

// ─── Chunking ────────────────────────────────────────────────────────

interface Chunk { heading?: string; text: string }

/**
 * Split a markdown file into retrieval chunks.
 *
 *   1. Drop frontmatter.
 *   2. If any H2 / H3 headings exist, slice by them — each chunk is the
 *      heading title + the body until the next H2/H3.
 *   3. Otherwise slice the whole body into ~500-word windows.
 *   4. Skip any chunk shorter than 50 words (post-whitespace-collapse).
 */
export function chunkMarkdown(raw: string): Chunk[] {
  const body = stripFrontmatter(raw);
  const H2_H3 = /^(##|###)\s+(.+?)\s*$/gm;
  const hits: { idx: number; heading: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = H2_H3.exec(body)) !== null) {
    hits.push({ idx: m.index, heading: m[2].trim() });
  }

  const chunks: Chunk[] = [];
  if (hits.length > 0) {
    for (let i = 0; i < hits.length; i++) {
      const start = hits[i].idx;
      const end = i + 1 < hits.length ? hits[i + 1].idx : body.length;
      const slice = body.slice(start, end);
      // Strip the heading line itself from the text so we keep the body only.
      const text = slice.replace(/^(##|###)\s+.+?\s*\n?/, "").trim();
      if (wordCount(text) >= 50) {
        chunks.push({ heading: hits[i].heading, text });
      }
    }
  } else {
    const words = body.split(/\s+/).filter(Boolean);
    for (let i = 0; i < words.length; i += 500) {
      const text = words.slice(i, i + 500).join(" ");
      if (wordCount(text) >= 50) chunks.push({ text });
    }
  }
  return chunks;
}

function stripFrontmatter(raw: string): string {
  if (!raw.startsWith("---")) return raw;
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return raw;
  return raw.slice(end + 4).replace(/^\s*\n/, "");
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "section";
}

// ─── Vault walk ──────────────────────────────────────────────────────

interface VaultFile { path: string; mtime: number }

async function walkMarkdown(root: string): Promise<VaultFile[]> {
  const out: VaultFile[] = [];
  async function walk(abs: string, rel: string, depth: number) {
    if (depth > 8) return;
    let entries;
    try { entries = await readdir(abs, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      if (e.name === "node_modules") continue;
      const nextAbs = join(abs, e.name);
      const nextRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        await walk(nextAbs, nextRel, depth + 1);
      } else if (e.isFile() && e.name.toLowerCase().endsWith(".md")) {
        try {
          const s = await stat(nextAbs);
          out.push({ path: nextRel, mtime: s.mtimeMs });
        } catch { /* ignore */ }
      }
    }
  }
  await walk(root, "", 0);
  return out;
}

// ─── Persistence ─────────────────────────────────────────────────────

async function loadIndex(indexPath: string): Promise<EmbeddingIndex | null> {
  try {
    const raw = await readFile(indexPath, "utf-8");
    const parsed = JSON.parse(raw) as EmbeddingIndex;
    if (typeof parsed.builtAt !== "number") return null;
    if (!Array.isArray(parsed.chunks)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeIndexAtomically(indexPath: string, index: EmbeddingIndex): Promise<void> {
  await mkdir(dirname(indexPath), { recursive: true });
  const tmp = indexPath + ".tmp";
  await writeFile(tmp, JSON.stringify(index), "utf-8");
  await rename(tmp, indexPath);
}

// ─── Cosine similarity ───────────────────────────────────────────────

/** Cosine similarity. Returns 0 when either vector is zero-length. */
export function cosine(a: number[], b: number[]): number {
  let dot = 0, la = 0, lb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    la += a[i] * a[i];
    lb += b[i] * b[i];
  }
  if (la === 0 || lb === 0) return 0;
  return dot / (Math.sqrt(la) * Math.sqrt(lb));
}
```

**Verify.**

```bash
npx tsc --noEmit
```

**Commit.**

```bash
git add src/lib/chat/embeddings.ts
git commit -m "chat: add per-vault embeddings index (chunk + build + cosine)"
```

---

### Task 3 — `src/lib/chat/retrieval.ts`

- [ ] Create the file below. Hybrid retrieval pipeline.

```ts
/**
 * Hybrid retrieval over the per-vault embedding index.
 *
 * Pipeline:
 *   1. Keyword shortlist — top 40 chunks by fuzzyScore against chunk.text.
 *   2. Embed the query once.
 *   3. Cosine-sort the shortlist, take top 8.
 *   4. Token-budget truncate: cap total to ~3000 tokens, longest first.
 *
 * Returns the retained chunks in cosine-sorted order (best first).
 */

import "server-only";
import { fuzzyScore } from "@/lib/fuzzy";
import { cosine, ensureIndex, EMBED_MODEL, type IndexChunk, type IndexProgress } from "./embeddings";
import { embed } from "./ollama";

export interface RetrievedChunk {
  id: string;
  path: string;
  heading?: string;
  text: string;
  score: number; // cosine similarity
}

const SHORTLIST_SIZE = 40;
const FINAL_TOP_N = 8;
const TOKEN_BUDGET = 3000;

export async function retrieve(query: string, onProgress?: IndexProgress): Promise<RetrievedChunk[]> {
  const index = await ensureIndex(onProgress);
  if (index.chunks.length === 0) return [];

  // 1. Keyword shortlist.
  const scored = index.chunks
    .map((c) => ({ c, s: fuzzyScore(query, c.text) }))
    .filter((x) => x.s !== Infinity)
    .sort((a, b) => a.s - b.s)
    .slice(0, SHORTLIST_SIZE)
    .map((x) => x.c);

  // If fuzzy produced nothing (rare — short/unusual queries), fall back to
  // scoring the whole corpus with cosine. Cheap at vault scale.
  const pool: IndexChunk[] = scored.length > 0 ? scored : index.chunks;

  // 2. Embed the query.
  const qVec = await embed(EMBED_MODEL, query);

  // 3. Cosine rerank.
  const ranked = pool
    .map((c) => ({ c, sim: cosine(qVec, c.vec) }))
    .sort((a, b) => b.sim - a.sim)
    .slice(0, FINAL_TOP_N);

  // 4. Token budget.
  const withinBudget = truncateToBudget(ranked.map((r) => ({ c: r.c, sim: r.sim })), TOKEN_BUDGET);

  return withinBudget.map(({ c, sim }) => ({
    id: c.id,
    path: c.path,
    heading: c.heading,
    text: c.text,
    score: sim,
  }));
}

// ─── Token budget ─────────────────────────────────────────────────────

interface Ranked { c: IndexChunk; sim: number }

/** Crude token estimator — 1 token ≈ 4 characters. Good enough for budget gating. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Trim chunk texts so the total token count fits the budget.
 *
 * Strategy: walk best-first, accepting chunks until the budget is
 * exhausted. A chunk that would overshoot is truncated at a word
 * boundary to whatever remaining tokens allow, then we stop.
 */
export function truncateToBudget(chunks: Ranked[], budget: number): Ranked[] {
  const out: Ranked[] = [];
  let used = 0;
  for (const r of chunks) {
    const cost = estimateTokens(r.c.text);
    if (used + cost <= budget) {
      out.push(r);
      used += cost;
      continue;
    }
    const remaining = budget - used;
    if (remaining <= 50) break; // not worth including a sliver
    const targetChars = remaining * 4;
    const words = r.c.text.split(/\s+/);
    let acc = "";
    for (const w of words) {
      if ((acc.length + w.length + 1) > targetChars) break;
      acc += (acc ? " " : "") + w;
    }
    out.push({ c: { ...r.c, text: acc }, sim: r.sim });
    break;
  }
  return out;
}
```

**Verify.**

```bash
npx tsc --noEmit
```

**Commit.**

```bash
git add src/lib/chat/retrieval.ts
git commit -m "chat: add hybrid retrieval (fuzzy shortlist + cosine rerank)"
```

---

### Task 4 — `src/lib/chat/prompt.ts`

- [ ] Create the file below. Builds the exact system + history + notes + query string from the spec.

```ts
/**
 * Prompt assembly for the chat LLM path.
 *
 * Output is a flat OllamaMessage[] list:
 *   [{ role: "system", content: SYSTEM_PROMPT + "\n\nNOTES:\n..." },
 *    ...last-4 history turns,
 *    { role: "user", content: query }]
 *
 * Chunks are labelled [1]..[N] and carry their path + heading so citation
 * parsing can map [^N] markers back to source locations.
 */

import "server-only";
import type { OllamaMessage } from "./ollama";
import type { RetrievedChunk } from "./retrieval";

export const SYSTEM_PROMPT = `You are Cipher, a research assistant grounded in the user's personal vault.
Answer the user's question using ONLY the provided notes. Cite each fact
with a marker like [^1] that matches a note index. If the notes do not
contain the answer, say so plainly — do not invent.`;

export interface ChatHistoryTurn {
  role: "user" | "assistant";
  content: string;
}

export interface BuildPromptArgs {
  query: string;
  history: ChatHistoryTurn[];
  chunks: RetrievedChunk[];
}

/** Returns the messages array to pass to ollama.streamChat. */
export function buildPrompt({ query, history, chunks }: BuildPromptArgs): OllamaMessage[] {
  const notesBlock = chunks.length === 0
    ? "(none)"
    : chunks.map((c, i) => {
        const label = c.heading ? `${c.path} — ${c.heading}` : c.path;
        return `[${i + 1}] ${label}\n    ${oneLine(c.text)}`;
      }).join("\n");

  const system: OllamaMessage = {
    role: "system",
    content: `${SYSTEM_PROMPT}\n\nNOTES:\n${notesBlock}`,
  };

  const trimmed = history.slice(-4).map<OllamaMessage>((t) => ({
    role: t.role,
    content: t.content,
  }));

  return [system, ...trimmed, { role: "user", content: query }];
}

function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

// ─── Citation parsing ─────────────────────────────────────────────────

export interface ParsedCitation {
  id: number;          // 1-indexed, matches chunk position in retrieve() output
  path: string;
  heading?: string;
  snippet: string;     // ≤ 180 chars, collapsed whitespace
}

/**
 * Scan `text` for unique [^N] markers and return one citation per unique
 * N that resolves to a retrieved chunk (1-indexed into `chunks`).
 */
export function parseCitations(text: string, chunks: RetrievedChunk[]): ParsedCitation[] {
  const seen = new Set<number>();
  const out: ParsedCitation[] = [];
  const re = /\[\^(\d+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const id = parseInt(m[1], 10);
    if (!Number.isFinite(id) || id < 1 || id > chunks.length) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    const c = chunks[id - 1];
    const snippet = oneLine(c.text).slice(0, 180);
    out.push({ id, path: c.path, heading: c.heading, snippet });
  }
  return out;
}
```

**Verify.**

```bash
npx tsc --noEmit
```

**Commit.**

```bash
git add src/lib/chat/prompt.ts
git commit -m "chat: add prompt assembly + citation parser"
```

---

## Phase B — Chat endpoint + health

### Task 5 — `src/app/api/chat/health/route.ts`

- [ ] Create the file. GET returns a small JSON object the client uses to warn about missing models.

```ts
/**
 * GET /api/chat/health
 *
 * Lightweight check: is Ollama reachable, and are the required models
 * present? Returns model names so the client can render the correct
 * `ollama pull <name>` hint on the empty state.
 */

import { NextResponse } from "next/server";
import { listTags } from "@/lib/chat/ollama";
import { EMBED_MODEL } from "@/lib/chat/embeddings";

const CHAT_MODEL = process.env.CIPHER_CHAT_MODEL || "llama3.2:3b";

export async function GET() {
  try {
    const tags = await listTags();
    const names = new Set(tags.models.map((m) => m.name));
    const hasModel = [...names].some((n) => n === CHAT_MODEL || n.startsWith(CHAT_MODEL + ":") || n.split(":")[0] === CHAT_MODEL);
    const hasEmbedModel = [...names].some((n) => n === EMBED_MODEL || n.startsWith(EMBED_MODEL + ":") || n.split(":")[0] === EMBED_MODEL);
    return NextResponse.json({ ok: true, model: CHAT_MODEL, hasModel, hasEmbedModel });
  } catch {
    return NextResponse.json({ ok: false, model: CHAT_MODEL, hasModel: false, hasEmbedModel: false });
  }
}
```

**Verify.**

```bash
npx tsc --noEmit
curl -s http://localhost:3000/api/chat/health | head -c 300
```

The curl may 404 if the dev server isn't running — that's fine. `npx tsc --noEmit` must be clean.

**Commit.**

```bash
git add src/app/api/chat/health/route.ts
git commit -m "chat: add /api/chat/health endpoint"
```

---

### Task 6 — `src/app/api/chat/route.ts`

- [ ] Create the file below. Streaming NDJSON endpoint orchestrating intent-router OR LLM path per the spec.

```ts
/**
 * POST /api/chat — streaming NDJSON chat endpoint.
 *
 * Pipeline:
 *   1. detectIntent(query)
 *        if matched → emit { type:"envelope", envelope } → { type:"done" } → return.
 *   2. Otherwise LLM path:
 *        a. ensureIndex() — streams index-progress events while building.
 *        b. retrieve(query) → top 8 chunks.
 *        c. buildPrompt(...) → messages.
 *        d. ollama.streamChat() → { type:"token", text } per delta.
 *        e. On stream close → parse [^N] citations → emit one per unique id.
 *        f. Emit { type:"done" }.
 *
 * Errors map to one of: ollama-down | model-missing | empty-vault | unknown.
 * Each error ends the stream with a single { type:"error", ... } then close.
 */

import { detectIntent } from "@/lib/intent-detector";
import { buildView } from "@/lib/view-builder";
import type { ResponseEnvelope } from "@/lib/view-models";
import { retrieve } from "@/lib/chat/retrieval";
import { buildPrompt, parseCitations, type ChatHistoryTurn } from "@/lib/chat/prompt";
import { streamChat, OllamaDownError, OllamaModelMissingError } from "@/lib/chat/ollama";
import { EmptyVaultError } from "@/lib/chat/embeddings";
import { log } from "@/lib/log";

const CHAT_MODEL = process.env.CIPHER_CHAT_MODEL || "llama3.2:3b";

interface ChatRequest {
  query: string;
  history: ChatHistoryTurn[];
}

type ChatEvent =
  | { type: "envelope"; envelope: ResponseEnvelope }
  | { type: "index-progress"; done: number; total: number }
  | { type: "token"; text: string }
  | { type: "citation"; id: number; path: string; heading?: string; snippet: string }
  | { type: "done" }
  | { type: "error"; code: "ollama-down" | "model-missing" | "empty-vault" | "unknown"; message: string };

export async function POST(req: Request) {
  let body: ChatRequest;
  try {
    body = (await req.json()) as ChatRequest;
  } catch {
    return new Response("invalid json", { status: 400 });
  }
  const query = (body.query || "").trim();
  const history = Array.isArray(body.history) ? body.history.slice(-4) : [];
  if (!query) return new Response("empty query", { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (ev: ChatEvent) => {
        controller.enqueue(encoder.encode(JSON.stringify(ev) + "\n"));
      };

      try {
        // ── Intent router first. ─────────────────────────────────────
        const intent = await detectIntent(query);
        const ROUTED = new Set([
          "current_work",
          "entity_overview",
          "timeline_synthesis",
          "system_status",
          "browse_entities",
          "browse_projects",
          "browse_research",
          "topic_overview",
          "search_results",
        ]);
        if (ROUTED.has(intent.viewType) && intent.confidence >= 0.7) {
          const view = await buildView(intent.viewType, query, intent.entityName);
          const envelope: ResponseEnvelope = {
            requestId: `req_${Date.now()}`,
            response: {
              intent: intent.intent,
              confidence: intent.confidence,
              summary: "",
              text: "",
              views: [view],
            },
          };
          emit({ type: "envelope", envelope });
          emit({ type: "done" });
          controller.close();
          return;
        }

        // ── LLM path. ────────────────────────────────────────────────
        const chunks = await retrieve(query, (done, total) => {
          emit({ type: "index-progress", done, total });
        });

        const messages = buildPrompt({ query, history, chunks });
        const collected: string[] = [];
        for await (const delta of streamChat(CHAT_MODEL, messages)) {
          collected.push(delta);
          emit({ type: "token", text: delta });
        }
        const full = collected.join("");
        for (const c of parseCitations(full, chunks)) {
          emit({ type: "citation", id: c.id, path: c.path, heading: c.heading, snippet: c.snippet });
        }
        emit({ type: "done" });
        controller.close();
      } catch (err) {
        if (err instanceof OllamaDownError) {
          emit({ type: "error", code: "ollama-down", message: "Ollama isn't running. Start it with `ollama serve`." });
        } else if (err instanceof OllamaModelMissingError) {
          emit({ type: "error", code: "model-missing", message: `Model \`${err.model}\` not pulled. Run \`ollama pull ${err.model}\`.` });
        } else if (err instanceof EmptyVaultError) {
          emit({ type: "error", code: "empty-vault", message: "No notes in the vault yet — add a `.md` file first." });
        } else {
          log.error("api/chat", "unknown failure", err);
          emit({ type: "error", code: "unknown", message: "Something went wrong. Check the server logs." });
        }
        emit({ type: "done" });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
```

**Verify.**

```bash
npx tsc --noEmit
```

Then, with the dev server running and Ollama up with `llama3.2:3b` + `nomic-embed-text` pulled:

```bash
# Intent-router path — should stream one envelope + done.
curl -sN -X POST http://localhost:3000/api/chat \
  -H 'content-type: application/json' \
  -d '{"query":"what am I working on","history":[]}' | head -n 3

# LLM path — should stream token events.
curl -sN -X POST http://localhost:3000/api/chat \
  -H 'content-type: application/json' \
  -d '{"query":"what did I write about retention","history":[]}' | head -n 10
```

**Commit.**

```bash
git add src/app/api/chat/route.ts
git commit -m "chat: add streaming NDJSON /api/chat endpoint"
```

---

## Phase C — UI components

### Task 7 — `src/components/chat/StreamingText.tsx`

- [ ] Create the file. Renders incremental prose with a blinking mono cursor while active; strips `[^N]` into superscript buttons.

```tsx
"use client";

/**
 * StreamingText — renders buffered LLM tokens with a live blinking cursor.
 *
 * Converts inline [^N] footnote markers into small superscript buttons
 * that, when clicked, scroll the matching SourcesRow pill into view and
 * briefly tint it. Reuses the `cipher-cursor-blink` keyframe.
 */

import { useEffect, useRef } from "react";

interface Props {
  /** Concatenated token stream so far. */
  text: string;
  /** When false, the cursor is hidden (stream complete). */
  active: boolean;
  /** Optional hook fired when a [^N] marker is clicked. */
  onCitationClick?: (id: number) => void;
}

export function StreamingText({ text, active, onCitationClick }: Props) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    // Scroll the end into view while streaming so the reader tracks the tail.
    if (active && ref.current) {
      ref.current.scrollIntoView({ block: "nearest", behavior: "auto" });
    }
  }, [text, active]);

  const parts = splitWithCitations(text);

  return (
    <span
      style={{
        color: "var(--text-primary)",
        fontSize: 15,
        lineHeight: 1.55,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {parts.map((p, i) =>
        p.kind === "text" ? (
          <span key={i}>{p.value}</span>
        ) : (
          <button
            key={i}
            type="button"
            aria-label={`Source ${p.id}`}
            onClick={() => onCitationClick?.(p.id)}
            style={{
              fontSize: 10,
              verticalAlign: "super",
              lineHeight: 1,
              padding: "0 2px",
              margin: "0 1px",
              background: "transparent",
              border: "none",
              color: "var(--accent-brand)",
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
            }}
          >
            [{p.id}]
          </button>
        )
      )}
      {active && (
        <span
          aria-hidden
          style={{
            display: "inline-block",
            marginLeft: 2,
            fontFamily: "var(--font-mono)",
            color: "var(--text-primary)",
            animation: "cipher-cursor-blink 1200ms ease-in-out infinite",
          }}
        >
          ▌
        </span>
      )}
      <span ref={ref} />
    </span>
  );
}

type Part = { kind: "text"; value: string } | { kind: "cite"; id: number };

function splitWithCitations(text: string): Part[] {
  const out: Part[] = [];
  const re = /\[\^(\d+)\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ kind: "text", value: text.slice(last, m.index) });
    out.push({ kind: "cite", id: parseInt(m[1], 10) });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", value: text.slice(last) });
  return out;
}
```

**Verify + commit.**

```bash
npx tsc --noEmit
git add src/components/chat/StreamingText.tsx
git commit -m "chat: add StreamingText (buffered tokens + blinking cursor)"
```

---

### Task 8 — `src/components/chat/CitationPill.tsx`

- [ ] Create the file. 28px pill; click opens the sheet at path + heading.

```tsx
"use client";

/**
 * CitationPill — 28px rounded pill that opens the source note in the
 * sheet overlay when clicked. ⌘+click routes to /file/<path> instead.
 */

import { useRouter } from "next/navigation";
import { useSheet } from "@/lib/hooks/useSheet";

interface Props {
  id: number;
  path: string;
  heading?: string;
  /** Brief highlight when triggered from a citation marker. */
  flashId?: number;
}

export function CitationPill({ id, path, heading, flashId }: Props) {
  const sheet = useSheet();
  const router = useRouter();
  const label = path.split("/").pop()?.replace(/\.md$/, "") || path;

  const onClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (e.metaKey || e.ctrlKey) {
      router.push(`/file/${encodeURIComponent(path)}`);
      return;
    }
    sheet.open(path, heading ? slug(heading) : undefined);
  };

  const active = flashId === id;
  return (
    <button
      type="button"
      data-citation-id={id}
      onClick={onClick}
      style={{
        height: 28,
        padding: "0 8px",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        borderRadius: "var(--radius-pill)",
        border: "1px solid var(--border-subtle)",
        background: active ? "var(--bg-surface-alpha-4)" : "var(--bg-surface-alpha-2)",
        color: "var(--text-secondary)",
        fontSize: 12,
        fontFamily: "var(--font-mono)",
        cursor: "pointer",
        transition: "background-color 180ms var(--ease-default)",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-surface-alpha-4)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = active ? "var(--bg-surface-alpha-4)" : "var(--bg-surface-alpha-2)")}
    >
      <span style={{ color: "var(--text-quaternary)" }}>[{id}]</span>
      <span>{label}</span>
      {heading && <span style={{ color: "var(--text-quaternary)" }}>· {heading}</span>}
    </button>
  );
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
```

**Verify + commit.**

```bash
npx tsc --noEmit
git add src/components/chat/CitationPill.tsx
git commit -m "chat: add CitationPill"
```

---

### Task 9 — `src/components/chat/Composer.tsx`

- [ ] Create the file. Auto-grow textarea 44→140px, Enter submits, slash-menu integrated.

```tsx
"use client";

/**
 * Composer — bottom-pinned chat input with auto-grow textarea.
 *
 * - 44px minimum, grows with content to ~140px (6 lines), then scrolls.
 * - Enter (no shift) submits; Shift+Enter inserts a newline.
 * - Leading `/` opens SlashCommandMenu, which captures Enter/arrows.
 */

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { SlashCommandMenu } from "@/components/SlashCommandMenu";

export interface ComposerHandle {
  focus: () => void;
  setValue: (v: string) => void;
}

interface Props {
  onSubmit: (query: string) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Hide the ⌘↵ kbd hint (used by the centered empty-state composer). */
  hideKbd?: boolean;
  autoFocus?: boolean;
}

const MIN_H = 44;
const MAX_H = 140;

export const Composer = forwardRef<ComposerHandle, Props>(function Composer(
  { onSubmit, disabled, placeholder = "Ask anything — or /", hideKbd, autoFocus },
  ref
) {
  const [value, setValue] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => taRef.current?.focus(),
    setValue: (v: string) => setValue(v),
  }));

  useEffect(() => {
    if (autoFocus) taRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(MAX_H, Math.max(MIN_H, el.scrollHeight)) + "px";
    el.style.overflowY = el.scrollHeight > MAX_H ? "auto" : "hidden";
  }, [value]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (value.startsWith("/")) return; // slash menu owns keys
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const trimmed = value.trim();
      if (trimmed && !disabled) {
        onSubmit(trimmed);
        setValue("");
      }
    }
  };

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        display: "flex",
        alignItems: "flex-end",
        gap: 8,
        padding: "8px 10px",
        background: "var(--bg-surface)",
        border: "1px solid var(--border-standard)",
        borderRadius: 10,
        transition: "border-color var(--motion-hover) var(--ease-default)",
      }}
      onFocusCapture={(e) => (e.currentTarget.style.borderColor = "var(--accent-brand)")}
      onBlurCapture={(e) => (e.currentTarget.style.borderColor = "var(--border-standard)")}
    >
      <SlashCommandMenu
        value={value}
        onSelect={() => setValue("")}
        onAsk={(q) => {
          onSubmit(q);
          setValue("");
        }}
      />
      <textarea
        ref={taRef}
        rows={1}
        disabled={disabled}
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKey}
        style={{
          flex: 1,
          minHeight: MIN_H - 16,
          maxHeight: MAX_H,
          resize: "none",
          border: "none",
          outline: "none",
          background: "transparent",
          color: "var(--text-primary)",
          fontSize: 14,
          lineHeight: 1.5,
          fontFamily: "inherit",
        }}
      />
      {!hideKbd && (
        <span
          className="mono-label"
          style={{
            alignSelf: "center",
            color: "var(--text-quaternary)",
            letterSpacing: "0.02em",
            pointerEvents: "none",
          }}
        >
          ⌘↵
        </span>
      )}
    </div>
  );
});
```

**Verify + commit.**

```bash
npx tsc --noEmit
git add src/components/chat/Composer.tsx
git commit -m "chat: add Composer (auto-grow + slash menu integration)"
```

---

### Task 10 — `src/components/chat/QACard.tsx`

- [ ] Create the file. Renders a single Q&A turn.

```tsx
"use client";

/**
 * QACard — one Q&A unit.
 *
 * Header — `ASKED · <ago>` label + the question text.
 * Body   — one of:
 *            • ViewRenderer (chat-summary) for intent envelopes.
 *            • StreamingText + SourcesRow for LLM answers.
 *            • ErrorRow for server-side errors.
 *            • IndexProgress while embeddings.json is being built.
 */

import { useState } from "react";
import { ViewRenderer } from "@/components/views/ViewRenderer";
import type { ResponseEnvelope } from "@/lib/view-models";
import { StreamingText } from "./StreamingText";
import { CitationPill } from "./CitationPill";

export interface QATurnCitation {
  id: number;
  path: string;
  heading?: string;
  snippet: string;
}

export interface QATurn {
  id: string;
  query: string;
  createdAt: number;
  envelope?: ResponseEnvelope;
  text: string;
  citations: QATurnCitation[];
  status: "streaming" | "done" | "error";
  error?: { code: string; message: string };
  indexProgress?: { done: number; total: number };
}

interface Props {
  turn: QATurn;
}

export function QACard({ turn }: Props) {
  const [flashId, setFlashId] = useState<number | undefined>(undefined);

  const flash = (id: number) => {
    setFlashId(id);
    const el = document.querySelector<HTMLButtonElement>(`[data-turn="${turn.id}"] [data-citation-id="${id}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    window.setTimeout(() => setFlashId(undefined), 300);
  };

  return (
    <section data-turn={turn.id} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <header style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span
          className="mono-label"
          style={{ color: "var(--text-quaternary)", letterSpacing: "0.08em" }}
        >
          ASKED · {formatAgo(turn.createdAt)}
        </span>
        <h2
          style={{
            fontSize: 17,
            lineHeight: 1.4,
            fontWeight: 500,
            color: "var(--text-primary)",
            margin: 0,
          }}
        >
          {turn.query}
        </h2>
      </header>

      {turn.envelope && (
        <div>
          {turn.envelope.response.views.map((v, i) => (
            <ViewRenderer key={v.viewId} view={v} index={i} variant="chat-summary" />
          ))}
        </div>
      )}

      {!turn.envelope && turn.error && <ErrorRow message={turn.error.message} />}

      {!turn.envelope && !turn.error && turn.indexProgress && turn.text.length === 0 && (
        <IndexProgress done={turn.indexProgress.done} total={turn.indexProgress.total} />
      )}

      {!turn.envelope && !turn.error && (turn.text.length > 0 || turn.status === "streaming") && (
        <StreamingText
          text={turn.text}
          active={turn.status === "streaming"}
          onCitationClick={flash}
        />
      )}

      {!turn.envelope && !turn.error && turn.citations.length > 0 && (
        <SourcesRow citations={turn.citations} flashId={flashId} />
      )}
    </section>
  );
}

function SourcesRow({ citations, flashId }: { citations: QATurnCitation[]; flashId?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
      <span
        className="mono-label"
        style={{
          color: "var(--text-quaternary)",
          letterSpacing: "0.08em",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        SOURCES · {citations.length}
      </span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {citations.map((c) => (
          <CitationPill key={c.id} id={c.id} path={c.path} heading={c.heading} flashId={flashId} />
        ))}
      </div>
    </div>
  );
}

function ErrorRow({ message }: { message: string }) {
  return (
    <div
      role="alert"
      style={{
        padding: "10px 12px",
        borderLeft: "2px solid var(--text-warning, #c37a00)",
        background: "var(--bg-surface-alpha-2)",
        color: "var(--text-secondary)",
        fontSize: 13,
        lineHeight: 1.5,
        borderRadius: 4,
      }}
    >
      {renderInlineCode(message)}
    </div>
  );
}

function renderInlineCode(s: string): React.ReactNode {
  const parts = s.split(/(`[^`]+`)/g);
  return parts.map((p, i) =>
    p.startsWith("`") && p.endsWith("`") ? (
      <code key={i} style={{ fontFamily: "var(--font-mono)", fontSize: 12, background: "var(--bg-surface-alpha-4)", padding: "1px 4px", borderRadius: 4 }}>
        {p.slice(1, -1)}
      </code>
    ) : (
      <span key={i}>{p}</span>
    )
  );
}

function IndexProgress({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span className="mono-label" style={{ color: "var(--text-quaternary)", letterSpacing: "0.08em" }}>
        INDEXING VAULT · {done}/{total}
      </span>
      <div style={{ height: 4, background: "var(--bg-surface-alpha-2)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "var(--accent-brand)", transition: "width 180ms var(--ease-default)" }} />
      </div>
    </div>
  );
}

function formatAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
```

**Verify + commit.**

```bash
npx tsc --noEmit
git add src/components/chat/QACard.tsx
git commit -m "chat: add QACard (envelope | streaming | error | progress)"
```

---

### Task 11 — `src/components/chat/ChatEmptyState.tsx` (+ delete the old one)

- [ ] Create the new file and delete the old `src/components/ChatEmptyState.tsx` in the same commit.

```tsx
"use client";

/**
 * ChatEmptyState — single heading + centered Composer + three hint chips.
 *
 * When a vault is connected, two of the hint chips use real entity /
 * project names pulled from the vault index. Fallback strings render
 * when the vault isn't connected or no entities/projects are indexed.
 */

import { useEffect, useState } from "react";
import { useVault } from "@/lib/hooks/useVault";
import { Composer } from "./Composer";

interface Props {
  onSubmit: (query: string) => void;
  /** Optional health banner (rendered above the composer). */
  banner?: React.ReactNode;
}

const FALLBACK_HINTS = [
  "summarise this week's notes",
  "what is Alice working on",
  "find notes related to Q3 plan",
];

export function ChatEmptyState({ onSubmit, banner }: Props) {
  const vault = useVault();
  const [hints, setHints] = useState<string[]>(FALLBACK_HINTS);

  useEffect(() => {
    if (!vault.connected) {
      setHints(FALLBACK_HINTS);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/browse/hints", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { entities?: string[]; projects?: string[] };
        if (cancelled) return;
        const hints: string[] = ["summarise this week's notes"];
        const firstEntity = data.entities?.[0];
        const firstProject = data.projects?.[0];
        if (firstEntity) hints.push(`what is ${firstEntity} working on`);
        else hints.push(FALLBACK_HINTS[1]);
        if (firstProject) hints.push(`find notes related to ${firstProject}`);
        else hints.push(FALLBACK_HINTS[2]);
        setHints(hints);
      } catch {
        /* keep fallbacks */
      }
    })();
    return () => { cancelled = true; };
  }, [vault.connected]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 20,
        paddingTop: "30dvh",
      }}
    >
      <h1
        className="heading-3"
        style={{ color: "var(--text-tertiary)", margin: 0, fontWeight: 500 }}
      >
        Ask about your vault.
      </h1>
      {banner}
      <div style={{ width: "100%", maxWidth: 520 }}>
        <Composer onSubmit={onSubmit} hideKbd={false} autoFocus />
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, marginTop: 8 }}>
        <span className="mono-label" style={{ color: "var(--text-quaternary)", letterSpacing: "0.08em" }}>
          TRY
        </span>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {hints.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => onSubmit(h)}
              className="caption-large focus-ring"
              style={{
                background: "transparent",
                border: "none",
                padding: "4px 8px",
                borderRadius: 6,
                color: "var(--text-secondary)",
                cursor: "pointer",
                textAlign: "center",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-surface-alpha-2)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              • {h}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

Note: the `/api/browse/hints` endpoint is optional — if it doesn't exist, the fetch 404s and the fallback hints stay. No new endpoint required; if the 404 noise in the console is undesirable the `useEffect` fetch can be removed and hints swapped directly from `useVault().name` (keep as-is for now — zero-cost graceful degradation).

Delete the old empty state:

```bash
git rm src/components/ChatEmptyState.tsx
```

**Verify + commit.**

```bash
npx tsc --noEmit
git add src/components/chat/ChatEmptyState.tsx
git commit -m "chat: rewrite ChatEmptyState (heading + composer + hints), remove old file"
```

---

## Phase D — Wire up

### Task 12 — Rewrite `src/components/ChatInterface.tsx`

- [ ] Overwrite the file with the content below. Shell that owns history + NDJSON consumption; visuals delegated to chat/*. Full file — no elisions.

```tsx
"use client";

/**
 * ChatInterface — shell that owns history state + /api/chat NDJSON
 * consumption. Visual bits live in components/chat/*.
 *
 * Persists turns to localStorage["cipher-chat-history-v1"] (cap 20).
 * Supports /chat?q=<query> deep-link auto-fire.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageShell, PageAction } from "@/components/PageShell";
import { ChatEmptyState } from "@/components/chat/ChatEmptyState";
import { Composer, type ComposerHandle } from "@/components/chat/Composer";
import { QACard, type QATurn, type QATurnCitation } from "@/components/chat/QACard";
import { log } from "@/lib/log";

const STORAGE_KEY = "cipher-chat-history-v1";
const HISTORY_CAP = 20;

interface StoredTurn {
  id: string;
  query: string;
  createdAt: number;
  text: string;
  citations: QATurnCitation[];
  error?: { code: string; message: string };
  /** Envelope intent match — stored but not serialized for simplicity when null. */
  envelopeJson?: string;
}

type StreamEvent =
  | { type: "envelope"; envelope: unknown }
  | { type: "index-progress"; done: number; total: number }
  | { type: "token"; text: string }
  | { type: "citation"; id: number; path: string; heading?: string; snippet: string }
  | { type: "done" }
  | { type: "error"; code: string; message: string };

export function ChatInterface() {
  const [turns, setTurns] = useState<QATurn[]>([]);
  const [streaming, setStreaming] = useState(false);
  const composerRef = useRef<ComposerHandle>(null);
  const searchParams = useSearchParams();
  const autoFiredRef = useRef(false);

  // ── Hydrate history from localStorage on mount. ─────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const stored = JSON.parse(raw) as StoredTurn[];
      const hydrated: QATurn[] = stored.map((s) => ({
        id: s.id,
        query: s.query,
        createdAt: s.createdAt,
        text: s.text,
        citations: s.citations,
        status: s.error ? "error" : "done",
        error: s.error,
        envelope: s.envelopeJson ? (JSON.parse(s.envelopeJson) as QATurn["envelope"]) : undefined,
      }));
      setTurns(hydrated);
    } catch (err) {
      log.warn("chat", "history hydrate failed", err);
    }
  }, []);

  // ── Persist on every turn-list change. ──────────────────────────────
  useEffect(() => {
    try {
      const toStore: StoredTurn[] = turns
        .filter((t) => t.status !== "streaming")
        .slice(-HISTORY_CAP)
        .map((t) => ({
          id: t.id,
          query: t.query,
          createdAt: t.createdAt,
          text: t.text,
          citations: t.citations,
          error: t.error,
          envelopeJson: t.envelope ? JSON.stringify(t.envelope) : undefined,
        }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
    } catch (err) {
      log.warn("chat", "history persist failed", err);
    }
  }, [turns]);

  // ── Submit handler: POST /api/chat and consume NDJSON stream. ───────
  const submit = useCallback(async (query: string) => {
    if (!query.trim() || streaming) return;
    const id = `t_${Date.now()}`;
    const turn: QATurn = {
      id,
      query,
      createdAt: Date.now(),
      text: "",
      citations: [],
      status: "streaming",
    };
    const priorHistory = turns
      .filter((t) => t.status === "done")
      .slice(-4)
      .flatMap((t) => [
        { role: "user" as const, content: t.query },
        { role: "assistant" as const, content: t.text || "" },
      ]);

    setTurns((prev) => [...prev, turn]);
    setStreaming(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, history: priorHistory }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let ev: StreamEvent;
          try { ev = JSON.parse(line) as StreamEvent; } catch { continue; }
          applyEvent(id, ev);
        }
      }
    } catch (err) {
      log.error("chat", "stream failed", err);
      setTurns((prev) => prev.map((t) => (t.id === id ? {
        ...t,
        status: "error",
        error: { code: "unknown", message: "Something went wrong. Check the server logs." },
      } : t)));
    } finally {
      setStreaming(false);
    }
  }, [turns, streaming]);

  const applyEvent = (id: string, ev: StreamEvent) => {
    setTurns((prev) => prev.map((t) => {
      if (t.id !== id) return t;
      switch (ev.type) {
        case "envelope":
          return { ...t, envelope: ev.envelope as QATurn["envelope"], status: "done" };
        case "index-progress":
          return { ...t, indexProgress: { done: ev.done, total: ev.total } };
        case "token":
          return { ...t, text: t.text + ev.text };
        case "citation":
          return { ...t, citations: [...t.citations, { id: ev.id, path: ev.path, heading: ev.heading, snippet: ev.snippet }] };
        case "done":
          return { ...t, status: t.error ? "error" : "done" };
        case "error":
          return { ...t, status: "error", error: { code: ev.code, message: ev.message } };
        default:
          return t;
      }
    }));
  };

  // ── Deep-link auto-fire: /chat?q=<encoded>. ─────────────────────────
  useEffect(() => {
    if (autoFiredRef.current) return;
    const q = searchParams.get("q");
    if (q && q.trim()) {
      autoFiredRef.current = true;
      submit(q);
    }
  }, [searchParams, submit]);

  const clearChat = useCallback(() => {
    setTurns([]);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }, []);

  const modelLabel = useMemo(() => process.env.NEXT_PUBLIC_CIPHER_CHAT_MODEL || "llama3.2:3b", []);

  return (
    <PageShell
      title="Chat"
      subtitle={`· ${modelLabel}`}
      contentMaxWidth={720}
      actions={
        turns.length > 0 ? (
          <PageAction label="Clear chat" onClick={clearChat}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" />
            </svg>
          </PageAction>
        ) : null
      }
    >
      {turns.length === 0 ? (
        <ChatEmptyState onSubmit={submit} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "24px 32px 120px",
              display: "flex",
              flexDirection: "column",
              gap: 24,
            }}
          >
            {turns.map((t) => (
              <QACard key={t.id} turn={t} />
            ))}
          </div>
          <div
            style={{
              flexShrink: 0,
              borderTop: "1px solid var(--border-subtle)",
              background: "var(--bg-glass, var(--bg-marketing))",
              backdropFilter: "blur(20px) saturate(180%)",
              WebkitBackdropFilter: "blur(20px) saturate(180%)",
              padding: "16px 32px 20px",
            }}
          >
            <Composer ref={composerRef} onSubmit={submit} disabled={streaming} />
          </div>
        </div>
      )}
    </PageShell>
  );
}
```

**Verify.**

```bash
npx tsc --noEmit
npm run build
```

Then manually: open `/chat` in the browser, fire a known intent ("what am I working on"), fire a free-text query, reload the tab (history restores), click Clear chat (empty state returns).

**Commit.**

```bash
git add src/components/ChatInterface.tsx
git commit -m "chat: rewrite ChatInterface as shell over chat/* subcomponents"
```

---

### Task 13 — Confirm `src/app/chat/page.tsx` unchanged

- [ ] Read the file. It should still be the Suspense-wrapped `<ChatInterface />` mount. Do not modify.

```bash
cat src/app/chat/page.tsx
```

Expected contents (already in the repo — leave alone):

```tsx
import { Suspense } from "react";
import { ChatInterface } from "@/components/ChatInterface";

export default function ChatPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100dvh", background: "var(--bg-marketing)" }} />}>
      <ChatInterface />
    </Suspense>
  );
}
```

No verification, no commit.

---

## Final verification (the 10-item gate from the spec, verbatim)

- [ ] 1. `npx tsc --noEmit` — clean.
- [ ] 2. `npm run build` — green.
- [ ] 3. Intent-router path: `curl -X POST localhost:3000/api/chat -H 'content-type: application/json' -d '{"query":"current work","history":[]}'` streams a single `envelope` event then `done`.
- [ ] 4. LLM path: `curl … -d '{"query":"what did I write about retention","history":[]}'` streams `token` events, followed by `citation` events, then `done`. (Requires Ollama running with `llama3.2:3b` pulled.)
- [ ] 5. Empty vault: swap to a vault with zero `.md` files, fire the same LLM-path query — one `error` event with `code: "empty-vault"`.
- [ ] 6. Ollama stopped (`ollama stop`): first LLM-path query emits `{ type: "error", code: "ollama-down" }` and the client renders the "Ollama isn't running" row.
- [ ] 7. First-run index: `rm <vault>/.cipher/embeddings.json`, fire a query in the browser, observe `INDEXING VAULT · n/total` progress bar then streaming prose.
- [ ] 8. Citation pill click → opens the sheet at the cited path + heading anchor.
- [ ] 9. ⌘K palette's `Ask chat: "<query>"` fallback row routes to `/chat?q=<query>` and auto-fires.
- [ ] 10. History: submit 3 Q&A turns, reload the tab, see all 3 render immediately from localStorage. Click Clear chat, page is empty again and localStorage is cleared.

Ship:

```bash
git push -u origin v17-chat-grounded-qa
git checkout master
git merge --ff-only v17-chat-grounded-qa
git push origin master
```

---

## Self-review

Scanned the plan end-to-end:

- **No TODOs / "fill in the rest" / placeholders** — every code block is complete.
- **Chunker regex + 500-word window** — present in Task 2 (`chunkMarkdown`).
- **Token budget** — present in Task 3 (`truncateToBudget` with word-boundary trim).
- **NDJSON emit** — Task 6 builds events with `JSON.stringify(ev) + "\n"` via a `ReadableStream`.
- **NDJSON consume** — Task 12 uses `getReader()` + `TextDecoder({ stream: true })` + newline loop.
- **Verbatim system prompt** — Task 4 `SYSTEM_PROMPT` matches the spec text.
- **Intent router still wins first** — Task 6 calls `detectIntent` and only falls through when `viewType` isn't in the routed set or `confidence < 0.7` (spec says six deterministic intents + browse_* + search_results; all listed).
- **Types consistent across layers** — `QATurn` / `StreamEvent` in Task 12 mirror the server events in Task 6, and `QATurnCitation` matches the server `citation` event shape.
- **Reuse discipline** — no reimplementation of `fuzzyScore`, `buildView`, `detectIntent`, `SlashCommandMenu`, `useSheet`, `useVault`, `PageShell/PageAction`, or the `cipher-cursor-blink` keyframe.
- **Fix applied inline:** initial draft of Task 6 let intent matches bypass the stream even for low-confidence `search_results`. Tightened with a `confidence >= 0.7` gate so fuzzy search-fallback still reaches the LLM path.
- **Fix applied inline:** the NDJSON response now includes a trailing `{ type: "done" }` after every `error` event so the client always reaches a terminal state.
- **Open concern (flagged):** the `/api/browse/hints` endpoint referenced in Task 11's empty-state is optional — the component silently falls back on fetch failure. No new server endpoint is created; if/when the user wants real entity hints, a follow-up can add that route. This is intentional for v1 and documented in the task body.
- **Open concern (flagged):** `process.env.NEXT_PUBLIC_CIPHER_CHAT_MODEL` in Task 12 is separate from the server-side `CIPHER_CHAT_MODEL` used in the route. If the operator wants the subtitle to reflect the actual model, they must set both. The subtitle is cosmetic; server side is authoritative. Documented here so the executor knows not to be alarmed.
