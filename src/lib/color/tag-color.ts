/**
 * tagColor — pure, DOM-free, deterministic tag → CSS custom-property name.
 *
 * Returns a CSS custom-property token name (e.g. "--hue-idea" or
 * "--text-tertiary"). Resolution from token name to a canvas-usable literal
 * happens at the draw boundary via getComputedStyle (see GraphCanvas.tsx).
 *
 * Two layers:
 *   1. Semantic overrides — well-known tag names map to intent tokens.
 *   2. Default — unknown tags return "--text-tertiary" (no random colors).
 *
 * For the status-restrained default path (fewer colors), use statusTagColor.
 *
 * "" → "--text-tertiary" (untagged is neutral by default).
 */

// ─── Palette ─────────────────────────────────────────────────────────────────

/**
 * The full set of --hue-* tokens in the semantic palette.
 * Kept for reference and for GraphLegend / rainbow-mode consumers.
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

const SEMANTIC: Readonly<Record<string, string>> = {
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

// ─── Status overrides (restrained: success + danger only) ────────────────────

const STATUS_SUCCESS = new Set(["done", "success", "tip", "hint"]);
const STATUS_DANGER  = new Set(["bug", "blocked", "danger", "error"]);

// ─── tagColor ─────────────────────────────────────────────────────────────────

/**
 * Map a tag string to a CSS custom-property token name.
 *
 * This is the "rainbow" / full-color path — use it only when the rainbow
 * toggle is active. Semantic tags map to their intent token; unknown tags
 * return "--text-tertiary" (no random colors).
 *
 * @param tag - Normalized tag (no leading #). Use "" for untagged notes.
 * @returns   A token name like "--hue-idea" or "--text-tertiary".
 */
export function tagColor(tag: string): string {
  if (!tag) return "--text-tertiary";

  const lower = tag.toLowerCase();
  return SEMANTIC[lower] ?? "--text-tertiary";
}

// ─── statusTagColor ───────────────────────────────────────────────────────────

/**
 * Map a tag string to a restrained status color token.
 *
 * This is the DEFAULT (mono + 2-hue) path shown before the user opts in to
 * the rainbow palette. Only status-meaningful tags get color; everything else
 * is neutral.
 *
 * @param tag - Normalized tag (no leading #). Use "" for untagged notes.
 * @returns   "--hue-success", "--hue-danger", or "--text-tertiary".
 */
export function statusTagColor(tag: string): string {
  if (!tag) return "--text-tertiary";

  const lower = tag.toLowerCase();

  if (STATUS_SUCCESS.has(lower)) return "--hue-success";
  if (STATUS_DANGER.has(lower))  return "--hue-danger";
  return "--text-tertiary";
}
