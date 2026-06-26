/**
 * tagColor — pure, DOM-free, deterministic tag → CSS custom-property name.
 *
 * Returns a --hue-* token NAME (e.g. "--hue-idea"), never a literal color.
 * Resolution from token name to a canvas-usable literal happens at the
 * draw boundary via getComputedStyle (see GraphCanvas.tsx).
 *
 * Two layers:
 *   1. Semantic overrides — well-known tag names map to intent tokens.
 *   2. FNV-1a hash fallback — any other tag hashes deterministically into
 *      the HUE_PALETTE ring.
 *
 * "" → "--hue-tag" (the generic untagged color).
 */

// ─── Palette ─────────────────────────────────────────────────────────────────

/**
 * The full set of --hue-* tokens that tagColor may return.
 * Order is preserved for the hash ring — changing order changes assignments.
 */
export const HUE_PALETTE = [
  "--hue-tag",
  "--hue-note",
  "--hue-idea",
  "--hue-question",
  "--hue-warning",
  "--hue-success",
  "--hue-danger",
] as const;

/** Any --hue-* CSS custom property name. */
export type HueToken = `--hue-${string}`;

// ─── Semantic overrides ───────────────────────────────────────────────────────

const SEMANTIC: Readonly<Record<string, HueToken>> = {
  // idea / amber
  idea:     "--hue-idea",
  // question / blue
  question: "--hue-question",
  // warning / amber-orange
  warning:  "--hue-warning",
  warn:     "--hue-warning",
  // success / green
  success:  "--hue-success",
  done:     "--hue-success",
  // note / brand-blue
  note:     "--hue-note",
  doc:      "--hue-note",
  // danger / red
  bug:      "--hue-danger",
  blocked:  "--hue-danger",
  danger:   "--hue-danger",
  error:    "--hue-danger",
  // tip / hint (resolves via --hue-tip which chains to --hue-success in CSS)
  tip:      "--hue-tip",
  hint:     "--hue-tip",
  // example (resolves via --hue-example which chains to --hue-idea in CSS)
  example:  "--hue-example",
};

// ─── FNV-1a hash fallback ─────────────────────────────────────────────────────

/**
 * FNV-1a 32-bit hash (unsigned). Deterministic across JS engines.
 * Returns a non-negative integer.
 */
function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    // 32-bit multiply via the FNV prime (0x01000193)
    h = Math.imul(h, 0x01000193);
  }
  // Convert signed int32 to unsigned via >>> 0
  return h >>> 0;
}

// ─── tagColor ─────────────────────────────────────────────────────────────────

/**
 * Map a tag string to a --hue-* CSS custom-property name.
 *
 * @param tag - Normalized tag (no leading #). Use "" for untagged notes.
 * @returns   A token name like "--hue-idea". Never a literal color value.
 */
export function tagColor(tag: string): HueToken {
  if (!tag) return "--hue-tag";

  const lower = tag.toLowerCase();

  const override = SEMANTIC[lower];
  if (override !== undefined) return override;

  // Fallback: hash into the HUE_PALETTE ring.
  const idx = fnv1a32(lower) % HUE_PALETTE.length;
  return HUE_PALETTE[idx] as HueToken;
}
