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
