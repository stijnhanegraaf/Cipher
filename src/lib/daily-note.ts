/**
 * Pure daily-note utilities — no fs, no server imports.
 *
 * Safe to import in both client and server contexts.
 */

/**
 * Format a Date as the vault's daily basename in LOCAL time (YYYY-MM-DD).
 *
 * Uses local-time components (getFullYear/getMonth/getDate) so the result
 * matches the user's calendar date — never a UTC off-by-one.
 */
export function formatDailyDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Vault-relative path of the daily note for `date` in the detected journal
 * folder. Works with nested dirs (e.g. "wiki/journal").
 */
export function dailyNotePath(journalDir: string, date: Date): string {
  return `${journalDir}/${formatDailyDate(date)}.md`;
}

/**
 * Validate and parse a "YYYY-MM-DD" client date string.
 *
 * Returns null on any of: non-string, wrong format, or a date that does not
 * round-trip through the Date constructor (rejects roll-overs like 2026-02-30
 * and invalid months like 2026-13-01).
 */
export function parseDateParam(raw: unknown): Date | null {
  if (typeof raw !== "string") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const parts = raw.split("-").map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  // Construct at local midnight and round-trip validate component by component.
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) {
    return null;
  }
  return dt;
}

/**
 * Minimal default daily-note body.
 *
 * Frontmatter + heading + one empty section — parses cleanly through
 * parseFrontmatter with frontmatter.type === "daily".
 */
export function defaultTemplate(date: Date): string {
  const iso = formatDailyDate(date);
  return `---\ndate: ${iso}\ntype: daily\n---\n\n# ${iso}\n\n## Notes\n\n`;
}
