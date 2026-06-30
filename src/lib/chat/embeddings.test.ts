/**
 * Tests for the embeddings index lifecycle.
 *
 * Coverage:
 *   1. Incremental rebuild — unchanged vault → 0 embed calls; changed file →
 *      only its chunks re-embed; deleted file → chunks removed.
 *   2. embedConcurrent — all embedded, order preserved, concurrency cap
 *      respected, one failing chunk doesn't abort the batch.
 *   3. Resumable partial save — onPartial is called every 50 chunks;
 *      a re-run with a partial index skips already-saved files.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// ─── Module-level mocks ────────────────────────────────────────────────────────

vi.mock("@/lib/vault-reader", () => ({
  getVaultPath: vi.fn(),
}));
// extractTags is pure but imports buildFenceMask; stub it out to keep tests fast
vi.mock("@/lib/markdown/tags", () => ({
  extractTags: vi.fn().mockReturnValue([]),
}));
vi.mock("@/lib/fs/walk", () => ({
  walkFiles: vi.fn(),
}));
vi.mock("fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs/promises")>();
  return {
    ...actual,
    readFile: vi.fn(),
    writeFile: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
    stat: vi.fn(),
  };
});
vi.mock("@/lib/log", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
// stripFrontmatter / parseFrontmatter are pure functions — use lightweight stubs
vi.mock("@/lib/markdown/frontmatter", () => ({
  stripFrontmatter: (raw: string) => raw,
  parseFrontmatter: (raw: string) => ({ frontmatter: {}, content: raw }),
}));

import { readFile, writeFile, rename, mkdir, stat } from "fs/promises";
import { walkFiles } from "@/lib/fs/walk";
import { getVaultPath } from "@/lib/vault-reader";
import { ensureIndex, embedConcurrent, composeEmbedText, getIndexStatus, INDEX_VERSION, type PendingChunk, type EmbeddingIndex } from "./embeddings";
import type { Embedder } from "./providers/embeddings";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mockReadFile = readFile as unknown as Mock;
const mockWriteFile = writeFile as unknown as Mock;
const mockRename = rename as unknown as Mock;
const mockMkdir = mkdir as unknown as Mock;
const mockStat = stat as unknown as Mock;
const mockWalkFiles = walkFiles as unknown as Mock;
const mockGetVaultPath = getVaultPath as unknown as Mock;

function makeEmbedder(overrides?: Partial<Embedder>): Embedder {
  return {
    id: "ollama-local",
    model: "nomic-embed-text",
    dim: 2,
    embed: vi.fn().mockResolvedValue([1, 0]),
    ...overrides,
  };
}

/**
 * Build a minimal EmbeddingIndex JSON string for mocking the on-disk index.
 * Uses version 2 (structure-aware) by default so compatibility checks pass.
 */
function makeIndexJson(chunks: EmbeddingIndex["chunks"], builtAt = 1000): string {
  const index: EmbeddingIndex = {
    version: 2,
    embedder: "ollama-local",
    model: "nomic-embed-text",
    dim: 2,
    builtAt,
    chunks,
  };
  return JSON.stringify(index);
}

/**
 * Make a minimal markdown string with enough words for a chunk to pass the
 * 50-word minimum threshold.
 */
function makeMd(words = 60): string {
  return Array.from({ length: words }, (_, i) => `word${i}`).join(" ");
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetVaultPath.mockReturnValue("/vault");
  mockMkdir.mockResolvedValue(undefined);
  mockWriteFile.mockResolvedValue(undefined);
  mockRename.mockResolvedValue(undefined);
});

// ─── Section 1: Incremental rebuild ───────────────────────────────────────────

