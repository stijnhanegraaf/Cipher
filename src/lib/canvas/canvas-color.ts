/**
 * canvas-color.ts — maps Obsidian Canvas preset colors (1–6) to Cipher
 * design-system tokens.
 *
 * Obsidian presets: 1=red 2=orange 3=yellow 4=green 5=cyan 6=purple.
 * All values are CSS custom property references so they work in both
 * light and dark themes without any source-literal hex.
 */

export const CANVAS_PRESET_TOKEN: Record<1 | 2 | 3 | 4 | 5 | 6, string> = {
  1: "var(--hue-danger)",    // red
  2: "var(--hue-warning)",   // orange
  3: "var(--hue-idea)",      // yellow/amber
  4: "var(--hue-success)",   // green
  5: "var(--hue-question)",  // cyan/teal
  6: "var(--hue-tag)",       // purple
};

import type { CanvasColor } from "./parse-canvas";

/**
 * Resolve a CanvasColor to a CSS color value string:
 * - preset → CSS custom property token (light/dark-safe)
 * - hex    → the raw hex string from the parsed file data
 *            (NOT a source literal; no-raw-color rule is not triggered)
 * - null   → undefined (caller falls back to inherit/var)
 */
export function resolveCanvasColor(color: CanvasColor): string | undefined {
  if (!color) return undefined;
  if (color.kind === "preset") return CANVAS_PRESET_TOKEN[color.preset];
  return color.hex;
}
