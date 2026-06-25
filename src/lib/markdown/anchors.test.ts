import { describe, it, expect } from "vitest";
import {
  findBlockById,
  slugifyHeading,
  headingSlugs,
  headingTexts,
  validateAnchor,
  extractSection,
} from "./anchors";

// ─── findBlockById ────────────────────────────────────────────────────────────

describe("findBlockById", () => {
  it("returns null for empty content", () => {
    expect(findBlockById("", "abc")).toBeNull();
  });

  it("finds a trailing inline block marker", () => {
    const content = "Some paragraph text ^myid";
    const result = findBlockById(content, "myid");
    expect(result).not.toBeNull();
    expect(result!.text).toBe("Some paragraph text");
    expect(result!.line).toBe(1);
  });

  it("accepts id passed WITH a leading caret", () => {
    const content = "Some paragraph text ^myid";
    expect(findBlockById(content, "^myid")).not.toBeNull();
  });

  it("does NOT match a partial id (^ab does not match ^abc)", () => {
    const content = "text ^ab";
    expect(findBlockById(content, "abc")).toBeNull();
  });

  it("does NOT match abc when marker is ^ab (partial id other direction)", () => {
    const content = "text ^abc";
    expect(findBlockById(content, "ab")).toBeNull();
  });

  it("strips the block marker from returned text", () => {
    const content = "Hello world ^foo";
    const result = findBlockById(content, "foo");
    expect(result!.text).toBe("Hello world");
  });

  it("handles own-line block marker: returns the preceding non-blank line", () => {
    const content = "Preceding paragraph\n\n^ownline";
    const result = findBlockById(content, "ownline");
    expect(result).not.toBeNull();
    expect(result!.text).toBe("Preceding paragraph");
  });

  it("handles own-line block marker directly after content line", () => {
    const content = "Direct preceding\n^ownline";
    const result = findBlockById(content, "ownline");
    expect(result).not.toBeNull();
    expect(result!.text).toBe("Direct preceding");
  });

  it("matches a list item with inline marker", () => {
    const content = "- List item one\n- List item two ^listid\n- List item three";
    const result = findBlockById(content, "listid");
    expect(result).not.toBeNull();
    expect(result!.text).toBe("- List item two");
    expect(result!.line).toBe(2);
  });

  it("returns FIRST match when duplicate ids exist", () => {
    const content = "First ^dup\nSecond ^dup";
    const result = findBlockById(content, "dup");
    expect(result!.line).toBe(1);
    expect(result!.text).toBe("First");
  });

  it("ids are case-sensitive", () => {
    const content = "text ^ABC";
    expect(findBlockById(content, "abc")).toBeNull();
    expect(findBlockById(content, "ABC")).not.toBeNull();
  });

  it("returns null when no matching marker exists", () => {
    const content = "No block markers here\nJust plain text";
    expect(findBlockById(content, "nope")).toBeNull();
  });

  it("handles CRLF line endings", () => {
    const content = "Some text ^crlfid\r\nAnother line";
    const result = findBlockById(content, "crlfid");
    expect(result).not.toBeNull();
    expect(result!.text).toBe("Some text");
  });

  it("allows hyphens and underscores in ids", () => {
    const content = "My content ^my-block_1";
    expect(findBlockById(content, "my-block_1")).not.toBeNull();
  });

  it("returns null when own-line marker has no preceding non-blank line", () => {
    const content = "^lonely";
    expect(findBlockById(content, "lonely")).toBeNull();
  });
});

// ─── slugifyHeading ───────────────────────────────────────────────────────────

