import { describe, it, expect } from "vitest";
import {
  tokenizeQuery,
  escapeRegExp,
  scoreFileAgainstTerms,
  applyRecencyBoost,
  buildExcerpt,
  toScorable,
  DEFAULT_WEIGHTS,
} from "./search-core";
import type { ScorableFile } from "./search-core";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeFile(overrides: Partial<ScorableFile> = {}): ScorableFile {
  return {
    path: "notes/test.md",
    content: "",
    headings: [],
    tags: [],
    frontmatterText: "",
    mtime: 0,
    ...overrides,
  };
}

const DAY_MS = 1000 * 60 * 60 * 24;
const NOW = 1_700_000_000_000; // fixed reference timestamp

// ─── tokenizeQuery ────────────────────────────────────────────────────────────

describe("tokenizeQuery", () => {
  it("returns empty array for empty string", () => {
    expect(tokenizeQuery("")).toEqual([]);
  });

  it("lowercases and splits on whitespace", () => {
    expect(tokenizeQuery("  Cipher  Vault ")).toEqual(["cipher", "vault"]);
  });

  it("keeps 2-char terms (regression: old >2 filter dropped them)", () => {
    expect(tokenizeQuery("ml ci")).toEqual(["ml", "ci"]);
  });

  it("drops 1-char terms", () => {
    expect(tokenizeQuery("a ml")).toEqual(["ml"]);
  });

  it("custom minLen honoured", () => {
    expect(tokenizeQuery("a ml ci", 3)).toEqual([]);
  });

  it("trims and deduplicates whitespace", () => {
    expect(tokenizeQuery("  hello  world  ")).toEqual(["hello", "world"]);
  });
});

// ─── escapeRegExp ─────────────────────────────────────────────────────────────

describe("escapeRegExp", () => {
  it("escapes regex metacharacters", () => {
    const chars = ". * + ? ^ $ { } ( ) | [ ] \\".split(" ");
    for (const c of chars) {
      const escaped = escapeRegExp(c);
      expect(() => new RegExp(escaped)).not.toThrow();
      expect(new RegExp(escaped).test(c)).toBe(true);
    }
  });

  it("leaves alphanumerics unchanged", () => {
    expect(escapeRegExp("cipher123")).toBe("cipher123");
  });

  it("escapes a( — would be a SyntaxError unescaped", () => {
    expect(() => new RegExp(escapeRegExp("a("))).not.toThrow();
  });

  it("escapes (a+)+ — catastrophic backtracking unescaped", () => {
    expect(() => new RegExp(escapeRegExp("(a+)+"))).not.toThrow();
  });
});

// ─── scoreFileAgainstTerms ───────────────────────────────────────────────────

