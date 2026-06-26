/**
 * Boundary tests for buildSearchResults.
 * Stubs collectVaultFiles + vault deps so tests are pure and fast.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the search-core module to control collectVaultFiles
vi.mock("../search/search-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../search/search-core")>();
  return {
    ...actual,
    // collectVaultFiles will be overridden per-test
    collectVaultFiles: vi.fn(),
  };
});

vi.mock("../vault-tags", () => ({
  notesForTag: vi.fn().mockResolvedValue([]),
}));

import { buildSearchResults } from "./search";
import { collectVaultFiles } from "../search/search-core";

const mockCollectVaultFiles = vi.mocked(collectVaultFiles);

const DAY_MS = 1000 * 60 * 60 * 24;

function makeScorableFile(path: string, content: string, mtime: number) {
  return { path, content, headings: [], tags: [], frontmatterText: "", mtime };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buildSearchResults boundary tests", () => {
  it("fresh non-matching file is ABSENT, stale matching file is PRESENT (recency fix)", async () => {
    const now = Date.now();
    // Fresh file (mtime = now) but content does not match the query
    const freshNonMatch = makeScorableFile("notes/recent.md", "unrelated content here", now);
    // Stale file (90 days old) but content matches the query
    const staleMatch = makeScorableFile(
      "notes/old-match.md",
      "the cipher vault has been updated",
      now - 90 * DAY_MS,
    );

    mockCollectVaultFiles.mockResolvedValue([freshNonMatch, staleMatch]);

    const vm = await buildSearchResults("cipher");
    const data = vm.data as import("../view-models").SearchResultsData;

    const paths = data.results.map((r) => r.path);
    // The stale matching file MUST appear
    expect(paths).toContain("notes/old-match.md");
    // The fresh NON-matching file must NOT appear (recency must not inflate its score)
    expect(paths).not.toContain("notes/recent.md");
  });

  it("return shape is byte-compatible with SearchResultsData (label, path, excerpt, kind, suggestedViews)", async () => {
    const now = Date.now();
    // Use a path that kindFromPath recognizes as "work" (requires /work/ substring)
    const matchFile = makeScorableFile("wiki/work/task.md", "cipher task", now - DAY_MS);
    mockCollectVaultFiles.mockResolvedValue([matchFile]);

    const vm = await buildSearchResults("cipher");
    const data = vm.data as import("../view-models").SearchResultsData;

    expect(vm.type).toBe("search_results");
    expect(data).toHaveProperty("query", "cipher");
    expect(data).toHaveProperty("results");
    expect(data).toHaveProperty("suggestedViews");

    const result = data.results[0];
    expect(result).toHaveProperty("label");
    expect(result).toHaveProperty("path");
    expect(result).toHaveProperty("excerpt");
    expect(result).toHaveProperty("kind");
    expect(result.path).toBe("wiki/work/task.md");
    // kindFromPath("wiki/work/task.md") => "work", toSearchKind("work") => "work"
    expect(result.kind).toBe("work");
  });

  it("empty vault → empty results, not a throw", async () => {
    mockCollectVaultFiles.mockResolvedValue([]);
    const vm = await buildSearchResults("cipher");
    const data = vm.data as import("../view-models").SearchResultsData;
    expect(data.results).toEqual([]);
    expect(vm.type).toBe("search_results");
  });

  it("caps results at 12", async () => {
    const now = Date.now();
    const files = Array.from({ length: 20 }, (_, i) =>
      makeScorableFile(`notes/note-${i}.md`, "cipher mention here", now - i * DAY_MS),
    );
    mockCollectVaultFiles.mockResolvedValue(files);

    const vm = await buildSearchResults("cipher");
    const data = vm.data as import("../view-models").SearchResultsData;
    expect(data.results.length).toBeLessThanOrEqual(12);
  });
});