describe("slugifyHeading", () => {
  it("lowercases", () => {
    expect(slugifyHeading("Hello World")).toBe("hello-world");
  });

  it("replaces spaces with hyphens", () => {
    expect(slugifyHeading("foo bar baz")).toBe("foo-bar-baz");
  });

  it("strips punctuation", () => {
    expect(slugifyHeading("Hello, World!")).toBe("hello-world");
  });

  it("collapses multiple hyphens (multiple spaces)", () => {
    expect(slugifyHeading("foo  bar")).toBe("foo-bar");
  });

  it("trims leading and trailing whitespace", () => {
    expect(slugifyHeading("  Hello  ")).toBe("hello");
  });

  it("handles heading with numbers (dot is a separator)", () => {
    // Under the unified algorithm dots (non-alphanumeric) become hyphens,
    // matching the DOM id that textToId produces for the same text.
    expect(slugifyHeading("Section 1.2")).toBe("section-1-2");
  });

  it("handles already-slug text", () => {
    expect(slugifyHeading("already-slug")).toBe("already-slug");
  });

  it("handles empty string", () => {
    expect(slugifyHeading("")).toBe("");
  });

  // Regression: underscore is treated as a separator (converted to `-`), not
  // kept as a word character.  This ensures the slug matches the DOM id that
  // textToId produces for the same heading text.
  it("converts underscores to hyphens (matches DOM id)", () => {
    expect(slugifyHeading("My_Heading")).toBe("my-heading");
  });

  it("collapses adjacent underscore+space into a single hyphen", () => {
    expect(slugifyHeading("foo _ bar")).toBe("foo-bar");
  });
});

// ─── headingTexts / headingSlugs ─────────────────────────────────────────────

describe("headingTexts", () => {
  it("returns all ATX heading texts", () => {
    const content = "# Top\n## Sub\n### Deep\nbody text";
    expect(headingTexts(content)).toEqual(["Top", "Sub", "Deep"]);
  });

  it("returns empty array when no headings", () => {
    expect(headingTexts("just body text\nmore text")).toEqual([]);
  });

  it("EXCLUDES headings inside fenced code blocks (backtick fence)", () => {
    const content = "# Real Heading\n```\n# Fake Heading\n```\n## Also Real";
    expect(headingTexts(content)).toEqual(["Real Heading", "Also Real"]);
  });

  it("EXCLUDES headings inside tilde fenced code blocks", () => {
    const content = "# Real\n~~~\n# Inside Fence\n~~~\n# After Fence";
    expect(headingTexts(content)).toEqual(["Real", "After Fence"]);
  });

  it("handles all heading levels (# through ######)", () => {
    const content = "# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6";
    expect(headingTexts(content)).toEqual(["H1", "H2", "H3", "H4", "H5", "H6"]);
  });
});

describe("headingSlugs", () => {
  it("returns slugified versions of all heading texts", () => {
    const content = "# Hello World\n## Foo, Bar!";
    expect(headingSlugs(content)).toEqual(["hello-world", "foo-bar"]);
  });

  it("EXCLUDES headings inside fenced code blocks", () => {
    const content = "# Real\n```\n# Fake\n```\n# After";
    expect(headingSlugs(content)).toEqual(["real", "after"]);
  });
});

// ─── validateAnchor ───────────────────────────────────────────────────────────

describe("validateAnchor", () => {
  const content = "# Hello World\n## Sub Section\n\nParagraph text ^myblock\n\nAnother line";

  it("returns none/valid/empty when anchor is empty string", () => {
    expect(validateAnchor(content, "")).toEqual({ kind: "none", valid: true, value: "" });
  });

  it("validates a block anchor (leading ^) that EXISTS", () => {
    const result = validateAnchor(content, "^myblock");
    expect(result.kind).toBe("block");
    expect(result.valid).toBe(true);
    expect(result.value).toBe("myblock");
  });

  it("invalidates a block anchor (leading ^) that does NOT exist", () => {
    const result = validateAnchor(content, "^nonexistent");
    expect(result.kind).toBe("block");
    expect(result.valid).toBe(false);
    expect(result.value).toBe("nonexistent");
  });

  it("validates a heading anchor by exact text (case-insensitive)", () => {
    const result = validateAnchor(content, "hello world");
    expect(result.kind).toBe("heading");
    expect(result.valid).toBe(true);
  });

  it("validates a heading anchor by slug match", () => {
    const result = validateAnchor(content, "hello-world");
    expect(result.kind).toBe("heading");
    expect(result.valid).toBe(true);
  });

  it("validates mixed-case heading text", () => {
    const result = validateAnchor(content, "HELLO WORLD");
    expect(result.kind).toBe("heading");
    expect(result.valid).toBe(true);
  });

  it("validates heading by slug of multi-word heading", () => {
    const result = validateAnchor(content, "sub-section");
    expect(result.kind).toBe("heading");
    expect(result.valid).toBe(true);
  });

  it("invalidates a heading anchor that matches nothing", () => {
    const result = validateAnchor(content, "does-not-exist");
    expect(result.kind).toBe("heading");
    expect(result.valid).toBe(false);
  });

  it("returns the anchor as value for heading anchors", () => {
    const result = validateAnchor(content, "hello-world");
    expect(result.value).toBe("hello-world");
  });
});

