/**
 * Pure audit-parsing functions — no filesystem I/O.
 *
 * Consumes the shared `parseTable` output from vault-reader and emits the
 * design-system status vocabulary (`ok | warn | error | unknown`).
 *
 * Column resolution is by HEADER NAME (case-insensitive), not by position,
 * so audit tables with columns in any order parse correctly.
 *
 * Default status is `unknown` — never silently green. This fixes the old
 * default-to-green bug in the legacy route.
 */

import type { TableData } from "@/lib/vault-reader";

export type AuditStatus = "ok" | "warn" | "error" | "unknown";

export interface AuditEntry {
  name: string;
  status: AuditStatus;
  lastRun: string;
  details: string;
}

export interface AuditDashboardData {
  overallStatus: AuditStatus;
  audits: AuditEntry[];
}

/**
 * Map a single emoji character (or a string containing one) to an AuditStatus.
 *
 * 🟢 → ok, 🟡 → warn, 🔴 → error, anything else → unknown.
 * Defaults to `unknown` when the input is empty or unrecognised.
 */
export function emojiToStatus(s: string): AuditStatus {
  if (s.includes("🟢")) return "ok";
  if (s.includes("🟡")) return "warn";
  if (s.includes("🔴")) return "error";
  return "unknown";
}

/**
 * Parse the overall dashboard status from the dashboard.md body.
 *
 * Matches `## Right now: 🟡` (or any of the three status emojis).
 * Returns `unknown` when the section is absent or the emoji is missing.
 */
export function parseOverallStatus(body: string): AuditStatus {
  const match = body.match(/^##\s+Right now:\s*(🟢|🟡|🔴)/m);
  if (match) return emojiToStatus(match[1]);
  return "unknown";
}

/**
 * Parse the status from an individual `latest-<audit>.md` file body.
 *
 * Matches a `## Status` section followed immediately by a status emoji on the
 * next non-blank line. Returns `unknown` when the section is absent.
 */
export function parseLatestStatus(body: string): AuditStatus {
  const match = body.match(/^##\s+Status\s*\n\s*(🟢|🟡|🔴)/m);
  if (match) return emojiToStatus(match[1]);
  return "unknown";
}

/**
 * Find a column header by predicate, returning the original header string or null.
 *
 * Searches `lowered` (lowercased headers) using each predicate in order;
 * returns the original-case header from `headers` on first match.
 */
function findCol(
  headers: string[],
  lowered: string[],
  predicates: Array<(h: string) => boolean>
): string | null {
  for (const pred of predicates) {
    const i = lowered.findIndex(pred);
    if (i >= 0) return headers[i];
  }
  return null;
}

/**
 * Parse audit rows from a `parseTable()` result.
 *
 * Columns are resolved by header name (case-insensitive):
 *   - name column: header equal to "audit" or "name", or any header containing
 *     "audit" or "name"; falls back to the first column.
 *   - status column: header containing "status".
 *   - lastRun column: header containing "last" or "run".
 *   - details column: header containing "detail" or "note".
 *
 * `"-"` lastRun values are normalised to `""`.
 * Rows with an empty name are skipped.
 * Missing status → `unknown` (never silently `ok`).
 *
 * @param table  Output of `parseTable(content)` from `@/lib/vault-reader`.
 */
export function parseAuditRows(table: TableData): AuditEntry[] {
  if (!table.rows.length) return [];

  const { headers } = table;
  const lowered = headers.map((h) => h.toLowerCase());

  const nameCol = findCol(headers, lowered, [
    (h) => h === "audit" || h === "name",
    (h) => h.includes("audit") || h.includes("name"),
  ]) ?? headers[0] ?? null;

  const statusCol = findCol(headers, lowered, [
    (h) => h.includes("status"),
  ]);

  const lastRunCol = findCol(headers, lowered, [
    (h) => h.includes("last") || h.includes("run"),
  ]);

  const detailsCol = findCol(headers, lowered, [
    (h) => h.includes("detail") || h.includes("note") || h.includes("comment"),
  ]);

  const entries: AuditEntry[] = [];

  for (const row of table.rows) {
    const name = nameCol ? (row[nameCol] ?? "").trim() : "";
    if (!name) continue;

    const statusRaw = statusCol ? (row[statusCol] ?? "").trim() : "";
    const lastRunRaw = lastRunCol ? (row[lastRunCol] ?? "").trim() : "";
    const detailsRaw = detailsCol ? (row[detailsCol] ?? "").trim() : "";

    entries.push({
      name,
      status: emojiToStatus(statusRaw),
      lastRun: lastRunRaw === "-" ? "" : lastRunRaw,
      details: detailsRaw,
    });
  }

  return entries;
}
