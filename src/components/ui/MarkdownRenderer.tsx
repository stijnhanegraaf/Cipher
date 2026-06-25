"use client";

/**
 * MarkdownRenderer — react-markdown wrapper with wiki-link rewriting,
 * GFM, and Cipher-styled elements (headings, tasks, tables).
 *
 * This is a thin shell: preprocessing + effect wiring only.
 * All component overrides live in ./markdown/components.tsx.
 */

import React, { useEffect, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkUnwrapImages from "remark-unwrap-images";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import { CheckboxIndicator, StatusDot } from "./StatusDot";
import { buildObsidianUri } from "@/lib/obsidian-uri";
import { ensureHljsCss } from "./markdown/hljs-theme";
import { createMarkdownComponents } from "./markdown/components";

// Re-export for backward compatibility with existing imports.
export { CheckboxIndicator, StatusDot };

interface MarkdownRendererProps {
  content: string;
  className?: string;
  onNavigate?: (path: string) => void;
}

// ─── Wiki-link preprocessor ────────────────────────────────────────
// Converts [[wiki links]] to [wiki links](obsidian://open?vault=<name>&file=PATH)
// before react-markdown processes the content.
function preprocessWikiLinks(markdown: string, vaultName?: string): string {
  return markdown.replace(/\[\[([^\]]+)\]\]/g, (_match, linkText: string) => {
    const url = buildObsidianUri(vaultName, linkText);
    return `[${linkText}](${url})`;
  });
}

// Variant that uses vault:// URLs instead of obsidian:// URLs
// so the link component can intercept clicks and call onNavigate
function preprocessWikiLinksDataAttr(markdown: string): string {
  return markdown.replace(/\[\[([^\]]+)\]\]/g, (_match, linkText: string) => {
    const url = `vault://${linkText}`;
    return `[${linkText}](${url})`;
  });
}

export function MarkdownRenderer({ content, className, onNavigate }: MarkdownRendererProps) {
  // Preprocess wiki links before passing to react-markdown
  // When onNavigate is provided, use vault:// URLs instead of obsidian://
  const processedContent = useMemo(
    () =>
      onNavigate
        ? preprocessWikiLinksDataAttr(content)
        : preprocessWikiLinks(content),
    [content, onNavigate]
  );

  useEffect(() => { ensureHljsCss(); }, []);

  const components = useMemo(
    () => createMarkdownComponents({ onNavigate }),
    [onNavigate]
  );

  return (
    <div className={`markdown-content typeset ${className || ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, remarkUnwrapImages]}
        rehypePlugins={[rehypeKatex, [rehypeHighlight, { detect: true, ignoreMissing: true }]] as unknown as Parameters<typeof ReactMarkdown>[0]["rehypePlugins"]}
        components={components}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}
