import { describe, it, expect } from "vitest";
import { preprocessMarkdown, rewriteEmbeds } from "./preprocess";

describe("preprocessMarkdown — interactive mode (vault:// links)", () => {
  it("converts [[Some Note]] to a vault:// link with the note as label", () => {
    const result = preprocessMarkdown("[[Some Note]]", { interactive: true });
    expect(result).toBe("[Some Note](vault://Some Note)");
  });

  it("converts [[path|Alias]] to a vault:// link with the alias as label", () => {
    const result = preprocessMarkdown("[[path|Alias]]", { interactive: true });
    expect(result).toBe("[path|Alias](vault://path|Alias)");
  });

  it("converts multiple wiki links in one pass", () => {
    const result = preprocessMarkdown("See [[Note A]] and [[Note B]].", { interactive: true });
    expect(result).toBe("See [Note A](vault://Note A) and [Note B](vault://Note B).");
  });

  it("leaves plain prose unchanged", () => {
    const input = "This is plain text with no wiki links.";
    expect(preprocessMarkdown(input, { interactive: true })).toBe(input);
  });

  it("leaves regular markdown links unchanged", () => {
    const input = "[regular link](https://example.com)";
    expect(preprocessMarkdown(input, { interactive: true })).toBe(input);
  });
});

describe("rewriteEmbeds — ![[…]] to embed:// sentinel", () => {
  it("rewrites ![[note]] to an embed:// link on its own line", () => {
    const result = rewriteEmbeds("![[my note]]");
    expect(result).toContain("[](embed://my%20note)");
    // Must be on its own line (surrounded by newlines) to avoid <p> nesting.
    expect(result).toMatch(/\n\[\]\(embed:\/\/my%20note\)\n/);
  });

  it("rewrites ![[note#Heading]] preserving the full inner text", () => {
    const result = rewriteEmbeds("![[note#Section]]");
    expect(result).toContain("embed://note%23Section");
  });

  it("rewrites ![[image.png]] to an embed:// token", () => {
    const result = rewriteEmbeds("![[image.png]]");
    expect(result).toContain("embed://image.png");
  });

  it("leaves plain wiki-links unchanged", () => {
    const result = rewriteEmbeds("[[regular link]]");
    expect(result).toBe("[[regular link]]");
    expect(result).not.toContain("embed://");
  });

  it("leaves regular markdown unchanged", () => {
    const result = rewriteEmbeds("This is plain text.");
    expect(result).toBe("This is plain text.");
  });

  it("embed token does NOT contain stray [[ after rewrite", () => {
    const result = rewriteEmbeds("![[note]]");
    // The original ![[…]] is fully consumed; no stray [[ remains.
    expect(result).not.toContain("![[");
    expect(result).not.toContain("[[note]]");
  });

  it("full pipeline: embed rewrite runs BEFORE wiki-link rewrite (no double-match)", () => {
    // ![[note]] should become an embed sentinel, not a vault:// link.
    const result = preprocessMarkdown("![[note]]", { interactive: true });
    expect(result).toContain("embed://note");
    expect(result).not.toContain("vault://");
  });

  it("full pipeline: regular [[link]] after an embed still becomes vault:// link", () => {
    const result = preprocessMarkdown("![[embed-note]] and [[wiki-link]]", { interactive: true });
    expect(result).toContain("embed://embed-note");
    expect(result).toContain("vault://wiki-link");
  });
});

describe("preprocessMarkdown — non-interactive mode (obsidian:// links)", () => {
  it("converts [[Some Note]] to an obsidian:// link with default vault", () => {
    const result = preprocessMarkdown("[[Some Note]]", { interactive: false });
    expect(result).toBe(
      "[Some Note](obsidian://open?vault=Obsidian&file=Some%20Note)"
    );
  });

  it("uses the provided vaultName in the obsidian:// link", () => {
    const result = preprocessMarkdown("[[Note]]", {
      interactive: false,
      vaultName: "MyVault",
    });
    expect(result).toBe(
      "[Note](obsidian://open?vault=MyVault&file=Note)"
    );
  });

  it("converts [[path|Alias]] preserving raw inner text as file path", () => {
    // Non-interactive does NOT split alias — the entire inner text is the linkText
    // (matching the original preprocessWikiLinks behaviour which used linkText verbatim)
    const result = preprocessMarkdown("[[path|Alias]]", { interactive: false });
    expect(result).toBe(
      "[path|Alias](obsidian://open?vault=Obsidian&file=path%7CAlias)"
    );
  });

  it("leaves plain prose unchanged", () => {
    const input = "This is plain text with no wiki links.";
    expect(preprocessMarkdown(input, { interactive: false })).toBe(input);
  });

  it("leaves regular markdown links unchanged", () => {
    const input = "[regular link](https://example.com)";
    expect(preprocessMarkdown(input, { interactive: false })).toBe(input);
  });
});
