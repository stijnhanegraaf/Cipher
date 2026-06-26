/**
 * Pure frontmatter-badge utilities.
 *
 * Decides which frontmatter keys render as visible badges in the detail view
 * and maps their values to semantic color variants.
 *
 * No filesystem access, no React — Node-testable.
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

export type BadgeVariant = "default" | "success" | "warning" | "indigo" | "outline";

export interface Badge {
  key: string;
  value: string;
  variant: BadgeVariant;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

/** Frontmatter keys that render as badges, in display order. */
const BADGE_KEYS = ["type", "area", "status", "kind", "priority", "freshness"] as const;

const SUCCESS_VALUES = new Set(["active", "done", "complete", "healthy", "ok", "fresh", "live"]);
const WARNING_VALUES = new Set(["stale", "deprecated", "archived", "inactive"]);
const INDIGO_VALUES = new Set(["project", "entity", "system", "area"]);

// ─── getBadgeVariant ───────────────────────────────────────────────────────────

/**
 * Map a frontmatter key+value pair to a semantic badge variant.
 *
 * The `key` parameter is accepted for signature symmetry with the
 * decomposition spec (enables future key-specific overrides); currently
 * only `value` drives variant selection.
 *
 * @param key   The frontmatter key (e.g. "status", "type").
 * @param value The string value of that key.
 */
export function getBadgeVariant(key: string, value: string): BadgeVariant {
  void key; // reserved for future key-specific variant rules
  const lower = value.toLowerCase();
  if (SUCCESS_VALUES.has(lower)) return "success";
  if (WARNING_VALUES.has(lower)) return "warning";
  if (INDIGO_VALUES.has(lower)) return "indigo";
  return "outline";
}

// ─── selectFrontmatterBadges ───────────────────────────────────────────────────

/**
 * Collect the subset of frontmatter entries that should render as badges.
 *
 * Returns only the badge keys defined in `BADGE_KEYS`, in their declared
 * order, where the frontmatter value is a non-empty string.
 */
export function selectFrontmatterBadges(frontmatter: Record<string, unknown>): Badge[] {
  const badges: Badge[] = [];
  for (const key of BADGE_KEYS) {
    const raw = frontmatter[key];
    if (typeof raw !== "string" || !raw.trim()) continue;
    badges.push({ key, value: raw, variant: getBadgeVariant(key, raw) });
  }
  return badges;
}
