/**
 * Tests for tagColor and statusTagColor — pure, DOM-free, deterministic
 * tag → CSS custom-property name mapping.
 */
import { describe, it, expect } from "vitest";
import { tagColor, statusTagColor, HUE_PALETTE } from "./tag-color";

describe("tagColor", () => {
  // ── empty string ──────────────────────────────────────────────────────────
  it('returns "--text-tertiary" for empty string', () => {
    expect(tagColor("")).toBe("--text-tertiary");
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

  // ── unknown tags → --text-tertiary (no random hash) ───────────────────────
  it('unknown tag returns "--text-tertiary" (not a hashed hue)', () => {
    expect(tagColor("project-x")).toBe("--text-tertiary");
  });
  it('completely unknown tag returns "--text-tertiary"', () => {
    expect(tagColor("zzz-unknown-random-tag")).toBe("--text-tertiary");
  });
  it("different unknown tags all return --text-tertiary", () => {
    const samples = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta"];
    for (const s of samples) {
      expect(tagColor(s)).toBe("--text-tertiary");
    }
  });

  // ── HUE_PALETTE is still exported ─────────────────────────────────────────
  it("HUE_PALETTE is exported and non-empty", () => {
    expect(HUE_PALETTE.length).toBeGreaterThan(0);
  });
});

describe("statusTagColor", () => {
  // ── success group ─────────────────────────────────────────────────────────
  it('"done" → --hue-success', () => {
    expect(statusTagColor("done")).toBe("--hue-success");
  });
  it('"success" → --hue-success', () => {
    expect(statusTagColor("success")).toBe("--hue-success");
  });
  it('"tip" → --hue-success', () => {
    expect(statusTagColor("tip")).toBe("--hue-success");
  });
  it('"hint" → --hue-success', () => {
    expect(statusTagColor("hint")).toBe("--hue-success");
  });

  // ── danger group ──────────────────────────────────────────────────────────
  it('"bug" → --hue-danger', () => {
    expect(statusTagColor("bug")).toBe("--hue-danger");
  });
  it('"blocked" → --hue-danger', () => {
    expect(statusTagColor("blocked")).toBe("--hue-danger");
  });
  it('"danger" → --hue-danger', () => {
    expect(statusTagColor("danger")).toBe("--hue-danger");
  });
  it('"error" → --hue-danger', () => {
    expect(statusTagColor("error")).toBe("--hue-danger");
  });

  // ── default: everything else → --text-tertiary ────────────────────────────
  it('"random" → --text-tertiary', () => {
    expect(statusTagColor("random")).toBe("--text-tertiary");
  });
  it('"" → --text-tertiary', () => {
    expect(statusTagColor("")).toBe("--text-tertiary");
  });
  it('"idea" (not a status tag) → --text-tertiary', () => {
    expect(statusTagColor("idea")).toBe("--text-tertiary");
  });

  // ── case-insensitive ──────────────────────────────────────────────────────
  it("is case-insensitive: Done → --hue-success", () => {
    expect(statusTagColor("Done")).toBe("--hue-success");
  });
  it("is case-insensitive: BUG → --hue-danger", () => {
    expect(statusTagColor("BUG")).toBe("--hue-danger");
  });
  it("is case-insensitive: ERROR → --hue-danger", () => {
    expect(statusTagColor("ERROR")).toBe("--hue-danger");
  });
});