describe("scoreFileAgainstTerms", () => {
  it("zero match → score 0, matched false, all hits 0", () => {
    const file = makeFile({ content: "unrelated content here" });
    const result = scoreFileAgainstTerms(file, ["zzz"]);
    expect(result).toMatchObject({ score: 0, matched: false });
    expect(result.hits).toEqual({ content: 0, heading: 0, tag: 0, frontmatter: 0 });
  });

  it("empty terms → score 0, matched false", () => {
    const file = makeFile({ content: "cipher vault cipher" });
    const result = scoreFileAgainstTerms(file, []);
    expect(result).toMatchObject({ score: 0, matched: false });
  });

  it("TF: content 'cipher' x3 → score 3 (weight 1 each)", () => {
    const file = makeFile({ content: "cipher vault cipher this cipher" });
    const result = scoreFileAgainstTerms(file, ["cipher"]);
    expect(result.hits.content).toBe(3);
    expect(result.score).toBe(3 * DEFAULT_WEIGHTS.content);
    expect(result.matched).toBe(true);
  });

  it("heading weight (5) dominates over body weight (1): heading 1 hit beats body 4 hits", () => {
    const fileA = makeFile({ headings: ["Cipher Overview"], content: "" });
    const fileB = makeFile({ content: "cipher cipher cipher cipher" });
    const a = scoreFileAgainstTerms(fileA, ["cipher"]);
    const b = scoreFileAgainstTerms(fileB, ["cipher"]);
    expect(a.score).toBeGreaterThan(b.score); // 5 > 4
  });

  it("mixed: content 3x + heading 1x → 3*1 + 1*5 = 8", () => {
    const file = makeFile({
      content: "cipher vault cipher cipher",
      headings: ["Cipher Overview"],
    });
    const result = scoreFileAgainstTerms(file, ["cipher"]);
    expect(result.score).toBe(3 * DEFAULT_WEIGHTS.content + 1 * DEFAULT_WEIGHTS.heading);
    expect(result.matched).toBe(true);
  });

  it("tag-only match: term in tags but not body → hits.tag=1, score=4, matched=true (regression)", () => {
    const file = makeFile({ tags: ["cipher"], content: "nothing here" });
    const result = scoreFileAgainstTerms(file, ["cipher"]);
    expect(result.hits.tag).toBe(1);
    expect(result.score).toBe(DEFAULT_WEIGHTS.tag);
    expect(result.matched).toBe(true);
  });

  it("frontmatter-only match: term in frontmatterText → hits.frontmatter=1, matched=true (regression)", () => {
    const file = makeFile({ frontmatterText: "status: blocked", content: "" });
    const result = scoreFileAgainstTerms(file, ["blocked"]);
    expect(result.hits.frontmatter).toBe(1);
    expect(result.score).toBe(DEFAULT_WEIGHTS.frontmatter);
    expect(result.matched).toBe(true);
  });

  it("case-insensitive: CIPHER matches 'cipher'", () => {
    const file = makeFile({ content: "cipher vault" });
    const result = scoreFileAgainstTerms(file, ["CIPHER"]);
    expect(result.matched).toBe(true);
  });

  it("ReDoS safety: term 'a(' does not throw", () => {
    const file = makeFile({ content: "a( test a( more" });
    expect(() => scoreFileAgainstTerms(file, ["a("])).not.toThrow();
  });

  it("ReDoS safety: term '(a+)+' does not throw", () => {
    const file = makeFile({ content: "(a+)+ content" });
    expect(() => scoreFileAgainstTerms(file, ["(a+)+"])).not.toThrow();
  });

  it("custom weights honored: flat 1/1/1/1 → heading = content", () => {
    const file = makeFile({ headings: ["cipher"], content: "cipher" });
    const result = scoreFileAgainstTerms(file, ["cipher"], { content: 1, heading: 1, tag: 1, frontmatter: 1 });
    expect(result.hits.heading).toBe(1);
    expect(result.hits.content).toBe(1);
    expect(result.score).toBe(2);
  });

  it("multiple terms: each term's hits are accumulated", () => {
    const file = makeFile({ content: "apple banana apple cherry" });
    const result = scoreFileAgainstTerms(file, ["apple", "banana"]);
    // apple x2 content + banana x1 content
    expect(result.hits.content).toBe(3);
    expect(result.matched).toBe(true);
  });

  it("path is preserved in result", () => {
    const file = makeFile({ path: "work/project.md", content: "hello" });
    const result = scoreFileAgainstTerms(file, ["hello"]);
    expect(result.path).toBe("work/project.md");
  });
});

// ─── applyRecencyBoost ───────────────────────────────────────────────────────

describe("applyRecencyBoost", () => {
  it("no boost when !matched: score stays 0 (headline recency fix)", () => {
    const nonMatch = { path: "x.md", score: 0, matched: false, hits: { content: 0, heading: 0, tag: 0, frontmatter: 0 }, mtime: NOW };
    const result = applyRecencyBoost(nonMatch, NOW);
    expect(result.score).toBe(0);
    expect(result.matched).toBe(false);
  });

  it("boost added when matched + mtime=now → score increases by up to maxBoost", () => {
    const match = { path: "x.md", score: 4, matched: true, hits: { content: 1, heading: 0, tag: 0, frontmatter: 0 }, mtime: NOW };
    const result = applyRecencyBoost(match, NOW, 90, 2);
    expect(result.score).toBe(4 + 2); // maxBoost since mtime==now
  });

  it("boost decays to ~0 at halfLifeDays", () => {
    const match = { path: "x.md", score: 4, matched: true, hits: { content: 1, heading: 0, tag: 0, frontmatter: 0 }, mtime: NOW - 90 * DAY_MS };
    const result = applyRecencyBoost(match, NOW, 90, 2);
    // At exactly halfLife, boost should be ~0
    expect(result.score).toBeCloseTo(4, 1);
  });

  it("boost clamped to 0 for very old files (not negative)", () => {
    const match = { path: "x.md", score: 4, matched: true, hits: { content: 1, heading: 0, tag: 0, frontmatter: 0 }, mtime: NOW - 200 * DAY_MS };
    const result = applyRecencyBoost(match, NOW, 90, 2);
    expect(result.score).toBeGreaterThanOrEqual(4);
  });

  it("deterministic: same inputs + same now → identical output", () => {
    const match = { path: "x.md", score: 4, matched: true, hits: { content: 1, heading: 0, tag: 0, frontmatter: 0 }, mtime: NOW - 30 * DAY_MS };
    const r1 = applyRecencyBoost(match, NOW);
    const r2 = applyRecencyBoost(match, NOW);
    expect(r1.score).toBe(r2.score);
  });

  it("mtime=0 treated as very old (score unchanged or just base score)", () => {
    const match = { path: "x.md", score: 3, matched: true, hits: { content: 1, heading: 0, tag: 0, frontmatter: 0 }, mtime: 0 };
    const result = applyRecencyBoost(match, NOW);
    expect(result.score).toBeGreaterThanOrEqual(3);
  });
});

