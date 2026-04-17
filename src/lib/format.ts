/**
 * Shared formatting helpers. Centralized so views use the same tone and
 * precision for timestamps, source counts, and view-type labels.
 */

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/**
 * Exact relative time — "2 hours ago", "just now", "3 days ago".
 * Replaces vague words like "recent" / "fresh" where a real timestamp exists.
 */
export function formatFreshness(input: string | number | Date | undefined): string {
  if (!input) return "";
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return "";

  const diffMs = date.getTime() - Date.now();
  const absSec = Math.abs(diffMs) / 1000;

  if (absSec < 30) return "just now";

  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 365 * 24 * 60 * 60],
    ["month", 30 * 24 * 60 * 60],
    ["week", 7 * 24 * 60 * 60],
    ["day", 24 * 60 * 60],
    ["hour", 60 * 60],
    ["minute", 60],
    ["second", 1],
  ];

  for (const [unit, seconds] of units) {
    const value = diffMs / (seconds * 1000);
    if (Math.abs(value) >= 1) {
      return rtf.format(Math.round(value), unit);
    }
  }
  return "just now";
}

/**
 * View type → terminal-friendly short label. "current_work" → "current-work".
 * Kept kebab-case for monospace parity with diff / shell / path tokens.
 */
export function formatViewType(type: string): string {
  return type.replace(/_/g, "-");
}

/**
 * Pluralize a count with a singular/plural noun. "1 source" / "3 sources".
 */
export function pluralize(count: number, singular: string, plural?: string): string {
  return `${count} ${count === 1 ? singular : plural ?? singular + "s"}`;
}
