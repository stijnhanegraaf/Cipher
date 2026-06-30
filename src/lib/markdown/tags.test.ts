import { describe, it, expect } from "vitest";
import { normalizeTag, extractTags, primaryTag } from "./tags";

// ─── normalizeTag ─────────────────────────────────────────────────────────────

describe("normalizeTag", () => {
  it("strips leading # and lowercases", () => {
    expect(normalizeTag("#Design")).toBe("design");
  });

  it("lowercases without leading #", () => {
    expect(normalizeTag("#Foo")).toBe("foo");
  });

  it("collapses internal whitespace to hyphens", () => {
    expect(normalizeTag("  Q3  Plan ")).toBe("q3-plan");
  });

  it("keeps nested slash (Obsidian hierarchical tags)", () => {
    expect(normalizeTag("area/work")).toBe("area/work");
  });

  it("keeps nested slash with leading #", () => {
    expect(normalizeTag("#parent/child")).toBe("parent/child");
  });

  it("returns empty string for punctuation-only input", () => {
    expect(normalizeTag("#!!")).toBe("");
  });

  it("returns empty string for empty input", () => {
    expect(normalizeTag("")).toBe("");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeTag("  foo  ")).toBe("foo");
  });
});

// ─── extractTags ─────────────────────────────────────────────────────────────

describe("extractTags", () => {
  it("reads frontmatter tags array and normalizes each entry", () => {
    expect(extractTags("", { tags: ["a", "B"] })).toEqual(["a", "b"]);
  });

  it("reads frontmatter scalar string split on space and comma", () => {
    expect(extractTags("", { tags: "a, b c" })).toEqual(["a", "b", "c"]);
  });

  it("reads frontmatter singular tag: alias", () => {
    expect(extractTags("", { tag: "x" })).toEqual(["x"]);
  });

  it("falls back to tag: alias when tags key is absent", () => {
    expect(extractTags("", { tag: "y" })).toEqual(["y"]);
  });

  it("collects basic inline #tags", () => {
    expect(extractTags("see #foo and #bar", {})).toEqual(["foo", "bar"]);
  });

  it("requires first char of inline tag to be a letter (rejects hex/number)", () => {
    expect(extractTags("#fff #123 #a1", {})).toEqual(["a1"]);
  });

  it("ignores #tags inside fenced code blocks (backtick fence)", () => {
    const content = "```\n#nope\n```\n#yes";
    expect(extractTags(content, {})).toEqual(["yes"]);
  });

  it("ignores #tags inside fenced code blocks (tilde fence)", () => {
    const content = "~~~\n#nope\n~~~\n#yes";
    expect(extractTags(content, {})).toEqual(["yes"]);
  });

  it("ignores markdown anchor links [x](#anchor)", () => {
    expect(extractTags("[x](#anchor) #real", {})).toEqual(["real"]);
  });

  it("deduplicates: frontmatter first, then inline", () => {
    // frontmatter has ["b","c"], inline has #a #b — result is b,c,a (fm first, #b deduped)
    expect(extractTags("#a #b", { tags: ["b", "c"] })).toEqual(["b", "c", "a"]);
  });

  it("ignores inline #tag that is mid-word (no preceding whitespace or start)", () => {
    expect(extractTags("foo#bar", {})).toEqual([]);
  });

  it("drops non-string entries in frontmatter tags array", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(extractTags("", { tags: ["ok", 7 as any, null as any] })).toEqual(["ok"]);
  });

  it("returns empty array when no tags found anywhere", () => {
    expect(extractTags("plain text no tags", {})).toEqual([]);
  });

  it("handles both tags and tag alias: tags wins, tag is ignored when tags present", () => {
    // When both keys exist, tags takes precedence; tag alias is only used as fallback
    const result = extractTags("", { tags: ["a"], tag: "b" });
    expect(result).toContain("a");
  });

  it("inline tag at start of line (no preceding whitespace) is accepted", () => {
    expect(extractTags("#startofline", {})).toEqual(["startofline"]);
  });

  it("inline tag with Unicode letter start", () => {
    expect(extractTags("#café", {})).toEqual(["café"]);
  });
});

// ─── primaryTag ──────────────────────────────────────────────────────────────

describe("primaryTag", () => {
  it("returns first tag", () => {
    expect(primaryTag(["a", "b", "c"])).toBe("a");
  });

  it("returns empty string for empty array", () => {
    expect(primaryTag([])).toBe("");
  });

  it("returns the single tag when array has one element", () => {
    expect(primaryTag(["only"])).toBe("only");
  });
});
