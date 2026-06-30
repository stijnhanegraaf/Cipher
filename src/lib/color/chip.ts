/**
 * chipColors — pure helper that mirrors the CSS .chip color-mix derivation.
 *
 * Mix ratios (locked to match globals.css .chip rules):
 *
 *   light: bg=12%  bgHover=20%  border=38%  text=72%
 *   dark:  bg=16%  bgHover=26%  border=30%  text=72%   (text same both themes)
 *
 * "hue" may be any CSS color value: a hex literal ("#d9a441"),
 * an oklch() string, or a CSS var reference ("var(--accent-violet)").
 * The returned strings are valid CSS color-mix() values that can be set
 * directly on a style attribute or used in CSS-in-JS.
 */

export type ChipTheme = "light" | "dark";

export interface ChipColorSet {
  /** Resting background */
  bg: string;
  /** Hover/selected background */
  bgHover: string;
  /** Text color */
  text: string;
  /** Border color */
  border: string;
}

/** Mix ratios per theme — single source of truth; must stay in sync with
 *  the --chip-*-mix CSS custom properties in globals.css. */
const RATIOS: Record<
  ChipTheme,
  { bg: number; bgHover: number; border: number; text: number }
> = {
  light: { bg: 12, bgHover: 20, border: 38, text: 72 },
  dark:  { bg: 16, bgHover: 26, border: 30, text: 72 },
};

function mix(hue: string, pct: number, base: string): string {
  return `color-mix(in oklab, ${hue} ${pct}%, ${base})`;
}

/**
 * Returns the bg/bgHover/text/border color-mix strings that the CSS
 * .chip class produces for the given hue and theme.
 *
 * @param hue   - CSS color value for the chip's source hue (--sc)
 * @param theme - "light" | "dark"
 */
export function chipColors(hue: string, theme: ChipTheme): ChipColorSet {
  const r = RATIOS[theme];
  return {
    bg:      mix(hue, r.bg,      "var(--bg-surface)"),
    bgHover: mix(hue, r.bgHover, "var(--bg-surface)"),
    text:    mix(hue, r.text,    "var(--text-primary)"),
    border:  mix(hue, r.border,  "transparent"),
  };
}
