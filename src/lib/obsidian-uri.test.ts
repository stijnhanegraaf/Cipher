import { describe, it, expect } from "vitest";
import { buildObsidianUri } from "./obsidian-uri";

describe("buildObsidianUri", () => {
  it("uses the provided vault name, URI-encoded", () => {
    expect(buildObsidianUri("My Vault", "notes/a.md")).toBe(
      "obsidian://open?vault=My%20Vault&file=notes%2Fa.md"
    );
  });
  it("falls back to 'Obsidian' when name is empty/undefined", () => {
    expect(buildObsidianUri(undefined, "a.md")).toBe(
      "obsidian://open?vault=Obsidian&file=a.md"
    );
    expect(buildObsidianUri("", "a.md")).toBe(
      "obsidian://open?vault=Obsidian&file=a.md"
    );
  });
});
