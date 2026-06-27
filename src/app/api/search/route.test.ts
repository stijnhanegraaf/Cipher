/**
 * Route tests for GET /api/search.
 * All I/O deps are mocked; tests are pure and fast.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ──────────────────────────────────────────────────────────────
vi.mock("@/lib/chat/retrieval", () => ({ retrieve: vi.fn() }));
vi.mock("@/lib/chat/providers/embeddings", () => ({ resolveEmbedder: vi.fn() }));
vi.mock("@/lib/llm-settings", () => ({
  readLLMSettings: vi.fn().mockResolvedValue({ provider: "anthropic" }),
}));
vi.mock("@/lib/builders/search", () => ({ buildSearchResults: vi.fn() }));

import { GET } from "./route";
import { retrieve } from "@/lib/chat/retrieval";
import { resolveEmbedder } from "@/lib/chat/providers/embeddings";
import { buildSearchResults } from "@/lib/builders/search";
import type { SearchResultsData } from "@/lib/view-models";

const mockRetrieve = vi.mocked(retrieve);
const mockResolveEmbedder = vi.mocked(resolveEmbedder);
const mockBuildSearchResults = vi.mocked(buildSearchResults);

// ── Helpers ────────────────────────────────────────────────────────────

function makeRequest(q: string, mode?: string): NextRequest {
  const params = new URLSearchParams({ q });
  if (mode) params.set("mode", mode);
  return new NextRequest(`http://localhost/api/search?${params}`);
}

function makeViewModel(data: SearchResultsData) {
  return {
    type: "search_results" as const,
    viewId: "view_search_test",
    title: "Results",
    layout: "stack" as const,
    data,
    meta: { confidence: 0.5, freshness: "fresh" as const, generatedAt: "", primarySourceCount: 0 },
  };
}

const EXACT_DATA: SearchResultsData = {
  query: "cipher",
  results: [{ label: "Note", path: "notes/note.md", excerpt: "found here", kind: "note" }],
};

const SEMANTIC_CHUNKS = [
  { id: "c1", path: "wiki/work/task.md", text: "task content", score: 0.9 },
  { id: "c2", path: "wiki/entities/person.md", text: "person content", score: 0.8 },
];

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────────────

describe("GET /api/search — blank query", () => {
  it("returns 400 when q is missing", async () => {
    const req = new NextRequest("http://localhost/api/search");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when q is empty string", async () => {
    const req = makeRequest("");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });
});

describe("GET /api/search — mode=exact (default)", () => {
  it("calls buildSearchResults and returns its data with source=keyword-only", async () => {
    mockBuildSearchResults.mockResolvedValue(makeViewModel(EXACT_DATA));

    const res = await GET(makeRequest("cipher", "exact"));
    const json = await res.json();

    expect(mockBuildSearchResults).toHaveBeenCalledWith("cipher");
    expect(mockRetrieve).not.toHaveBeenCalled();
    expect(mockResolveEmbedder).not.toHaveBeenCalled();
    expect(json.data).toEqual(EXACT_DATA);
    expect(json.source).toBe("keyword-only");
  });

  it("defaults to exact when mode param is absent", async () => {
    mockBuildSearchResults.mockResolvedValue(makeViewModel(EXACT_DATA));

    const res = await GET(makeRequest("cipher"));
    const json = await res.json();

    expect(mockBuildSearchResults).toHaveBeenCalledWith("cipher");
    expect(mockRetrieve).not.toHaveBeenCalled();
    expect(json.source).toBe("keyword-only");
  });
});

describe("GET /api/search — mode=semantic, embedder present", () => {
  it("calls retrieve, maps chunks, returns embedder id as source", async () => {
    mockResolveEmbedder.mockResolvedValue({
      id: "openai",
      model: "text-embedding-3-small",
      dim: 1536,
      embed: vi.fn(),
    });
    mockRetrieve.mockResolvedValue({ chunks: SEMANTIC_CHUNKS, needsIndexing: false });

    const res = await GET(makeRequest("cipher", "semantic"));
    const json = await res.json();

    expect(mockRetrieve).toHaveBeenCalledWith("cipher");
    expect(mockBuildSearchResults).not.toHaveBeenCalled();
    expect(json.source).toBe("openai");
    expect(json.data.query).toBe("cipher");
    expect(json.data.results).toHaveLength(2);
    // Check field mapping
    expect(json.data.results[0].path).toBe("wiki/work/task.md");
    expect(json.data.results[0].kind).toBe("work");
  });
});

describe("GET /api/search — mode=semantic, transparent degrade", () => {
  it("resolveEmbedder null → source=keyword-only, calls buildSearchResults (not retrieve)", async () => {
    mockResolveEmbedder.mockResolvedValue(null);
    mockBuildSearchResults.mockResolvedValue(makeViewModel(EXACT_DATA));

    const res = await GET(makeRequest("cipher", "semantic"));
    const json = await res.json();

    expect(mockRetrieve).not.toHaveBeenCalled();
    expect(mockBuildSearchResults).toHaveBeenCalledWith("cipher");
    expect(json.source).toBe("keyword-only");
    expect(json.data.results.length).toBeGreaterThan(0);
  });

  it("retrieve returns empty → source=keyword-only, calls buildSearchResults", async () => {
    mockResolveEmbedder.mockResolvedValue({
      id: "ollama-local",
      model: "nomic-embed-text",
      dim: 768,
      embed: vi.fn(),
    });
    mockRetrieve.mockResolvedValue({ chunks: [], needsIndexing: false });
    mockBuildSearchResults.mockResolvedValue(makeViewModel(EXACT_DATA));

    const res = await GET(makeRequest("cipher", "semantic"));
    const json = await res.json();

    expect(mockBuildSearchResults).toHaveBeenCalledWith("cipher");
    expect(json.source).toBe("keyword-only");
    expect(json.data.results.length).toBeGreaterThan(0);
  });
});
