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
import { preprocessMarkdown } from "@/lib/markdown/preprocess";
import { ensureHljsCss } from "./markdown/hljs-theme";
import { createMarkdownComponents } from "./markdown/components";

// Re-export for backward compatibility with existing imports.
export { CheckboxIndicator, StatusDot };

interface MarkdownRendererProps {
  content: string;
  className?: string;
  onNavigate?: (path: string, anchor?: string) => void;
}

export function MarkdownRenderer({ content, className, onNavigate }: MarkdownRendererProps) {
  // Preprocess wiki links before passing to react-markdown.
  // interactive=true (has onNavigate) → vault:// links so the link component
  // can intercept clicks and call onNavigate.
  // interactive=false → obsidian:// deep links (vaultName defaults to "Obsidian").
  const processedContent = useMemo(
    () => preprocessMarkdown(content, { interactive: !!onNavigate }),
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
