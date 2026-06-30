import { describe, it, expect, vi, beforeEach } from "vitest";

// We test collectVaultFiles by mocking the lazy imports.
// collectVaultFiles does dynamic import('@/lib/fs/walk') and import('@/lib/vault-reader')
// so we mock those modules.

vi.mock("@/lib/fs/walk", () => ({
  walkFiles: vi.fn(),
}));

vi.mock("@/lib/vault-reader", () => ({
  getVaultPath: vi.fn(),
  readVaultFile: vi.fn(),
}));

// We also need to mock extractTags used by toScorable
vi.mock("@/lib/markdown/tags", () => ({
  extractTags: vi.fn().mockReturnValue([]),
}));

// Import after mocks are in place.
import { collectVaultFiles } from "./search-core";
import { walkFiles } from "@/lib/fs/walk";
import { getVaultPath, readVaultFile } from "@/lib/vault-reader";

const mockWalkFiles = vi.mocked(walkFiles);
const mockGetVaultPath = vi.mocked(getVaultPath);
const mockReadVaultFile = vi.mocked(readVaultFile);

function makeParsedFile(rel: string) {
  return {
    path: rel,
    content: "some content",
    frontmatter: {},
    sections: [],
    mtime: 1_700_000_000_000,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("collectVaultFiles", () => {
  it("no vault → returns []", async () => {
    mockGetVaultPath.mockReturnValue(null);
    const result = await collectVaultFiles();
    expect(result).toEqual([]);
  });

  it("walks the whole vault (whole-vault fix: non-layout-folder files appear)", async () => {
    mockGetVaultPath.mockReturnValue("/vault");
    // A file outside any probed layout folder
    mockWalkFiles.mockResolvedValue(["random/deep/note.md", "journal/2024-01-01.md"]);
    mockReadVaultFile.mockImplementation(async (rel: string) => makeParsedFile(rel));

    const result = await collectVaultFiles();
    const paths = result.map((f) => f.path);
    // Both paths appear, including the non-layout 'random/deep/' one
    expect(paths).toContain("random/deep/note.md");
    expect(paths).toContain("journal/2024-01-01.md");
  });

  it("restrictTo: only allow-listed paths returned", async () => {
    mockGetVaultPath.mockReturnValue("/vault");
    mockWalkFiles.mockResolvedValue(["a.md", "b.md", "c.md"]);
    mockReadVaultFile.mockImplementation(async (rel: string) => makeParsedFile(rel));

    const result = await collectVaultFiles(new Set(["a.md", "c.md"]));
    const paths = result.map((f) => f.path);
    expect(paths).toContain("a.md");
    expect(paths).toContain("c.md");
    expect(paths).not.toContain("b.md");
  });

  it("skips unreadable files (readVaultFile returns null) without throwing", async () => {
    mockGetVaultPath.mockReturnValue("/vault");
    mockWalkFiles.mockResolvedValue(["good.md", "bad.md"]);
    mockReadVaultFile.mockImplementation(async (rel: string) => {
      if (rel === "bad.md") return null;
      return makeParsedFile(rel);
    });

    const result = await collectVaultFiles();
    const paths = result.map((f) => f.path);
    expect(paths).toContain("good.md");
    expect(paths).not.toContain("bad.md");
  });

  it("never throws when readVaultFile rejects", async () => {
    mockGetVaultPath.mockReturnValue("/vault");
    mockWalkFiles.mockResolvedValue(["crash.md", "ok.md"]);
    mockReadVaultFile.mockImplementation(async (rel: string) => {
      if (rel === "crash.md") throw new Error("unreadable");
      return makeParsedFile(rel);
    });

    await expect(collectVaultFiles()).resolves.toBeDefined();
    const result = await collectVaultFiles();
    expect(result.map((f) => f.path)).toContain("ok.md");
  });

  it("empty vault (walkFiles returns []) → returns []", async () => {
    mockGetVaultPath.mockReturnValue("/vault");
    mockWalkFiles.mockResolvedValue([]);

    const result = await collectVaultFiles();
    expect(result).toEqual([]);
  });
});