// ─── buildExcerpt ────────────────────────────────────────────────────────────

describe("buildExcerpt", () => {
  it("preserves original casing (regression: was lowercased)", () => {
    const content = "The Quick Brown Fox jumps over the lazy dog";
    const excerpt = buildExcerpt(content, [], ["brown"]);
    // Original "Brown" (capital B) must appear, not lowercased "brown"
    expect(excerpt).toContain("Brown");
    // The excerpt should be a substring of the original (casing preserved)
    expect(content).toContain(excerpt.replace(/…/g, "").trim().slice(0, 10));
  });

  it("finds any term, not just terms[0] (regression)", () => {
    const content = "intro paragraph here and the widget lives here at the end";
    // First term not in body, second is
    const excerpt = buildExcerpt(content, [], ["nonexistent_term", "widget"]);
    expect(excerpt).toContain("widget");
  });

  it("heading-only match falls back to heading text, not body slice (regression)", () => {
    const content = "A very long preamble that does not mention the matched term";
    const headings = ["Cipher Overview Section"];
    const excerpt = buildExcerpt(content, headings, ["cipher"]);
    // Should show the heading, not the body opener
    expect(excerpt).toContain("Cipher Overview Section");
  });

  it("no leading ellipsis when match is at index 0", () => {
    const content = "cipher is the first word here";
    const excerpt = buildExcerpt(content, [], ["cipher"]);
    expect(excerpt.startsWith("…")).toBe(false);
  });

  it("ellipsis on both sides when match is mid-document", () => {
    const prefix = "a".repeat(100);
    const suffix = "b".repeat(100);
    const content = `${prefix} cipher ${suffix}`;
    const excerpt = buildExcerpt(content, [], ["cipher"]);
    expect(excerpt).toContain("…");
    expect(excerpt).toContain("cipher");
  });

  it("no-body-hit fallback shows opening of content, never empty", () => {
    const content = "This is the opening paragraph with no matched terms at all here";
    const excerpt = buildExcerpt(content, [], ["zzz"]);
    expect(excerpt.length).toBeGreaterThan(0);
    expect(excerpt).toContain("This is the opening");
  });

  it("empty content + no match → empty string or safe fallback", () => {
    const excerpt = buildExcerpt("", [], ["cipher"]);
    expect(typeof excerpt).toBe("string");
  });

  it("empty terms → returns beginning of content", () => {
    const content = "The cipher vault";
    const excerpt = buildExcerpt(content, [], []);
    expect(excerpt.length).toBeGreaterThan(0);
  });
});

// ─── toScorable ──────────────────────────────────────────────────────────────

describe("toScorable", () => {
  it("maps ParsedFile fields correctly", () => {
    const parsed = {
      path: "work/project.md",
      content: "body text here",
      frontmatter: { status: "active", tags: ["ai"] },
      sections: [
        { heading: "Overview", level: 2, body: "details" },
        { heading: "Next steps", level: 3, body: "..." },
      ],
      mtime: 1_700_000_000_000,
    };
    const scorable = toScorable(parsed);
    expect(scorable.path).toBe("work/project.md");
    expect(scorable.content).toBe("body text here");
    expect(scorable.mtime).toBe(1_700_000_000_000);
    expect(scorable.headings).toContain("Overview");
    expect(scorable.headings).toContain("Next steps");
    // Tags from frontmatter
    expect(scorable.tags).toContain("ai");
    // Frontmatter text includes scalar values
    expect(scorable.frontmatterText).toContain("active");
  });

  it("handles empty frontmatter and sections", () => {
    const parsed = {
      path: "notes/simple.md",
      content: "just a note",
      frontmatter: {},
      sections: [],
      mtime: 0,
    };
    const scorable = toScorable(parsed);
    expect(scorable.headings).toEqual([]);
    expect(scorable.tags).toEqual([]);
    expect(scorable.frontmatterText).toBe("");
  });

  it("frontmatter tags + inline #tags both captured", () => {
    const parsed = {
      path: "notes/tagged.md",
      content: "body with #ml tag inline",
      frontmatter: { tags: ["ai"] },
      sections: [],
      mtime: 0,
    };
    const scorable = toScorable(parsed);
    expect(scorable.tags).toContain("ai");
    expect(scorable.tags).toContain("ml");
  });
});
