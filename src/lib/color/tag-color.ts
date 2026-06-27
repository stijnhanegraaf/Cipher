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

// ─── Arc palette set (for semantic filter in tagArcColor) ────────────────────

// Module-level set so we pay the allocation once.
const _PALETTE_SET = new Set<string>(HUE_PALETTE);

// FNV-1a 32-bit hash — fast, well-distributed, dependency-free.
function _fnv32a(s: string): number {
  let h = 2166136261; // FNV offset basis (uint32)
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0; // FNV prime; keep unsigned 32-bit
  }
  return h;
}

// ─── tagArcColor ─────────────────────────────────────────────────────────────

/**
 * Map a tag string to a HUE_PALETTE token for arc segment coloring.
 *
 * Deterministic per-tag color so arc segments are distinguishable:
 *   1. Semantic override — reuses SEMANTIC map (only entries in HUE_PALETTE).
 *   2. Hash fallback — FNV-1a hash into HUE_PALETTE for all other tags.
 *
 * "" → "--hue-tag" (untagged uses the neutral palette default).
 * Node body color is unchanged — this color is ONLY for arc segments.
 *
 * @param tag - Normalized tag (no leading #). Use "" for untagged nodes.
 * @returns   A HueToken that is always a member of HUE_PALETTE.
 */
export function tagArcColor(tag: string): HueToken {
  if (!tag) return "--hue-tag";
  const lower = tag.toLowerCase();
  const semantic = SEMANTIC[lower];
  // Only use the semantic value if it is a HUE_PALETTE member (excludes
  // alias tokens like --hue-tip / --hue-example that are not in the palette).
  if (semantic !== undefined && _PALETTE_SET.has(semantic)) {
    return semantic as HueToken;
  }
  return HUE_PALETTE[_fnv32a(lower) % HUE_PALETTE.length];
}

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
