import { describe, it, expect } from "vitest";
import {
  closeOpenFences,
  sanitizeStreamingMarkdown,
  CITATION_SENTINEL_OPEN,
  CITATION_SENTINEL_CLOSE,
} from "./streaming";

// ─── closeOpenFences ────────────────────────────────────────────────────────

describe("closeOpenFences", () => {
  it("1: no fence → unchanged", () => {
    expect(closeOpenFences("Hello world")).toBe("Hello world");
  });

  it("2: one open ```ts line with no closer → appends closing ```", () => {
    const input = "```ts\nconst x = 1;";
    const result = closeOpenFences(input);
    expect(result).toBe("```ts\nconst x = 1;\n```");
  });

  it("3: balanced open + close → unchanged", () => {
    const input = "```ts\nconst x = 1;\n```";
    expect(closeOpenFences(input)).toBe(input);
  });

  it("4: ~~~ fences handled same as backtick fences", () => {
    const input = "~~~python\nprint('hi')";
    const result = closeOpenFences(input);
    expect(result).toBe("~~~python\nprint('hi')\n~~~");
  });

  it("5: fenced block containing ** does not trigger emphasis handling", () => {
    const input = "```\n**not bold**\n```";
    expect(closeOpenFences(input)).toBe(input);
  });

  it("6: indented/4-space code is not treated as a fence", () => {
    const input = "    const x = 1;";
    expect(closeOpenFences(input)).toBe(input);
  });
});

// ─── sanitizeStreamingMarkdown ───────────────────────────────────────────────

// Alias imported sentinel constants so test references below remain readable
const CITE_OPEN = CITATION_SENTINEL_OPEN;
const CITE_CLOSE = CITATION_SENTINEL_CLOSE;

describe("sanitizeStreamingMarkdown – active:true", () => {
  it("7: dangling ** trimmed, content without trailing emphasis marker", () => {
    const result = sanitizeStreamingMarkdown("Plan **bold", { active: true });
    // The trailing ** should be removed so it doesn't leak
    expect(result).not.toMatch(/\*\*$/);
    // 'Plan' and 'bold' text is still present
    expect(result).toContain("Plan");
    expect(result).toContain("bold");
  });

  it("8: open inline backtick removed", () => {
    const result = sanitizeStreamingMarkdown("see `cod", { active: true });
    // Trailing dangling backtick dropped
    expect(result).not.toMatch(/`$/);
    expect(result).toContain("see");
    expect(result).toContain("cod");
  });

  it("9: [^2] marker → sentinel", () => {
    const result = sanitizeStreamingMarkdown("per the note [^2]", { active: true });
    expect(result).toContain(`${CITE_OPEN}2${CITE_CLOSE}`);
    expect(result).not.toContain("[^2]");
  });

  it("10: protect-first: bold intact AND citation sentinel present (ordering)", () => {
    // This is the load-bearing test: citation protection must run BEFORE
    // any other transform, otherwise remark-gfm would eat [^1] as a footnote
    const result = sanitizeStreamingMarkdown("**done** and [^1] mid", { active: true });
    // Bold markers still present (text is complete, so ** balanced)
    expect(result).toContain("**done**");
    // Citation is protected
    expect(result).toContain(`${CITE_OPEN}1${CITE_CLOSE}`);
    // Original [^1] is gone
    expect(result).not.toContain("[^1]");
  });

  it("11: half link [label]( → neutralized so no anchor node", () => {
    const result = sanitizeStreamingMarkdown("a [label](", { active: true });
    // Should not end with an open link
    expect(result).not.toMatch(/\[label\]\($/);
    expect(result).toContain("label");
  });

  it("12: open math $ → trailing $ stripped", () => {
    const result = sanitizeStreamingMarkdown("E = $x +", { active: true });
    expect(result).not.toMatch(/\$x \+$/);
    // The $ should be stripped since it's unmatched
    expect(result).not.toMatch(/\$$/);
  });

  it("13: open block math $$ → stripped", () => {
    const result = sanitizeStreamingMarkdown("$$\\int_0^1", { active: true });
    expect(result).not.toMatch(/\$\$\\int_0\^1$/);
  });

  it("14: multiple [^1] ... [^1] → both produce sentinels", () => {
    const result = sanitizeStreamingMarkdown("see [^1] and also [^1]", { active: true });
    const matches = [...result.matchAll(new RegExp(`${CITE_OPEN}1${CITE_CLOSE}`, "g"))];
    expect(matches).toHaveLength(2);
  });

  it("15: active:false → returns input verbatim (no sentinels, no fence closing)", () => {
    const raw = "```ts\nconst x = [^1] ** open";
    const result = sanitizeStreamingMarkdown(raw, { active: false });
    expect(result).toBe(raw);
  });

  it("16: monotonic-prefix: stable leading region never regresses as more text streams in", () => {
    // Realistic final string covering bold, partial-then-complete **emphasis**,
    // a [^1] citation, and an opening-then-closing code fence.
    // The sanitizer only edits the tail (the unresolved region); content
    // that was already stable must never disappear or change as more tokens arrive.
    const full =
      "Here is **bold** text and a note [^1] then partial **emph" +
      "asis** and finally:\n```ts\nconst x = 1;\n```\ndone";

    const outputs: string[] = [];
    for (let k = 1; k <= full.length; k++) {
      outputs.push(sanitizeStreamingMarkdown(full.slice(0, k), { active: true }));
    }

    // For every adjacent pair (earlier, later), the leading 60% of the earlier
    // output must be a prefix of the later output.  This is the STABLE-PREFIX
    // invariant: the sanitizer only mutates the tail, never the head.
    for (let i = 0; i < outputs.length - 1; i++) {
      const earlier = outputs[i];
      const later = outputs[i + 1];
      const stableLen = Math.floor(earlier.length * 0.6);
      if (stableLen > 0) {
        const stableRegion = earlier.slice(0, stableLen);
        expect(later.startsWith(stableRegion)).toBe(true);
      }
    }
  });

  it("16b: monotonic-prefix with citations: earlier sentinel not removed as more text streams", () => {
    const texts = [
      "See [^1]",
      "See [^1] for",
      "See [^1] for more",
      "See [^1] for more **detail",
    ];
    const results = texts.map((t) => sanitizeStreamingMarkdown(t, { active: true }));
    // Once [^1] is protected in the first result, all subsequent must also have it
    for (const r of results) {
      expect(r).toContain(`${CITE_OPEN}1${CITE_CLOSE}`);
    }
  });

  it("unmatched single * trimmed", () => {
    const result = sanitizeStreamingMarkdown("text *italic", { active: true });
    expect(result).not.toMatch(/\*$/);
  });

  it("unmatched ~~ trimmed", () => {
    const result = sanitizeStreamingMarkdown("text ~~strike", { active: true });
    expect(result).not.toMatch(/~~$/);
  });
});