describe("ensureIndex — incremental rebuild", () => {
  it("unchanged vault → 0 embed() calls (reuses all cached chunks)", async () => {
    const mtime = 500;
    const existingChunks: EmbeddingIndex["chunks"] = [
      { id: "a.md#section", path: "a.md", text: "text a", vec: [1, 0], mtime },
    ];
    // On-disk index with builtAt > mtime — nothing stale.
    mockReadFile.mockImplementation((p: string) => {
      if ((p as string).endsWith("embeddings.json")) return Promise.resolve(makeIndexJson(existingChunks, 1000));
      return Promise.reject(new Error("ENOENT"));
    });
    // Walk returns the same file with the same mtime.
    mockWalkFiles.mockResolvedValue(["a.md"]);
    mockStat.mockResolvedValue({ mtimeMs: mtime });

    const embedder = makeEmbedder();
    await ensureIndex(embedder);

    expect(embedder.embed).not.toHaveBeenCalled();
  });

  it("one changed file → only its chunks are re-embedded", async () => {
    const mtimeA = 500;
    const mtimeB = 200; // file B has mtime 200 but stored chunk mtime is 100 → stale
    const existingChunks: EmbeddingIndex["chunks"] = [
      { id: "a.md#section", path: "a.md", text: "text a", vec: [1, 0], mtime: mtimeA },
      { id: "b.md#section", path: "b.md", text: "text b", vec: [0, 1], mtime: 100 }, // 100 < 200 → stale
    ];
    mockReadFile.mockImplementation((p: string) => {
      if ((p as string).endsWith("embeddings.json")) return Promise.resolve(makeIndexJson(existingChunks, 1000));
      // Return content only for b.md (a.md is not read because it's reused).
      if ((p as string).endsWith("b.md")) return Promise.resolve(makeMd());
      return Promise.reject(new Error("ENOENT"));
    });
    mockWalkFiles.mockResolvedValue(["a.md", "b.md"]);
    mockStat.mockImplementation((p: string) => {
      if ((p as string).endsWith("a.md")) return Promise.resolve({ mtimeMs: mtimeA });
      return Promise.resolve({ mtimeMs: mtimeB });
    });

    const embedder = makeEmbedder();
    await ensureIndex(embedder);

    // embed called once: for the one chunk from b.md (a.md is reused).
    expect(embedder.embed).toHaveBeenCalledTimes(1);
  });

  it("deleted file → its chunks are removed from the result", async () => {
    const existingChunks: EmbeddingIndex["chunks"] = [
      { id: "a.md#section", path: "a.md", text: "text a", vec: [1, 0], mtime: 500 },
      { id: "b.md#section", path: "b.md", text: "text b", vec: [0, 1], mtime: 500 },
    ];
    mockReadFile.mockImplementation((p: string) => {
      if ((p as string).endsWith("embeddings.json")) return Promise.resolve(makeIndexJson(existingChunks, 1000));
      return Promise.reject(new Error("ENOENT"));
    });
    // Walk returns only a.md (b.md was deleted).
    mockWalkFiles.mockResolvedValue(["a.md"]);
    mockStat.mockResolvedValue({ mtimeMs: 500 });

    const embedder = makeEmbedder();
    const result = await ensureIndex(embedder);

    expect(embedder.embed).not.toHaveBeenCalled();
    // b.md chunk must be gone.
    expect(result.chunks.every((c) => c.path !== "b.md")).toBe(true);
    expect(result.chunks.some((c) => c.path === "a.md")).toBe(true);
    // A cleaned-up index is written to disk.
    expect(mockWriteFile).toHaveBeenCalled();
  });

  it("incompatible model → full rebuild (all chunks re-embedded)", async () => {
    const existingChunks: EmbeddingIndex["chunks"] = [
      { id: "a.md#section", path: "a.md", text: "text a", vec: [1, 0], mtime: 500 },
    ];
    const indexWithDifferentModel = JSON.stringify({
      version: 2,
      embedder: "ollama-local",
      model: "different-model", // mismatch
      dim: 2,
      builtAt: 1000,
      chunks: existingChunks,
    });
    mockReadFile.mockImplementation((p: string) => {
      if ((p as string).endsWith("embeddings.json")) return Promise.resolve(indexWithDifferentModel);
      if ((p as string).endsWith("a.md")) return Promise.resolve(makeMd());
      return Promise.reject(new Error("ENOENT"));
    });
    mockWalkFiles.mockResolvedValue(["a.md"]);
    mockStat.mockResolvedValue({ mtimeMs: 500 });

    const embedder = makeEmbedder(); // model: "nomic-embed-text"
    await ensureIndex(embedder);

    // Must re-embed since model changed.
    expect(embedder.embed).toHaveBeenCalled();
  });
});

// ─── Section 2: embedConcurrent ───────────────────────────────────────────────

