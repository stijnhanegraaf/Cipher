"use client";

import React, { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CheckboxIndicator, StatusDot } from "./StatusDot";

// Re-export for backward compatibility with existing imports.
export { CheckboxIndicator, StatusDot };

interface MarkdownRendererProps {
  content: string;
  className?: string;
  onNavigate?: (path: string) => void;
}

// ─── Wiki-link preprocessor ────────────────────────────────────────
// Converts [[wiki links]] to [wiki links](obsidian://open?vault=Obsidian&file=PATH)
// before react-markdown processes the content.
function preprocessWikiLinks(markdown: string): string {
  return markdown.replace(/\[\[([^\]]+)\]\]/g, (_match, linkText: string) => {
    const encoded = encodeURIComponent(linkText);
    const url = `obsidian://open?vault=Obsidian&file=${encoded}`;
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

// ─── Helper: extract text content from React children for heading IDs ──
function textToId(children: React.ReactNode): string {
  let text = "";
  React.Children.forEach(children, (child) => {
    if (typeof child === "string") text += child;
    else if (typeof child === "number") text += child;
    else if (React.isValidElement(child)) text += textToId((child.props as { children?: React.ReactNode }).children);
  });
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

const wikiLinkIcon = (
  <svg
    className="inline-block w-3 h-3 mr-[3px] align-[-1px]"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    strokeWidth={2}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
  </svg>
);

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

  return (
    <div className={`markdown-content ${className || ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // ── Headings ──
          h1: ({ children }) => {
            const id = `heading-${textToId(children)}`;
            return (
              <h1
                id={id}
                className="heading-2 text-text-primary"
                style={{ margin: "32px 0 16px" }}
              >
                {children}
              </h1>
            );
          },
          h2: ({ children }) => {
            const id = `heading-${textToId(children)}`;
            return (
              <h2
                id={id}
                className="heading-2 text-text-primary"
                style={{ margin: "32px 0 16px" }}
              >
                {children}
              </h2>
            );
          },
          h3: ({ children }) => {
            const id = `heading-${textToId(children)}`;
            return (
              <h3
                id={id}
                className="heading-3 text-text-primary"
                style={{ margin: "24px 0 8px" }}
              >
                {children}
              </h3>
            );
          },
          h4: ({ children }) => {
            const id = `heading-${textToId(children)}`;
            return (
              <h4
                id={id}
                className="body-emphasis text-text-primary"
                style={{ margin: "20px 0 6px" }}
              >
                {children}
              </h4>
            );
          },
          h5: ({ children }) => {
            const id = `heading-${textToId(children)}`;
            return (
              <h5
                id={id}
                className="small-semibold text-text-primary"
                style={{ margin: "16px 0 4px" }}
              >
                {children}
              </h5>
            );
          },
          h6: ({ children }) => {
            const id = `heading-${textToId(children)}`;
            return (
              <h6
                id={id}
                className="caption-medium text-text-tertiary"
                style={{ margin: "16px 0 4px" }}
              >
                {children}
              </h6>
            );
          },

          // ── Paragraph ──
          p: ({ children }) => (
            <p className="small text-text-secondary" style={{ margin: "0 0 16px" }}>
              {children}
            </p>
          ),

          // ── Bold ──
          strong: ({ children }) => (
            <strong className="text-text-primary" style={{ fontWeight: 590 }}>
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
              const vaultPath = decodeURIComponent(href.replace("vault://", ""));
              return (
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate(vaultPath);
                  }}
                  className="text-accent-violet hover:text-accent-hover cursor-pointer transition-colors duration-150"
                  style={{
                    textDecoration: "none",
                    borderBottom: "1px solid transparent",
                    transition: "border-color var(--motion-hover) var(--ease-default), color var(--motion-hover) var(--ease-default)",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderBottomColor = "currentColor"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderBottomColor = "transparent"; }}
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
                className="text-accent-violet hover:text-accent-hover transition-colors duration-150"
                style={{
                  textDecoration: "none",
                  borderBottom: "1px solid transparent",
                  transition: "border-color var(--motion-hover) var(--ease-default), color var(--motion-hover) var(--ease-default)",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderBottomColor = "currentColor"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderBottomColor = "transparent"; }}
              >
                {isWikiLink && wikiLinkIcon}
                {children}
              </a>
            );
          },

          // ── Bullet lists ──
          ul: ({ children }) => (
            <ul className="flex flex-col gap-1.5 p-0 m-0 mb-4 list-none">
              {children}
            </ul>
          ),
          li: ({ children, node, ...props }: any) => {
            // GFM task list: react-markdown passes `checked` prop when item is a task
            const checked = props.checked;
            const isTask = checked !== undefined && checked !== null;

            if (isTask) {
              return (
                <li
                  className={`small flex items-start m-0 list-none ${checked ? "text-text-quaternary" : "text-text-secondary"}`}
                >
                  <CheckboxIndicator checked={!!checked} />
                  <span className="flex-1" style={checked ? { textDecoration: "line-through" } : undefined}>
                    {children}
                  </span>
                </li>
              );
            }

            // Regular list item
            return (
              <li className="small text-text-secondary flex items-start list-none relative pl-4">
                <span
                  className="absolute left-0 shrink-0"
                  style={{
                    top: "9px",
                    width: "4px",
                    height: "4px",
                    borderRadius: "50%",
                    backgroundColor: "var(--text-quaternary)",
                  }}
                />
                <span className="flex-1">{children}</span>
              </li>
            );
          },

          // ── Ordered lists ──
          ol: ({ children }) => (
            <ol
              className="flex flex-col gap-1.5 p-0 m-0 mb-4 list-none"
              style={{ counterReset: "markdown-ol" }}
            >
              {children}
            </ol>
          ),

          // ── Code inline + code block child ──
          code: ({ className, children, ...props }: any) => {
            // Inline or block-child code — both use the same pill styling
            return (
              <code
                className="text-accent-violet mono-caption"
                style={{
                  fontSize: "0.875em",
                  backgroundColor: "var(--bg-surface-alpha-4)",
                  padding: "0.15em 0.4em",
                  borderRadius: 4,
                }}
                {...props}
              >
                {children}
              </code>
            );
          },

          // ── Code block (pre) ──
          pre: ({ children }) => (
            <pre
              className="text-text-primary mono-caption overflow-x-auto"
              style={{
                backgroundColor: "var(--bg-surface)",
                padding: "16px 20px",
                borderRadius: 8,
                border: "1px solid var(--border-standard)",
                lineHeight: 1.6,
                margin: "0 0 16px",
              }}
            >
              {children}
            </pre>
          ),

          // ── Blockquote ──
          blockquote: ({ children }) => (
            <blockquote
              className="text-text-secondary"
              style={{
                borderLeft: "2px solid var(--accent-brand)",
                margin: "0 0 16px",
                padding: "8px 16px",
                backgroundColor: "color-mix(in srgb, var(--accent-brand) 6%, transparent)",
              }}
            >
              {children}
            </blockquote>
          ),

          // ── Horizontal rule ──
          hr: () => (
            <hr
              style={{
                border: "none",
                height: "1px",
                background: "var(--border-subtle)",
                margin: "24px 0",
              }}
            />
          ),

          // ── Table ──
          table: ({ children }) => (
            <div className="overflow-x-auto mb-4">
              <table className="w-full caption-large" style={{ borderCollapse: "collapse" }}>
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead style={{ borderBottom: "1px solid var(--border-standard)" }}>
              {children}
            </thead>
          ),
          th: ({ children }) => (
            <th
              className="micro uppercase tracking-[0.08em] text-text-quaternary"
              style={{ textAlign: "left", padding: "8px 12px" }}
            >
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td
              className="caption-large text-text-secondary"
              style={{
                padding: "8px 12px",
                borderBottom: "1px solid var(--border-subtle)",
              }}
            >
              {children}
            </td>
          ),

          // ── Checkbox input (GFM task lists) ──
          // We suppress the raw input element; rendering is handled by the li component
          input: () => null,
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}
