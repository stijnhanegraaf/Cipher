/**
 * preprocess.ts — Pure markdown string pipeline for wiki-link rewriting.
 *
 * No React imports; node-testable.
 *
 * Pipeline order (matters for Task 5):
 *   1. rewriteWikiLinks — [[…]] → [label](vault://… | obsidian://…)
 *
 * Seam for Task 5: add rewriteEmbeds(![[…]]) as stage 0 before this.
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
 * Full preprocessing pipeline. Currently only wiki-link rewriting.
 * Stage for embed rewriting (![[…]]) will be inserted here in Task 5,
 * before rewriteWikiLinks, so the leading "!" is consumed first.
 */
export function preprocessMarkdown(src: string, opts: PreprocessOptions): string {
  // Task 5 seam: return rewriteEmbeds(rewriteWikiLinks(src, opts), opts);
  return rewriteWikiLinks(src, opts);
}
