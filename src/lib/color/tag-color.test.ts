/**
 * Tests for tagColor — pure, DOM-free, deterministic tag → --hue-* token mapping.
 */
import { describe, it, expect } from "vitest";
import { tagColor, HUE_PALETTE } from "./tag-color";

describe("tagColor", () => {
  // ── empty string ──────────────────────────────────────────────────────────
  it('returns "--hue-tag" for empty string', () => {
    expect(tagColor("")).toBe("--hue-tag");
  });

  // ── semantic overrides ────────────────────────────────────────────────────
  it("maps known semantic tag: idea → --hue-idea", () => {
    expect(tagColor("idea")).toBe("--hue-idea");
  });
  it("maps known semantic tag: question → --hue-question", () => {
    expect(tagColor("question")).toBe("--hue-question");
  });
  it("maps known semantic tag: warning → --hue-warning", () => {
    expect(tagColor("warning")).toBe("--hue-warning");
  });
  it("maps known semantic tag: success → --hue-success", () => {
    expect(tagColor("success")).toBe("--hue-success");
  });
  it("maps known semantic tag: done → --hue-success", () => {
    expect(tagColor("done")).toBe("--hue-success");
  });
  it("maps known semantic tag: note → --hue-note", () => {
    expect(tagColor("note")).toBe("--hue-note");
  });
  it("maps known semantic tag: bug → --hue-danger", () => {
    expect(tagColor("bug")).toBe("--hue-danger");
  });
  it("maps known semantic tag: blocked → --hue-danger", () => {
    expect(tagColor("blocked")).toBe("--hue-danger");
  });
  it("maps known semantic tag: tip → --hue-tip", () => {
    expect(tagColor("tip")).toBe("--hue-tip");
  });
  it("maps known semantic tag: example → --hue-example", () => {
    expect(tagColor("example")).toBe("--hue-example");
  });

  // ── case-insensitivity for semantic overrides ─────────────────────────────
  it("is case-insensitive for semantic overrides (Idea)", () => {
    expect(tagColor("Idea")).toBe("--hue-idea");
  });
  it("is case-insensitive for semantic overrides (WARNING)", () => {
    expect(tagColor("WARNING")).toBe("--hue-warning");
  });

  // ── fallback: determinism ─────────────────────────────────────────────────
  it("returns the same token for the same tag on repeated calls", () => {
    const t1 = tagColor("project-x");
    const t2 = tagColor("project-x");
    expect(t1).toBe(t2);
  });

  // ── fallback: valid --hue-* token ─────────────────────────────────────────
  it("fallback returns a token in the known palette", () => {
    const result = tagColor("zzz-unknown-random-tag");
    expect(HUE_PALETTE).toContain(result);
  });

  it("fallback tokens all start with --hue-", () => {
    const samples = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta"];
    for (const s of samples) {
      expect(tagColor(s)).toMatch(/^--hue-/);
    }
  });

  // ── fallback: distribution — different tags spread across palette ──────────
  it("different tags produce at least 2 distinct tokens (not all the same)", () => {
    const samples = [
      "projectA", "projectB", "work", "personal", "research",
      "finance", "health", "travel", "books", "coding",
    ];
    const tokens = new Set(samples.map(tagColor));
    expect(tokens.size).toBeGreaterThanOrEqual(2);
  });
});
