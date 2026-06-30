/**
 * preprocess.ts — Pure markdown string pipeline for wiki-link rewriting.
 *
 * No React imports; node-testable.
 *
 * Pipeline order (matters for Task 5):
 *   0. rewriteEmbeds  — ![[…]] → own-line `[](embed://…)` token
 *   1. rewriteWikiLinks — [[…]] → [label](vault://… | obsidian://…)
 *
 * The embed stage runs BEFORE wiki-links so the leading `!` is consumed
 * and the inner `[[…]]` is never re-matched by the wiki-link regex.
 */

import { buildObsidianUri } from "@/lib/obsidian-uri";

export interface PreprocessOptions {
  /** true  → vault:// links (onNavigate intercepts clicks)
   *  false → obsidian:// deep links (opens Obsidian directly) */
  interactive: boolean;
  /** Vault name used in obsidian:// links when interactive is false.
   *  Defaults to "Obsidian" when omitted (same default as buildObsidianUri). */
  vaultName?: string;
}

/**
 * Rewrite `![[…]]` embed tokens to `[](embed://<urlencoded-inner>)` sentinel
 * links on their OWN LINE so react-markdown doesn't nest them inside a `<p>`.
 *
 * The leading `!` is consumed here, so the subsequent `rewriteWikiLinks` pass
 * never sees the inner `[[…]]` (no double-rewrite).
 *
 * Exported for unit testing; callers should use `preprocessMarkdown`.
 */
export function rewriteEmbeds(src: string): string {
  // Replace each ![[…]] with a newline-isolated embed:// sentinel link.
  // The surrounding newlines ensure react-markdown doesn't wrap it in a <p>
  // as inline content.
  return src.replace(/!\[\[([^\]]+)\]\]/g, (_m, inner: string) => {
    return `\n[](embed://${encodeURIComponent(inner)})\n`;
  });
}

/**
 * Rewrite `[[…]]` wiki-links in `src`.
 *
 * interactive=true  → [linkText](vault://linkText)       (existing preprocessWikiLinksDataAttr)
 * interactive=false → [linkText](obsidian://open?…)      (existing preprocessWikiLinks)
 *
 * The raw inner text is used verbatim for both the label and the path,
 * preserving the behaviour of the two original functions exactly.
 */
export function rewriteWikiLinks(src: string, opts: PreprocessOptions): string {
  return src.replace(/\[\[([^\]]+)\]\]/g, (_match, linkText: string) => {
    if (opts.interactive) {
      return `[${linkText}](vault://${linkText})`;
    }
    const url = buildObsidianUri(opts.vaultName, linkText);
    return `[${linkText}](${url})`;
  });
}

/**
 * Full preprocessing pipeline.
 *   Stage 0: rewriteEmbeds  — ![[…]] → own-line embed:// sentinel
 *   Stage 1: rewriteWikiLinks — [[…]] → vault:// or obsidian://
 */
export function preprocessMarkdown(src: string, opts: PreprocessOptions): string {
  return rewriteWikiLinks(rewriteEmbeds(src), opts);
}
