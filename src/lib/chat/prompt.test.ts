/**
 * Tests for structure-aware prompt assembly.
 *
 * Coverage:
 *   1. buildVaultStructureSummary — includes folder roles and tags.
 *   2. buildPrompt — injects vault summary; per-chunk source labels carry
 *      path + heading + tags; chunks numbered [N] for citation.
 *   3. parseCitations — [^N] resolves to path/heading/title of chunk N.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// ─── Module-level mocks ────────────────────────────────────────────────────────

vi.mock("@/lib/vault-reader", () => ({
  getVaultLayout: vi.fn(),
}));
vi.mock("@/lib/vault-tags", () => ({
  collectTags: vi.fn(),
}));
vi.mock("@/lib/vault-graph", () => ({
  buildGraph: vi.fn(),
}));

import { getVaultLayout } from "@/lib/vault-reader";
import { collectTags } from "@/lib/vault-tags";
import { buildGraph } from "@/lib/vault-graph";
import {
  buildVaultStructureSummary,
  buildPrompt,
  parseCitations,
  type ChatHistoryTurn,
} from "./prompt";
import type { RetrievedChunk } from "./retrieval";
import type { VaultLayout } from "@/lib/vault-reader";

const mockGetVaultLayout = getVaultLayout as unknown as Mock;
const mockCollectTags = collectTags as unknown as Mock;
const mockBuildGraph = buildGraph as unknown as Mock;

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makeLayout(overrides?: Partial<VaultLayout>): VaultLayout {
  return {
    root: "/vault",
    hasWiki: false,
    entitiesDir: null,
    projectsDir: null,
    journalDir: null,
    researchDir: null,
    workDir: null,
    systemDir: null,
    auditsDir: null,
    hubFile: null,
    ...overrides,
  };
}

function makeChunk(overrides?: Partial<RetrievedChunk>): RetrievedChunk {
  return {
    id: "notes/test.md#s",
    path: "notes/test.md",
    text: "sample text content here",
    score: 0.8,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetVaultLayout.mockReturnValue(null);
  mockCollectTags.mockResolvedValue([]);
  mockBuildGraph.mockResolvedValue({ nodes: [], edges: [], folders: [] });
});

// ─── buildVaultStructureSummary ───────────────────────────────────────────────

describe("buildVaultStructureSummary", () => {
  it("returns empty string when no vault is connected (null layout, no tags)", async () => {
    const summary = await buildVaultStructureSummary();
    expect(summary).toBe("");
  });

  it("includes folder roles from the vault layout", async () => {
    mockGetVaultLayout.mockReturnValue(
      makeLayout({ entitiesDir: "entities", projectsDir: "projects" })
    );
    const summary = await buildVaultStructureSummary();
    expect(summary).toContain("entities");
    expect(summary).toContain("projects");
  });

  it("includes journal, work, and research folder roles when present", async () => {
    mockGetVaultLayout.mockReturnValue(
      makeLayout({ journalDir: "journal", workDir: "work", researchDir: "research" })
    );
    const summary = await buildVaultStructureSummary();
    expect(summary).toContain("journal");
    expect(summary).toContain("work");
    expect(summary).toContain("research");
  });

  it("includes vault tags in the summary", async () => {
    mockCollectTags.mockResolvedValue([
      { tag: "project", count: 10 },
      { tag: "research", count: 5 },
      { tag: "work", count: 3 },
    ]);
    const summary = await buildVaultStructureSummary();
    expect(summary).toContain("#project");
    expect(summary).toContain("#research");
    expect(summary).toContain("#work");
  });

  it("caps tags at MAX_SUMMARY_TAGS and does not throw on large lists", async () => {
    const manyTags = Array.from({ length: 100 }, (_, i) => ({ tag: `tag${i}`, count: 1 }));
    mockCollectTags.mockResolvedValue(manyTags);
    // Should not throw; summary length is bounded
    const summary = await buildVaultStructureSummary();
    expect(summary.length).toBeLessThanOrEqual(950); // within MAX_SUMMARY_CHARS + margin
  });

  it("includes note titles from graph nodes (most-linked first)", async () => {
    mockBuildGraph.mockResolvedValue({
      nodes: [
        { id: "a.md", title: "Alpha Note", backlinks: 5, outlinks: 1, folder: "", mtime: 0, tags: [], tag: "" },
        { id: "b.md", title: "Beta Note", backlinks: 10, outlinks: 2, folder: "", mtime: 0, tags: [], tag: "" },
      ],
      edges: [],
      folders: [],
    });
    const summary = await buildVaultStructureSummary();
    expect(summary).toContain("Alpha Note");
    expect(summary).toContain("Beta Note");
  });

  it("still works when collectTags throws", async () => {
    mockGetVaultLayout.mockReturnValue(makeLayout({ entitiesDir: "entities" }));
    mockCollectTags.mockRejectedValue(new Error("tag index unavailable"));
    // Should not throw — tags section is simply omitted
    const summary = await buildVaultStructureSummary();
    expect(summary).toContain("entities");
  });

  it("still works when buildGraph throws", async () => {
    mockCollectTags.mockResolvedValue([{ tag: "work", count: 2 }]);
    mockBuildGraph.mockRejectedValue(new Error("graph unavailable"));
    const summary = await buildVaultStructureSummary();
    expect(summary).toContain("#work");
  });
});

// ─── buildPrompt ─────────────────────────────────────────────────────────────

describe("buildPrompt", () => {
  it("returns messages starting with a system message", () => {
    const messages = buildPrompt({ query: "test", history: [], chunks: [] });
    expect(messages[0].role).toBe("system");
  });

  it("ends with a user message containing the query", () => {
    const messages = buildPrompt({ query: "what is foo?", history: [], chunks: [] });
    const last = messages[messages.length - 1];
    expect(last.role).toBe("user");
    expect(last.content).toBe("what is foo?");
  });

  it("injects vaultSummary into the system message when provided", () => {
    const messages = buildPrompt({
      query: "test",
      history: [],
      chunks: [],
      vaultSummary: "[VAULT STRUCTURE]\nVault folders: entities:wiki/entities\n[/VAULT STRUCTURE]",
    });
    expect(messages[0].content).toContain("[VAULT STRUCTURE]");
    expect(messages[0].content).toContain("entities:wiki/entities");
  });

  it("does not add vault summary section when vaultSummary is empty", () => {
    const messages = buildPrompt({ query: "test", history: [], chunks: [], vaultSummary: "" });
    // Should not contain VAULT STRUCTURE wrapper when summary is empty
    expect(messages[0].content).not.toContain("[VAULT STRUCTURE]");
  });

  it("numbers chunks [1]..[N] so the model can cite them", () => {
    const chunks: RetrievedChunk[] = [
      makeChunk({ path: "a.md", text: "content a" }),
      makeChunk({ path: "b.md", text: "content b" }),
    ];
    const messages = buildPrompt({ query: "q", history: [], chunks });
    expect(messages[0].content).toContain("[1]");
    expect(messages[0].content).toContain("[2]");
    expect(messages[0].content).not.toContain("[3]");
  });

  it("includes chunk path in the source label", () => {
    const chunks: RetrievedChunk[] = [
      makeChunk({ path: "projects/my-note.md" }),
    ];
    const messages = buildPrompt({ query: "q", history: [], chunks });
    expect(messages[0].content).toContain("projects/my-note.md");
  });

  it("includes heading in the source label when present", () => {
    const chunks: RetrievedChunk[] = [
      makeChunk({ path: "a.md", heading: "Background" }),
    ];
    const messages = buildPrompt({ query: "q", history: [], chunks });
    expect(messages[0].content).toContain("Background");
  });

  it("includes tags in the source label when present", () => {
    const chunks: RetrievedChunk[] = [
      makeChunk({ path: "a.md", tags: ["work", "project"] }),
    ];
    const messages = buildPrompt({ query: "q", history: [], chunks });
    expect(messages[0].content).toContain("work");
    expect(messages[0].content).toContain("project");
  });

  it("trims history to last 4 turns", () => {
    const history: ChatHistoryTurn[] = Array.from({ length: 6 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `turn ${i}`,
    }));
    const messages = buildPrompt({ query: "q", history, chunks: [] });
    // system + 4 history turns + 1 user query = 6 messages
    expect(messages).toHaveLength(6);
  });
});

// ─── parseCitations ──────────────────────────────────────────────────────────

describe("parseCitations", () => {
  it("resolves [^1] to the first chunk's path and heading", () => {
    const chunks: RetrievedChunk[] = [
      makeChunk({ path: "notes/alpha.md", heading: "Introduction", text: "alpha content" }),
    ];
    const citations = parseCitations("Here is a fact. [^1]", chunks);
    expect(citations).toHaveLength(1);
    expect(citations[0].id).toBe(1);
    expect(citations[0].path).toBe("notes/alpha.md");
    expect(citations[0].heading).toBe("Introduction");
  });

  it("carries the chunk title into the citation", () => {
    const chunks: RetrievedChunk[] = [
      makeChunk({ path: "notes/beta.md", title: "Beta Note", text: "beta content" }),
    ];
    const citations = parseCitations("See [^1] for details.", chunks);
    expect(citations[0].title).toBe("Beta Note");
  });

  it("deduplicates repeated [^N] markers", () => {
    const chunks: RetrievedChunk[] = [makeChunk({ path: "a.md", text: "text" })];
    const citations = parseCitations("[^1] and also [^1] again", chunks);
    expect(citations).toHaveLength(1);
  });

  it("ignores out-of-range citation indices", () => {
    const chunks: RetrievedChunk[] = [makeChunk({ path: "a.md", text: "text" })];
    const citations = parseCitations("[^0] [^1] [^2] [^99]", chunks);
    // Only [^1] is valid (1-indexed, chunks.length=1)
    expect(citations).toHaveLength(1);
    expect(citations[0].id).toBe(1);
  });

  it("returns empty array when no [^N] markers present", () => {
    const chunks: RetrievedChunk[] = [makeChunk({ path: "a.md", text: "text" })];
    const citations = parseCitations("No citations here.", chunks);
    expect(citations).toHaveLength(0);
  });

  it("produces a snippet of up to 180 chars from chunk text", () => {
    const longText = "word ".repeat(100); // 500 chars
    const chunks: RetrievedChunk[] = [makeChunk({ text: longText })];
    const citations = parseCitations("[^1]", chunks);
    expect(citations[0].snippet.length).toBeLessThanOrEqual(180);
  });

  it("resolves multiple distinct citation indices in order", () => {
    const chunks: RetrievedChunk[] = [
      makeChunk({ path: "a.md", text: "text a" }),
      makeChunk({ path: "b.md", text: "text b" }),
      makeChunk({ path: "c.md", text: "text c" }),
    ];
    const citations = parseCitations("[^2] then [^1]", chunks);
    expect(citations).toHaveLength(2);
    // Order follows appearance in text
    expect(citations[0].path).toBe("b.md");
    expect(citations[1].path).toBe("a.md");
  });
});
