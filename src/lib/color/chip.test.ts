import { describe, it, expect } from "vitest";
import { chipColors } from "./chip";

/**
 * Mix ratios as defined in globals.css and chip.ts (locked here so
 * CSS and TS derivation must agree):
 *
 *   light: bg=12%  bg-hi=20%  border=38%  text=72%
 *   dark:  bg=16%  bg-hi=26%  border=30%  text=72%
 *
 * Mixing targets:
 *   bg/bg-hi  mix against var(--bg-surface)    — represented as the string "var(--bg-surface)"
 *   border    mix against transparent           — represented as "transparent"
 *   text      mix against var(--text-primary)   — represented as "var(--text-primary)"
 */

const HUE = "#d9a441";

describe("chipColors – light theme", () => {
  const c = chipColors(HUE, "light");

  it("bg uses 12% hue into --bg-surface", () => {
    expect(c.bg).toBe(
      `color-mix(in oklab, ${HUE} 12%, var(--bg-surface))`
    );
  });

  it("text uses 72% hue into --text-primary", () => {
    expect(c.text).toBe(
      `color-mix(in oklab, ${HUE} 72%, var(--text-primary))`
    );
  });

  it("border uses 38% hue into transparent", () => {
    expect(c.border).toBe(
      `color-mix(in oklab, ${HUE} 38%, transparent)`
    );
  });
});

describe("chipColors – dark theme", () => {
  const c = chipColors(HUE, "dark");

  it("bg uses 16% hue into --bg-surface", () => {
    expect(c.bg).toBe(
      `color-mix(in oklab, ${HUE} 16%, var(--bg-surface))`
    );
  });

  it("text uses 72% hue into --text-primary", () => {
    expect(c.text).toBe(
      `color-mix(in oklab, ${HUE} 72%, var(--text-primary))`
    );
  });

  it("border uses 30% hue into transparent", () => {
    expect(c.border).toBe(
      `color-mix(in oklab, ${HUE} 30%, transparent)`
    );
  });
});

describe("chipColors – hover/selected ratios", () => {
  it("light: bgHover uses 20% hue", () => {
    const c = chipColors(HUE, "light");
    expect(c.bgHover).toBe(
      `color-mix(in oklab, ${HUE} 20%, var(--bg-surface))`
    );
  });

  it("dark: bgHover uses 26% hue", () => {
    const c = chipColors(HUE, "dark");
    expect(c.bgHover).toBe(
      `color-mix(in oklab, ${HUE} 26%, var(--bg-surface))`
    );
  });
});

describe("chipColors – accepts CSS var hue reference", () => {
  it("works when hue is a CSS var string (for reference tests)", () => {
    const hue = "var(--accent-violet)";
    const c = chipColors(hue, "dark");
    expect(c.bg).toBe(`color-mix(in oklab, ${hue} 16%, var(--bg-surface))`);
    expect(c.text).toBe(`color-mix(in oklab, ${hue} 72%, var(--text-primary))`);
    expect(c.border).toBe(`color-mix(in oklab, ${hue} 30%, transparent)`);
  });
});