// ─── extractSection ───────────────────────────────────────────────────────────

describe("extractSection", () => {
  const content = [
    "# Top Level",
    "Intro text",
    "## Sub Section A",
    "Content A",
    "### Deep Section",
    "Deep content",
    "## Sub Section B",
    "Content B",
    "# Another Top",
    "After top",
  ].join("\n");

  it("returns the whole content when anchor is empty string", () => {
    expect(extractSection(content, "", false)).toBe(content);
  });

  it("returns empty string when anchor not found (heading)", () => {
    expect(extractSection(content, "nonexistent", false)).toBe("");
  });

  it("returns empty string when anchor not found (block)", () => {
    expect(extractSection(content, "noblock", true)).toBe("");
  });

  it("extracts a top-level heading section up to the next same-level heading", () => {
    const result = extractSection(content, "Top Level", false);
    // Should include from "# Top Level" up to (not including) "# Another Top"
    expect(result).toContain("# Top Level");
    expect(result).toContain("## Sub Section A");
    expect(result).toContain("### Deep Section");
    expect(result).toContain("## Sub Section B");
    expect(result).not.toContain("# Another Top");
  });

  it("extracts a second-level heading section including child subsections", () => {
    const result = extractSection(content, "Sub Section A", false);
    expect(result).toContain("## Sub Section A");
    expect(result).toContain("### Deep Section");
    expect(result).toContain("Deep content");
    // Should stop before "## Sub Section B" (same level)
    expect(result).not.toContain("Sub Section B");
  });

  it("stops at a heading of EQUAL level, not just higher level", () => {
    const result = extractSection(content, "Sub Section A", false);
    expect(result).not.toContain("Sub Section B");
  });

  it("extracts a block section by its line text", () => {
    const blockContent = "Line one\nLine two ^bid\nLine three";
    const result = extractSection(blockContent, "bid", true);
    expect(result).toBe("Line two");
  });

  it("returns empty string for block anchor not found", () => {
    const result = extractSection(content, "missing-block", true);
    expect(result).toBe("");
  });

  it("handles CRLF line endings", () => {
    const crlfContent = "# Heading A\r\nBody A\r\n## Sub\r\nBody Sub\r\n# Heading B\r\nBody B";
    const result = extractSection(crlfContent, "Heading A", false);
    expect(result).toContain("Heading A");
    expect(result).toContain("Body A");
    expect(result).not.toContain("Heading B");
  });

  it("extractSection with block isBlock=true strips the marker", () => {
    const blockContent = "Some paragraph ^pid";
    const result = extractSection(blockContent, "pid", true);
    expect(result).toBe("Some paragraph");
  });

  it("includes the final heading's content when it's the last section", () => {
    const result = extractSection(content, "Another Top", false);
    expect(result).toContain("# Another Top");
    expect(result).toContain("After top");
  });

  it("heading match is case-insensitive", () => {
    const result = extractSection(content, "top level", false);
    expect(result).toContain("# Top Level");
  });

  it("heading match works by slug", () => {
    const result = extractSection(content, "sub-section-a", false);
    expect(result).toContain("## Sub Section A");
  });
});
