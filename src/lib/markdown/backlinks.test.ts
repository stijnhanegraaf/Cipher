import { describe, it, expect } from "vitest";
import { extractMentionSnippets, extractMentionSnippet } from "./backlinks";

// ─── extractMentionSnippets ───────────────────────────────────────────────────

describe("extractMentionSnippets", () => {
  // Case 1: plain link, short content — no ellipsis, display text preserved
  it("matches a plain link and returns a snippet without ellipsis", () => {
    const result = extractMentionSnippets("See [[Q3 Plan]] for details.", "q3-plan");
    expect(result).toHaveLength(1);
    expect(result[0].snippet).toContain("Q3 Plan");
    expect(result[0].snippet).not.toContain("[[");
    // Short enough that no ellipsis is needed
    expect(result[0].snippet).not.toMatch(/^…/);
    expect(result[0].snippet).not.toMatch(/…$/);
  });

  // Case 2: alias link — target match on base, snippet shows alias text
  it("matches an alias link and shows the alias in the snippet", () => {
    const result = extractMentionSnippets("per [[q3-plan|the roadmap]] we ship", "q3-plan");
    expect(result).toHaveLength(1);
    expect(result[0].snippet).toContain("the roadmap");
    expect(result[0].matchedText).toBe("the roadmap");
  });

  // Case 3: anchor — anchor is ignored for target comparison
  it("matches a link with an anchor (anchor ignored in target compare)", () => {
    const result = extractMentionSnippets("[[q3-plan#Risks]] is open", "q3-plan");
    expect(result).toHaveLength(1);
  });

  // Case 4: nested path — match on last segment only
  it("matches on the last path segment for nested paths", () => {
    const result = extractMentionSnippets("[[projects/q3-plan]] now", "q3-plan");
    expect(result).toHaveLength(1);
  });

  // Case 5: no match — different target
  it("returns [] when the link target does not match", () => {
    const result = extractMentionSnippets("[[other-note]] here", "q3-plan");
    expect(result).toHaveLength(0);
  });

  // Case 6: long paragraph with radius=90 — snippet must be ellipsized
  it("clips a long context window with ellipsis (radius=90)", () => {
    const prefix = "Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon phi chi psi omega. ";
    const suffix = " end of sentence. Another sentence here with more text to pad things out.";
    const content = prefix + "[[q3-plan]] is the key deliverable" + suffix;
    const result = extractMentionSnippets(content, "q3-plan", 90);
    expect(result).toHaveLength(1);
    const snip = result[0].snippet;
    // Should be clipped — either leading or trailing ellipsis
    expect(snip.length).toBeLessThanOrEqual(220);
    // Contains the link display text
    expect(snip).toContain("q3-plan");
  });

  // Case 7: two mentions — returns two snippets; extractMentionSnippet returns first
  it("returns two snippets when there are two mentions", () => {
    const content = "First [[q3-plan]] mention. Later [[q3-plan]] again.";
    const result = extractMentionSnippets(content, "q3-plan");
    expect(result).toHaveLength(2);
    const single = extractMentionSnippet(content, "q3-plan");
    expect(single).toBe(result[0].snippet);
  });

  // Case 8: escaped pipe in table — parity with extractLinks
  // The WIKILINK_RE character class excludes `\`, so [[work/work\|Work]] does NOT
  // match (the `\` terminates the first capture group before `work/work` can close).
  // This is the same behavior as extractLinks (parity = both return 0 for this form).
  // A standard alias (no escape) DOES match and shows the alias text.
  it("matches an alias link in a table cell (parity with extractLinks)", () => {
    // Standard alias pipe — matches fine
    const content = "| [[work/work|Work]] |";
    const result = extractMentionSnippets(content, "work");
    expect(result).toHaveLength(1);
    expect(result[0].matchedText).toBe("Work");
  });

  it("does not match escaped-pipe form (parity with extractLinks — same regex, same miss)", () => {
    // Escaped-pipe form [[work/work\|Work]] — the backslash excludes the match,
    // same as extractLinks which uses the identical WIKILINK_RE.
    const content = "| [[work/work\\|Work]] |";
    const result = extractMentionSnippets(content, "work");
    expect(result).toHaveLength(0);
  });

  // Case 9: case + whitespace normalization — [[ Q3   Plan ]] matches "q3-plan"
  it("normalizes case and whitespace in link target", () => {
    const result = extractMentionSnippets("[[ Q3   Plan ]]", "q3-plan");
    expect(result).toHaveLength(1);
  });

  // Case 10: empty content / empty targetName — no throw, returns []
  it("handles empty content without throwing", () => {
    expect(() => extractMentionSnippets("", "q3-plan")).not.toThrow();
    expect(extractMentionSnippets("", "q3-plan")).toHaveLength(0);
  });

  it("handles empty targetName without throwing", () => {
    expect(() => extractMentionSnippets("[[q3-plan]] here", "")).not.toThrow();
    expect(extractMentionSnippets("[[q3-plan]] here", "")).toHaveLength(0);
  });
});

// ─── extractMentionSnippet ────────────────────────────────────────────────────

describe("extractMentionSnippet", () => {
  it("returns empty string when no match", () => {
    expect(extractMentionSnippet("[[other-note]] here", "q3-plan")).toBe("");
  });

  it("returns the first snippet as a string", () => {
    const content = "See [[q3-plan]] here.";
    const result = extractMentionSnippet(content, "q3-plan");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain("q3-plan");
  });

  it("returns empty string on empty content", () => {
    expect(extractMentionSnippet("", "q3-plan")).toBe("");
  });
});