describe("embedConcurrent", () => {
  function makePending(count: number): PendingChunk[] {
    return Array.from({ length: count }, (_, i) => ({
      path: `note${i}.md`,
      heading: `Section ${i}`,
      text: `text for chunk ${i}`,
      mtime: 1000,
    }));
  }

  it("embeds all chunks and returns them in input order", async () => {
    const pending = makePending(5);
    let callIdx = 0;
    const embedder = makeEmbedder({
      embed: vi.fn().mockImplementation(async () => {
        const idx = callIdx++;
        return [idx, 0]; // each chunk gets a unique vec so we can verify order
      }),
    });

    const result = await embedConcurrent(pending, embedder);

    expect(result).toHaveLength(5);
    // Order preserved: result[i].text matches pending[i].text.
    for (let i = 0; i < 5; i++) {
      expect(result[i].text).toBe(pending[i].text);
    }
  });

  it("never exceeds the requested concurrency limit", async () => {
    const CONCURRENCY = 3;
    const pending = makePending(10);
    let inFlight = 0;
    let maxInFlight = 0;

    const embedder = makeEmbedder({
      embed: vi.fn().mockImplementation(async () => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        // Tiny async yield so other workers can start.
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        inFlight--;
        return [1, 0];
      }),
    });

    await embedConcurrent(pending, embedder, { concurrency: CONCURRENCY });

    expect(maxInFlight).toBeLessThanOrEqual(CONCURRENCY);
    expect(maxInFlight).toBeGreaterThan(0);
  });

  it("a single failing chunk does not abort the batch — others complete", async () => {
    const pending = makePending(3);
    let callCount = 0;

    const embedder = makeEmbedder({
      embed: vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 2) throw new Error("embed error");
        return [1, 0];
      }),
    });

    const result = await embedConcurrent(pending, embedder, { concurrency: 1 });

    // All 3 inputs attempted.
    expect(callCount).toBe(3);
    // Only 2 succeed (the failing one is skipped).
    expect(result).toHaveLength(2);
  });

  it("returns empty array when pending is empty", async () => {
    const embedder = makeEmbedder();
    const result = await embedConcurrent([], embedder);
    expect(result).toHaveLength(0);
    expect(embedder.embed).not.toHaveBeenCalled();
  });
});

// ─── Section 3: Resumable partial save ────────────────────────────────────────

describe("embedConcurrent — partial saves", () => {
  function makePending(count: number): PendingChunk[] {
    return Array.from({ length: count }, (_, i) => ({
      path: `note.md`,
      text: `chunk text ${i}`,
      mtime: 1000,
    }));
  }

  it("calls onPartial every ~50 newly embedded chunks", async () => {
    const pending = makePending(120);
    const embedder = makeEmbedder();
    const partialCalls: number[] = [];

    await embedConcurrent(pending, embedder, {
      concurrency: 1, // serial so counts are predictable
      onPartial: async (chunks) => {
        partialCalls.push(chunks.length);
      },
    });

    // With 120 items and PARTIAL_EVERY=50: at 50 and at 100.
    expect(partialCalls.length).toBeGreaterThanOrEqual(2);
    expect(partialCalls[0]).toBe(50);
  });

  it("onPartial receives all successfully embedded chunks up to that point", async () => {
    const pending = makePending(60);
    const embedder = makeEmbedder();
    const captured: number[] = [];

    await embedConcurrent(pending, embedder, {
      concurrency: 1,
      onPartial: async (chunks) => {
        captured.push(chunks.length);
      },
    });

    // At 50 chunks embedded → onPartial called with 50 chunks.
    expect(captured[0]).toBe(50);
  });

  it("second run with a partial index only re-embeds the changed files", async () => {
    // Simulate: file A has 1 chunk already saved (partial save state).
    // File B has not been indexed yet (mtime > stored chunk mtime).
    const mtimeA = 500;
    const mtimeB = 500;
    const existingChunks: EmbeddingIndex["chunks"] = [
      { id: "a.md#section", path: "a.md", text: makeMd(), vec: [1, 0], mtime: mtimeA },
      // b.md chunk is NOT in the partial save — it wasn't reached before interruption.
    ];
    mockReadFile.mockImplementation((p: string) => {
      if ((p as string).endsWith("embeddings.json")) return Promise.resolve(makeIndexJson(existingChunks, 400));
      if ((p as string).endsWith("b.md")) return Promise.resolve(makeMd());
      return Promise.reject(new Error("ENOENT"));
    });
    mockWalkFiles.mockResolvedValue(["a.md", "b.md"]);
    mockStat.mockImplementation((p: string) => {
      if ((p as string).endsWith("a.md")) return Promise.resolve({ mtimeMs: mtimeA });
      return Promise.resolve({ mtimeMs: mtimeB });
    });

    const embedder = makeEmbedder();
    await ensureIndex(embedder);

    // Only b.md needs re-embedding; a.md is reused from the partial save.
    expect(embedder.embed).toHaveBeenCalledTimes(1);
  });
});

