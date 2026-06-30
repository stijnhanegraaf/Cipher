export interface WikiTarget {
  target: string;
  alias: string | null;
  anchor: string | null;
}

/**
 * Shared wiki-link regex.  Matches `[[target]]` and `[[target|alias]]`
 * forms.  The character class `[^\]\\|]` excludes `]`, `\`, and `|` so
 * an escaped pipe inside a Markdown table (`[[work/work\|Work]]`) terminates
 * the path correctly instead of letting a trailing backslash leak into the
 * captured group.  Used by both `extractLinks` (vault-reader) and
 * `extractMentionSnippets` (backlinks) so they match identically.
 */
export const WIKILINK_RE = /\[\[([^\]\\|]+?)(?:\|([^\]]+?))?\]\]/g;

/**
 * Parse the inner text of a `[[...]]` wiki-link into its parts.
 * Forms: `target`, `target|alias`, `target#anchor`, `target#anchor|alias`.
 * A leading `^` on the anchor denotes a block reference.
 */
export function parseWikiTarget(inner: string): WikiTarget {
  let rest = inner.trim();
  let alias: string | null = null;
  const pipe = rest.indexOf("|");
  if (pipe !== -1) {
    alias = rest.slice(pipe + 1).trim() || null;
    rest = rest.slice(0, pipe).trim();
  }
  let anchor: string | null = null;
  const hash = rest.indexOf("#");
  if (hash !== -1) {
    anchor = rest.slice(hash + 1).trim() || null;
    rest = rest.slice(0, hash).trim();
  }
  return { target: rest, alias, anchor };
}
