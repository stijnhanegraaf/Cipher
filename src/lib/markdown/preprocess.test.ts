import { describe, it, expect } from "vitest";
import { preprocessMarkdown } from "./preprocess";

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
