export type CalloutType =
  | "note"
  | "abstract"
  | "info"
  | "tip"
  | "success"
  | "question"
  | "warning"
  | "failure"
  | "danger"
  | "bug"
  | "example"
  | "quote";

export interface Callout {
  /** Canonical, lowercased, alias-resolved type (drives hue + icon + class). */
  type: CalloutType;
  /** The raw token as written, lowercased, BEFORE alias resolution (e.g. "hint", "cite"). */
  rawType: string;
  /** Custom title text after the marker, or null — caller uses the default title. */
  title: string | null;
  /** True when the marker carries a fold sign (`-` or `+`). */
  foldable: boolean;
  /** Initial open state: `+` → true, `-` → false; non-foldable → true. */
  defaultOpen: boolean;
}

const CALLOUT_RE = /^\s*>?\s*\[!([^\]]+)\]([-+]?)\s*(.*)\s*$/;

/**
 * The marker prefix regex — matches `[!type][-+]? ` (with optional leading `>`)
 * at the start of a text node. Exported so render-layer helpers can reuse it
 * without duplicating the pattern (Fix 2: single source of truth).
 */
export const CALLOUT_MARKER_RE = /^\s*>?\s*\[![^\]]+\][-+]?\s*/;

/**
 * Strip the callout marker prefix AND the optional title text from a raw
 * first-paragraph string, returning the leftover body text (trimmed).
 * Returns an empty string when the line is entirely consumed.
 *
 * `title` must be the exact string returned by `parseCallout().title` (already
 * trimmed). When non-null we remove it from the text that remains after the
 * marker, handling the common Obsidian single-line case:
 *   `[!note] My Title`  →  marker stripped → `My Title` → title stripped → `""`
 *
 * Exported for unit-testing and to keep components.tsx free of inline regex.
 */
export function stripCalloutLine(text: string, title: string | null): string {
  const withoutMarker = text.replace(CALLOUT_MARKER_RE, "");
  if (title === null) return withoutMarker.trimStart();
  // Remove the leading title text if present (handles the titled single-line case)
  const afterTitle = withoutMarker.trimStart().startsWith(title)
    ? withoutMarker.trimStart().slice(title.length).trimStart()
    : withoutMarker.trimStart();
  return afterTitle;
}

const CANONICAL_TYPES = new Set<CalloutType>([
  "note", "abstract", "info", "tip", "success", "question",
  "warning", "failure", "danger", "bug", "example", "quote",
]);

const ALIAS_MAP: Record<string, CalloutType> = {
  // abstract
  summary: "abstract",
  tldr: "abstract",
  // tip
  hint: "tip",
  important: "tip",
  // success
  check: "success",
  done: "success",
  // question
  help: "question",
  faq: "question",
  // warning
  caution: "warning",
  attention: "warning",
  // failure
  fail: "failure",
  missing: "failure",
  // danger
  error: "danger",
  // quote
  cite: "quote",
};

/**
 * Parse the FIRST LINE of a blockquote into callout metadata.
 * Syntax (Obsidian): `[!type]`, `[!type] Custom Title`,
 * `[!type]-` (collapsed), `[!type]+` (expanded by default).
 * Leading `>` and surrounding whitespace are tolerated.
 * Returns null when the line is not a callout marker.
 */
export function parseCallout(firstLine: string): Callout | null {
  const match = CALLOUT_RE.exec(firstLine);
  if (!match) return null;

  const rawType = match[1].trim().toLowerCase();
  if (!rawType) return null;

  const sign = match[2]; // "-", "+", or ""
  const titleRaw = match[3].trim();

  const canonicalFromSet = CANONICAL_TYPES.has(rawType as CalloutType)
    ? (rawType as CalloutType)
    : undefined;
  const type: CalloutType = canonicalFromSet ?? ALIAS_MAP[rawType] ?? "note";

  const foldable = sign !== "";
  const defaultOpen = sign === "+" ? true : sign === "-" ? false : true;
  const title = titleRaw.length > 0 ? titleRaw : null;

  return { type, rawType, title, foldable, defaultOpen };
}
