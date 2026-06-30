/**
 * embed.ts — Parse the inner body of an `![[...]]` embed token.
 *
 * Pure, no-React, node-testable. Reuses parseWikiTarget for the
 * target/anchor/alias split — `![[...]]` has the same inner grammar
 * as `[[...]]`.
 */

import { parseWikiTarget } from "./wikilink";

export type EmbedKind = "note" | "image" | "pdf" | "av";

export interface ParsedEmbed {
  /** File/note path body — anchor and alias stripped. */
  target: string;
  /** Heading text or block id (leading `^` stripped); null when none. */
  anchor: string | null;
  /** Display alias; null when none. */
  alias: string | null;
  /** True when the anchor referred to a block reference (`^id`). */
  isBlockRef: boolean;
  /** Classified by target file extension. */
  kind: EmbedKind;
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg|bmp)$/i;
const PDF_EXT = /\.pdf$/i;
const AV_EXT = /\.(mp4|webm|mov|ogg|mp3|wav|m4a)$/i;

/**
 * Parse the inner body of an `![[...]]` embed.
 *
 * Examples:
 *   `parseEmbed("note")` → `{ target:"note", anchor:null, alias:null, isBlockRef:false, kind:"note" }`
 *   `parseEmbed("note#Heading")` → `{ anchor:"Heading", isBlockRef:false, ... }`
 *   `parseEmbed("note#^abc")` → `{ anchor:"abc", isBlockRef:true, ... }`
 *   `parseEmbed("image.png")` → `{ kind:"image", ... }`
 */
export function parseEmbed(inner: string): ParsedEmbed {
  const { target, alias, anchor: rawAnchor } = parseWikiTarget(inner);

  const isBlockRef = !!rawAnchor && rawAnchor.startsWith("^");
  // Strip the leading `^` from a block-ref anchor so callers get the bare id.
  const anchor = isBlockRef ? rawAnchor!.slice(1) : rawAnchor;

  let kind: EmbedKind = "note";
  if (IMAGE_EXT.test(target)) kind = "image";
  else if (PDF_EXT.test(target)) kind = "pdf";
  else if (AV_EXT.test(target)) kind = "av";

  return { target, anchor, alias, isBlockRef, kind };
}

/**
 * Global regex that matches a single `![[...]]` embed token.
 * Reset `.lastIndex` between uses when used statefully.
 */
export const EMBED_RE = /!\[\[([^\]]+)\]\]/g;
