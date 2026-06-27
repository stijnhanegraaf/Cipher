/**
 * Unit tests for chunksToSearchResults (pure, no I/O).
 */

import { describe, it, expect } from "vitest";
import { chunksToSearchResults } from "./semantic-search";
import type { RetrievedChunk } from "@/lib/chat/retrieval";

function makeChunk(
  path: string,
  text: string,
  score: number,
  heading?: string,
): RetrievedChunk {
  return { id: path, path, text, score, heading };
}

describe("chunksToSearchResults", () => {
  it("maps label from nameFromPath (hyphen->space), path passthrough, kind from kindFromPath", () => {
    const chunks = [makeChunk("wiki/work/my-task.md", "Some work content here", 0.9)];
    const result = chunksToSearchResults("test query", chunks);

    expect(result.query).toBe("test query");
    expect(result.results).toHaveLength(1);

    const r = result.results[0];
    expect(r.label).toBe("my task"); // nameFromPath strips .md, replace(/-/g," ")
    expect(r.path).toBe("wiki/work/my-task.md");
    expect(r.kind).toBe("work"); // kindFromPath → "work", toSearchKind → "work"
    expect(r.excerpt).toContain("Some work content here");
  });

  it("prepends heading prefix when heading is present", () => {
    const chunks = [makeChunk("notes/test.md", "body content here", 0.8, "My Heading")];
    const result = chunksToSearchResults("q", chunks);

    expect(result.results[0].excerpt).toBe("My Heading — body content here");
  });

  it("no heading prefix when heading is absent", () => {
    const chunks = [makeChunk("notes/test.md", "body only", 0.8)];
    const result = chunksToSearchResults("q", chunks);

    expect(result.results[0].excerpt).toBe("body only");
  });

  it("excerpt is capped at 140 chars (text portion)", () => {
    const longText = "a".repeat(200);
    const chunks = [makeChunk("notes/long.md", longText, 0.7)];
    const result = chunksToSearchResults("q", chunks);

    // excerpt = "" + longText.slice(0, 140)
    expect(result.results[0].excerpt?.length).toBeLessThanOrEqual(140);
  });

  it("dedup by path: keeps the highest-scoring chunk (first, since retrieve returns best-first)", () => {
    const chunks = [
      makeChunk("notes/same.md", "best content chunk", 0.9),
      makeChunk("notes/same.md", "worse content chunk", 0.5),
    ];
    const result = chunksToSearchResults("q", chunks);

    expect(result.results).toHaveLength(1);
    expect(result.results[0].excerpt).toContain("best content chunk");
    expect(result.results[0].excerpt).not.toContain("worse");
  });

  it("dedup works across multiple distinct paths", () => {
    const chunks = [
      makeChunk("a/file1.md", "content a1", 0.9),
      makeChunk("b/file2.md", "content b1", 0.8),
      makeChunk("a/file1.md", "content a2", 0.6),
    ];
    const result = chunksToSearchResults("q", chunks);

    expect(result.results).toHaveLength(2);
    expect(result.results.map((r) => r.path)).toEqual(["a/file1.md", "b/file2.md"]);
  });

  it("empty chunks → { query, results: [] } (no suggestedViews)", () => {
    const result = chunksToSearchResults("empty query", []);

    expect(result.query).toBe("empty query");
    expect(result.results).toEqual([]);
    expect(result.suggestedViews).toBeUndefined();
  });

  it("kind falls back to 'note' for paths not matching any known segment", () => {
    const chunks = [makeChunk("random/path.md", "content", 0.5)];
    const result = chunksToSearchResults("q", chunks);

    // kindFromPath returns "note" as default; toSearchKind("note") → "note"
    expect(result.results[0].kind).toBe("note");
  });

  it("preserves kind vocab for all known path patterns", () => {
    const pathKindCases = [
      ["vault/entities/person.md", "entity"],
      ["vault/projects/cipher.md", "project"],
      ["vault/research/ai-study.md", "research"],
      ["vault/system/health.md", "system"],
      ["vault/journal/2024-01.md", "journal"],
      ["vault/private/notes.md", "personal"],
      ["vault/memory/context.md", "memory"],
    ] as const;

    for (const [path, expectedKind] of pathKindCases) {
      const chunks = [makeChunk(path, "content", 0.7)];
      const result = chunksToSearchResults("q", chunks);
      expect(result.results[0].kind).toBe(expectedKind);
    }
  });
});
