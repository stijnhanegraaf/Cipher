/**
 * Tests for structure-aware retrieval helpers.
 *
 * Coverage:
 *   1. expandViaGraph — linked note chunks are included; backlinked chunks
 *      included; max cap respected; top-K paths excluded.
 *   2. computeTagBoost — overlapping tags yield a positive boost; non-
 *      overlapping yield 0; boost is proportional to overlap count.
 */

import { describe, it, expect } from "vitest";
import { expandViaGraph, computeTagBoost } from "./retrieval";
import type { IndexChunk } from "./embeddings";
import type { Graph } from "@/lib/vault-graph";

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makeChunk(path: string, overrides?: Partial<IndexChunk>): IndexChunk {
  return {
    id: `${path}#s`,
    path,
    text: `text for ${path}`,
    vec: [1, 0],
    mtime: 0,
    ...overrides,
  };
}

function makeGraph(edges: { source: string; target: string }[]): Graph {
  return { nodes: [], edges, folders: [] };
}

// ─── expandViaGraph ────────────────────────────────────────────────────────────

describe("expandViaGraph", () => {
  it("includes chunks from notes that a top-hit links TO (outbound)", () => {
    const pool = [
      makeChunk("a.md"),
      makeChunk("b.md"), // b.md is linked from a.md
      makeChunk("c.md"),
    ];
    const graph = makeGraph([{ source: "a.md", target: "b.md" }]);

    const expanded = expandViaGraph(["a.md"], pool, graph, 10);

    expect(expanded.some((c) => c.path === "b.md")).toBe(true);
    // c.md is not linked so should not appear
    expect(expanded.every((c) => c.path !== "c.md")).toBe(true);
  });

  it("includes chunks from notes that link TO a top-hit (inbound / backlinks)", () => {
    const pool = [
      makeChunk("a.md"),
      makeChunk("b.md"), // b.md links to a.md, so a.md has a backlink from b.md
    ];
    const graph = makeGraph([{ source: "b.md", target: "a.md" }]);

    const expanded = expandViaGraph(["a.md"], pool, graph, 10);

    expect(expanded.some((c) => c.path === "b.md")).toBe(true);
  });

  it("does NOT include top-K paths themselves in the expansion", () => {
    const pool = [makeChunk("a.md"), makeChunk("b.md")];
    const graph = makeGraph([{ source: "a.md", target: "b.md" }]);

    const expanded = expandViaGraph(["a.md", "b.md"], pool, graph, 10);

    // Both a.md and b.md are top-K, so nothing new should be added
    expect(expanded).toHaveLength(0);
  });

  it("respects the max cap", () => {
    const linked = Array.from({ length: 10 }, (_, i) => makeChunk(`note${i}.md`));
    const pool = [makeChunk("hub.md"), ...linked];
    const graph = makeGraph(linked.map((c) => ({ source: "hub.md", target: c.path })));

    const expanded = expandViaGraph(["hub.md"], pool, graph, 3);

    expect(expanded.length).toBeLessThanOrEqual(3);
  });

  it("returns empty when no edges connect to top paths", () => {
    const pool = [makeChunk("a.md"), makeChunk("b.md"), makeChunk("c.md")];
    const graph = makeGraph([]); // no edges

    const expanded = expandViaGraph(["a.md"], pool, graph, 10);

    expect(expanded).toHaveLength(0);
  });

  it("includes at most one chunk per linked note (deduplication)", () => {
    // b.md has two chunks
    const pool = [
      makeChunk("a.md"),
      { id: "b.md#s1", path: "b.md", text: "section 1", vec: [1, 0], mtime: 0, heading: "S1" },
      { id: "b.md#s2", path: "b.md", text: "section 2", vec: [0, 1], mtime: 0, heading: "S2" },
    ];
    const graph = makeGraph([{ source: "a.md", target: "b.md" }]);

    const expanded = expandViaGraph(["a.md"], pool, graph, 10);

    const bChunks = expanded.filter((c) => c.path === "b.md");
    expect(bChunks).toHaveLength(1);
  });
});

// ─── computeTagBoost ──────────────────────────────────────────────────────────

describe("computeTagBoost", () => {
  it("returns 0 when query has no tags", () => {
    expect(computeTagBoost([], ["project", "work"])).toBe(0);
  });

  it("returns 0 when chunk has no tags", () => {
    expect(computeTagBoost(["project"], [])).toBe(0);
  });

  it("returns 0 when there is no tag overlap", () => {
    expect(computeTagBoost(["project"], ["research", "entities"])).toBe(0);
  });

  it("returns a positive boost when there is tag overlap", () => {
    const boost = computeTagBoost(["project"], ["project", "work"]);
    expect(boost).toBeGreaterThan(0);
  });

  it("a tag-overlapping chunk ranks above an equal-cosine non-overlapping chunk", () => {
    // Simulate two chunks with the same cosine similarity but different tags.
    const baseSim = 0.5;
    const overlapBoost = computeTagBoost(["project"], ["project"]);
    const noOverlapBoost = computeTagBoost(["project"], ["research"]);

    const scoreWithOverlap = baseSim + overlapBoost;
    const scoreWithoutOverlap = baseSim + noOverlapBoost;

    expect(scoreWithOverlap).toBeGreaterThan(scoreWithoutOverlap);
  });

  it("boost scales with the number of overlapping tags", () => {
    const oneOverlap = computeTagBoost(["a", "b", "c"], ["a"]);
    const twoOverlap = computeTagBoost(["a", "b", "c"], ["a", "b"]);
    const threeOverlap = computeTagBoost(["a", "b", "c"], ["a", "b", "c"]);

    expect(twoOverlap).toBeGreaterThan(oneOverlap);
    expect(threeOverlap).toBeGreaterThan(twoOverlap);
  });
});
