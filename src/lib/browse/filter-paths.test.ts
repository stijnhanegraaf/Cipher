import { describe, it, expect } from "vitest";
import { filterPaths } from "./filter-paths";

// Base fixture — mirrors the draft's spec. These files are deliberately NOT
// in a loaded arborist tree; filterPaths must find them from the flat vault
// index regardless of expand state (the core regression check).
const files = [
  { path: "Projects/Cipher.md", name: "Cipher", folder: "Projects" },
  { path: "Projects/Notes/cipher-spec.md", name: "cipher-spec", folder: "Projects/Notes" },
  { path: "Daily/2026-06-25.md", name: "2026-06-25", folder: "Daily" },
  { path: "People/Alice.md", name: "Alice", folder: "People" },
] as const;

describe("filterPaths", () => {
  it("empty needle returns []", () => {
    expect(filterPaths(files, "")).toEqual([]);
  });

  it("whitespace-only needle returns []", () => {
    expect(filterPaths(files, "   ")).toEqual([]);
  });

  it("basename match finds a COLLAPSED / never-loaded file (core regression)", () => {
    // 'People/Alice.md' is in a folder that was never expanded in the arborist
    // tree. The old filterTree could not surface it. filterPaths must find it
    // by querying the flat vault index directly.
    const result = filterPaths(files, "alice");
    expect(result).toEqual([{ path: "People/Alice.md", name: "Alice", folder: "People" }]);
  });

  it("match is case-insensitive (upper needle)", () => {
    const result = filterPaths(files, "CIPHER");
    expect(result).toEqual([
      { path: "Projects/Cipher.md", name: "Cipher", folder: "Projects" },
      { path: "Projects/Notes/cipher-spec.md", name: "cipher-spec", folder: "Projects/Notes" },
    ]);
  });

  it("match is case-insensitive (lower needle)", () => {
    const result = filterPaths(files, "cipher");
    expect(result).toEqual([
      { path: "Projects/Cipher.md", name: "Cipher", folder: "Projects" },
      { path: "Projects/Notes/cipher-spec.md", name: "cipher-spec", folder: "Projects/Notes" },
    ]);
  });

  it("basename matches rank above path-only matches", () => {
    // Add a file whose name does NOT contain 'cipher' but whose path does
    const extended = [
      ...files,
      { path: "Cipher/readme.md", name: "readme", folder: "Cipher" },
    ];
    const result = filterPaths(extended, "cipher");
    // basename hits first (Cipher.md, cipher-spec.md), then path-only (Cipher/readme.md)
    expect(result).toEqual([
      { path: "Projects/Cipher.md", name: "Cipher", folder: "Projects" },
      { path: "Projects/Notes/cipher-spec.md", name: "cipher-spec", folder: "Projects/Notes" },
      { path: "Cipher/readme.md", name: "readme", folder: "Cipher" },
    ]);
  });

  it("path-segment match works when basename does not match", () => {
    // needle matches the folder segment, not the file's basename
    const result = filterPaths(files, "projects/notes");
    expect(result).toEqual([
      { path: "Projects/Notes/cipher-spec.md", name: "cipher-spec", folder: "Projects/Notes" },
    ]);
  });

  it("no match returns []", () => {
    expect(filterPaths(files, "zzzz")).toEqual([]);
  });

  it("deterministic tie-break: shorter path then lexicographic when ranks are equal", () => {
    // Two basename hits with the same rank and same path length — assert order
    // is lexicographic so rendering is stable across runs.
    const tie = [
      { path: "b/Cipher.md", name: "Cipher", folder: "b" },
      { path: "a/Cipher.md", name: "Cipher", folder: "a" },
    ];
    const result = filterPaths(tie, "cipher");
    expect(result).toEqual([
      { path: "a/Cipher.md", name: "Cipher", folder: "a" },
      { path: "b/Cipher.md", name: "Cipher", folder: "b" },
    ]);
  });

  it("shorter path wins among same-rank matches", () => {
    // Both are basename matches; shorter path should come first
    const result = filterPaths(files, "cipher");
    // "Projects/Cipher.md" (18 chars) < "Projects/Notes/cipher-spec.md" (29 chars)
    expect(result[0].path).toBe("Projects/Cipher.md");
    expect(result[1].path).toBe("Projects/Notes/cipher-spec.md");
  });

  it("input array is not mutated", () => {
    const snapshot = files.map((f) => ({ ...f }));
    filterPaths(files, "cipher");
    expect([...files]).toEqual(snapshot);
  });

  it("sub-3-char needle still matches (NOT the full-text-search length>2 rule)", () => {
    // File filters must work with short prefixes — no minimum-length gate
    const result = filterPaths(files, "al");
    expect(result).toEqual([
      { path: "People/Alice.md", name: "Alice", folder: "People" },
    ]);
  });

  it("single-char needle matches", () => {
    // Even 1-char needles work
    const result = filterPaths(files, "a");
    // Matches: Alice (name), Daily (name contains 'a'), 2026-06-25 does not,
    // Cipher.md/cipher-spec both have 'a' in path (Projects has 'a').
    // Just assert Alice is present and no throw
    expect(result.map((f) => f.name)).toContain("Alice");
  });
});
