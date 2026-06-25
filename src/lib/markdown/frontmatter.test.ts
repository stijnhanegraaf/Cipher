import { describe, it, expect } from "vitest";
import { parseFrontmatter, stripFrontmatter } from "./frontmatter";

describe("parseFrontmatter", () => {
  it("returns empty frontmatter when none present", () => {
    const r = parseFrontmatter("# Hello\nbody");
    expect(r.frontmatter).toEqual({});
    expect(r.content).toBe("# Hello\nbody");
  });

  it("parses scalars, booleans, numbers", () => {
    const r = parseFrontmatter("---\ntitle: Q3 Plan\ndone: true\ncount: 3\n---\nbody");
    expect(r.frontmatter).toEqual({ title: "Q3 Plan", done: true, count: 3 });
    expect(r.content).toBe("body");
  });

  it("parses inline AND multi-line list tags", () => {
    const inline = parseFrontmatter("---\ntags: [a, b]\n---\nx");
    expect(inline.frontmatter.tags).toEqual(["a", "b"]);
    const block = parseFrontmatter("---\ntags:\n  - a\n  - b\n---\nx");
    expect(block.frontmatter.tags).toEqual(["a", "b"]);
  });

  it("parses nested objects", () => {
    const r = parseFrontmatter("---\nmeta:\n  author: stijn\n  pinned: false\n---\nx");
    expect(r.frontmatter.meta).toEqual({ author: "stijn", pinned: false });
  });

  it("does not treat a mid-content --- as the end marker", () => {
    const r = parseFrontmatter("---\ntitle: A\n---\nbefore\n\n---\n\nafter");
    expect(r.frontmatter).toEqual({ title: "A" });
    expect(r.content).toBe("before\n\n---\n\nafter");
  });

  it("recovers gracefully from malformed YAML", () => {
    const r = parseFrontmatter("---\n: : : not yaml\n---\nbody");
    expect(typeof r.frontmatter).toBe("object");
    expect(r.content).toBe("body");
  });
});

describe("stripFrontmatter", () => {
  it("returns body only", () => {
    expect(stripFrontmatter("---\na: 1\n---\nbody")).toBe("body");
  });
  it("returns input unchanged when no frontmatter", () => {
    expect(stripFrontmatter("plain")).toBe("plain");
  });
});
