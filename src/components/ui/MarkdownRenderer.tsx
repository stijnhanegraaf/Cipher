"use client";

/**
 * MarkdownRenderer — react-markdown wrapper with wiki-link rewriting,
 * GFM, and Cipher-styled elements (headings, tasks, tables).
 */

import React, { useEffect, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkUnwrapImages from "remark-unwrap-images";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import { CheckboxIndicator, StatusDot } from "./StatusDot";
import { CodeBlock } from "./CodeBlock";
import { buildObsidianUri } from "@/lib/obsidian-uri";
import { parseWikiTarget } from "@/lib/markdown/wikilink";
import { ensureHljsCss } from "./markdown/hljs-theme";
import { MermaidBlock } from "./markdown/MermaidBlock";
import { textToId, wikiLinkIcon, CopyHeadingLink } from "./markdown/CopyHeadingLink";

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

  return (
    <div className={`markdown-content typeset ${className || ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, remarkUnwrapImages]}
        rehypePlugins={[rehypeKatex, [rehypeHighlight, { detect: true, ignoreMissing: true }]] as unknown as Parameters<typeof ReactMarkdown>[0]["rehypePlugins"]}
        components={{
          // ── Headings ──
          h1: ({ children }) => {
            const id = `heading-${textToId(children)}`;
            return (
              <h1 id={id}>
                {children}
                <CopyHeadingLink id={id} />
              </h1>
            );
          },
          h2: ({ children }) => {
            const id = `heading-${textToId(children)}`;
            return (
              <h2 id={id}>
                {children}
                <CopyHeadingLink id={id} />
              </h2>
            );
          },
          h3: ({ children }) => {
            const id = `heading-${textToId(children)}`;
            return (
              <h3 id={id}>
                {children}
                <CopyHeadingLink id={id} />
              </h3>
            );
          },
          h4: ({ children }) => {
            const id = `heading-${textToId(children)}`;
            return (
              <h4 id={id}>
                {children}
                <CopyHeadingLink id={id} />
              </h4>
            );
          },
          h5: ({ children }) => {
            const id = `heading-${textToId(children)}`;
            return (
              <h5 id={id}>
                {children}
              </h5>
            );
          },
          h6: ({ children }) => {
            const id = `heading-${textToId(children)}`;
            return (
              <h6 id={id}>
                {children}
              </h6>
            );
          },

          // ── Paragraph ──
          p: ({ children }) => (
            <p>
              {children}
            </p>
          ),

          // ── Bold ──
          strong: ({ children }) => (
            <strong className="text-text-primary">
              {children}
            </strong>
          ),

          // ── Italic ──
          em: ({ children }) => (
            <em style={{ fontStyle: "italic" }}>{children}</em>
          ),

          // ── Links ── (handles both regular links and wiki-link-converted links)
          a: ({ href, children }) => {
            const isObsidianLink = href?.startsWith("obsidian://");
            const isVaultLink = href?.startsWith("vault://");
            const isWikiLink = isObsidianLink || isVaultLink;

            // For vault:// links with onNavigate, intercept the click
            if (isVaultLink && onNavigate && href) {
              const raw = decodeURIComponent(href.replace("vault://", ""));
              return (
                <a
                  href="#"
                  onClick={async (e) => {
                    e.preventDefault();
                    const { target } = parseWikiTarget(raw);
                    let dest = target;
                    try {
                      const res = await fetch(`/api/resolve?path=${encodeURIComponent(target)}`, { cache: "no-store" });
                      if (res.ok) {
                        const data = (await res.json()) as { resolved: string | null };
                        if (data.resolved) dest = data.resolved;
                      }
                    } catch {
                      /* fall back to raw target; DetailPage shows a friendly 404 */
                    }
                    // Note: onNavigate is typed as (path: string) => void and the
                    // underlying sheet.open uses separate anchorSlug param. Passing
                    // "path#anchor" as a single string would encode the # in ?sheet=
                    // and break the anchor lookup. Anchor navigation is deferred to Phase 1.
                    onNavigate(dest);
                  }}
                  className="md-link focus-ring"
                >
                  {wikiLinkIcon}
                  {children}
                </a>
              );
            }

            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="md-link focus-ring"
              >
                {isWikiLink && wikiLinkIcon}
                {children}
              </a>
            );
          },

          // ── Images (figure + figcaption, asset path resolution) ──
          img: ({ src, alt }) => {
            const srcStr = typeof src === "string" ? src : undefined;
            const resolved =
              srcStr && !/^https?:\/\//.test(srcStr) && !srcStr.startsWith("/") && !srcStr.startsWith("vault://")
                ? `/api/vault/asset?path=${encodeURIComponent(srcStr.replace(/^\.\//, ""))}`
                : srcStr;
            return (
              <figure style={{ margin: "16px 0", textAlign: "center" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={resolved} alt={alt ?? ""} loading="lazy" decoding="async" style={{ maxWidth: "100%", borderRadius: 6 }} />
                {alt ? <figcaption className="caption" style={{ color: "var(--text-tertiary)", marginTop: 6 }}>{alt}</figcaption> : null}
              </figure>
            );
          },

          // ── Bullet lists ──
          ul: ({ children }) => (
            <ul>
              {children}
            </ul>
          ),
          li: ({ children, ...props }) => {
            // GFM task list: react-markdown passes `checked` prop when item is a task,
            // though the Components type doesn't reflect that shape.
            const checked = (props as { checked?: boolean | null }).checked;
            const isTask = checked !== undefined && checked !== null;

            if (isTask) {
              return (
                <li
                  className={`flex items-start m-0 list-none ${checked ? "text-text-quaternary" : "text-text-secondary"}`}
                >
                  <CheckboxIndicator checked={!!checked} />
                  <span className="flex-1" style={checked ? { textDecoration: "line-through" } : undefined}>
                    {children}
                  </span>
                </li>
              );
            }

            // Regular list item — native ::marker styled via .typeset li::marker
            return (
              <li>
                {children}
              </li>
            );
          },

          // ── Ordered lists ──
          ol: ({ children }) => (
            <ol>
              {children}
            </ol>
          ),

          // ── Code inline + code block child ──
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          code: ({ className, children, ...props }: any) => {
            const match = /language-(\w+)/.exec(className || "");
            const lang = match?.[1];
            // A language-xxx class means this code node lives inside a fenced
            // block (rehype-highlight has already decorated it). Let <pre>
            // own the box styling; don't layer the inline pill on top.
            const isBlock = !!lang;
            if (isBlock && lang === "mermaid") {
              return <MermaidBlock code={String(children).trim()} />;
            }
            if (isBlock) {
              return (
                <code className={["mono-caption", className].filter(Boolean).join(" ")} {...props}>
                  {children}
                </code>
              );
            }
            return (
              <code className="mono-caption" {...props}>
                {children}
              </code>
            );
          },

          // ── Code block (pre) — CodeBlock adds the hover-reveal copy button ──
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,

          // ── Blockquote ──
          blockquote: ({ children }) => (
            <blockquote>
              {children}
            </blockquote>
          ),

          // ── Horizontal rule ──
          hr: () => <hr />,

          // ── Table ──
          table: ({ children }) => (
            <div className="table-scroll" tabIndex={0} role="group" aria-label="Table, scroll horizontally">
              <table>
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead>
              {children}
            </thead>
          ),
          th: ({ children }) => (
            <th>
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td>
              {children}
            </td>
          ),

          // ── Checkbox input (GFM task lists) ──
          // We suppress the raw input element; rendering is handled by the li component
          input: () => null,
        } satisfies Components}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}