// ─── Section 4: composeEmbedText ──────────────────────────────────────────────

describe("composeEmbedText", () => {
  it("includes title, heading, path, and body in output", () => {
    const result = composeEmbedText({
      title: "My Note",
      heading: "Introduction",
      path: "projects/my-note.md",
      body: "This is the body content.",
    });
    expect(result).toContain("My Note");
    expect(result).toContain("Introduction");
    expect(result).toContain("projects/my-note.md");
    expect(result).toContain("This is the body content.");
  });

  it("omits heading content when heading is undefined (empty string in slot)", () => {
    const result = composeEmbedText({
      title: "Untitled",
      heading: undefined,
      path: "notes/untitled.md",
      body: "Body text.",
    });
    expect(result).toContain("Untitled");
    expect(result).toContain("notes/untitled.md");
    expect(result).toContain("Body text.");
    // The heading slot is present but empty — four lines total
    const lines = result.split("\n");
    expect(lines).toHaveLength(4);
    expect(lines[1]).toBe(""); // heading slot is empty
  });

  it("preserves the exact order: title / heading / path / body", () => {
    const result = composeEmbedText({
      title: "T",
      heading: "H",
      path: "P",
      body: "B",
    });
    expect(result).toBe("T\nH\nP\nB");
  });

  it("embedConcurrent passes structured text to the embedder (not body-only)", async () => {
    const pending: PendingChunk[] = [
      { path: "wiki/foo.md", heading: "Details", text: "body content", mtime: 0, title: "Foo" },
    ];
    const embedSpy = vi.fn().mockResolvedValue([1, 0]);
    const embedder: Embedder = { id: "ollama-local", model: "nomic-embed-text", dim: 2, embed: embedSpy };
    await embedConcurrent(pending, embedder);
    // The embed call should receive the composed text, not just body content
    expect(embedSpy).toHaveBeenCalledTimes(1);
    const calledWith: string = embedSpy.mock.calls[0][0] as string;
    expect(calledWith).toContain("Foo");           // title
    expect(calledWith).toContain("Details");        // heading
    expect(calledWith).toContain("wiki/foo.md");    // path
    expect(calledWith).toContain("body content");   // body
  });
});

describe("getIndexStatus — version-aware staleness", () => {
  beforeEach(() => {
    mockGetVaultPath.mockReturnValue("/vault");
    mockStat.mockResolvedValue({ mtimeMs: 100 }); // files older than builtAt
    mockWalkFiles.mockResolvedValue(["a.md"]);
  });

  function onDiskIndex(version: number, builtAt = 1000): string {
    return JSON.stringify({
      version,
      embedder: "ollama-local",
      model: "nomic-embed-text",
      dim: 2,
      builtAt,
      chunks: [{ id: "a.md#s", path: "a.md", text: "t", vec: [1, 0], mtime: 100 }],
    });
  }

  it("legacy (v1) index with unchanged files → stale (needs structure-aware rebuild)", async () => {
    mockReadFile.mockImplementation((p: string) =>
      (p as string).endsWith("embeddings.json") ? Promise.resolve(onDiskIndex(1)) : Promise.reject(new Error("ENOENT")),
    );
    const s = await getIndexStatus();
    expect(s.built).toBe(true);
    expect(s.stale).toBe(true); // version 1 !== INDEX_VERSION
  });

  it("current-version index with unchanged files → not stale", async () => {
    mockReadFile.mockImplementation((p: string) =>
      (p as string).endsWith("embeddings.json") ? Promise.resolve(onDiskIndex(INDEX_VERSION)) : Promise.reject(new Error("ENOENT")),
    );
    const s = await getIndexStatus();
    expect(s.stale).toBe(false);
  });

  it("current-version index but a file changed → stale (mtime)", async () => {
    mockStat.mockResolvedValue({ mtimeMs: 5000 }); // newer than builtAt 1000
    mockReadFile.mockImplementation((p: string) =>
      (p as string).endsWith("embeddings.json") ? Promise.resolve(onDiskIndex(INDEX_VERSION, 1000)) : Promise.reject(new Error("ENOENT")),
    );
    const s = await getIndexStatus();
    expect(s.stale).toBe(true);
  });
});
