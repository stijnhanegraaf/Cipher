"use client";

import React, { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Design tokens
const tokens = {
  text: {
    primary: "#f7f8f8",
    secondary: "#d0d6e0",
    tertiary: "#8a8f98",
    quaternary: "#62666d",
  },
  brand: {
    indigo: "#5e6ad2",
    violet: "#7170ff",
    hover: "#828fff",
  },
  border: {
    subtle: "rgba(255,255,255,0.05)",
    standard: "rgba(255,255,255,0.08)",
  },
  bg: {
    surface: "#191a1b",
  },
};

const fontFamily = {
  inter: '"Inter Variable", "SF Pro Display", -apple-system, system-ui, sans-serif',
  mono: '"Berkeley Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
};

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
                style={{
                  fontFamily: fontFamily.inter,
                  fontFeatureSettings: '"cv01", "ss03"',
                  fontSize: "1.5rem", // 24px — heading-2
                  fontWeight: 400,
                  lineHeight: 1.33,
                  letterSpacing: "-0.288px",
                  color: tokens.text.primary,
                  margin: "32px 0 12px",
                }}
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
                style={{
                  fontFamily: fontFamily.inter,
                  fontFeatureSettings: '"cv01", "ss03"',
                  fontSize: "1.5rem", // 24px
                  fontWeight: 400,
                  lineHeight: 1.33,
                  letterSpacing: "-0.288px",
                  color: tokens.text.primary,
                  margin: "28px 0 10px",
                }}
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
                style={{
                  fontFamily: fontFamily.inter,
                  fontFeatureSettings: '"cv01", "ss03"',
                  fontSize: "1.25rem", // 20px
                  fontWeight: 590,
                  lineHeight: 1.33,
                  letterSpacing: "-0.24px",
                  color: tokens.text.primary,
                  margin: "24px 0 8px",
                }}
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
                style={{
                  fontFamily: fontFamily.inter,
                  fontFeatureSettings: '"cv01", "ss03"',
                  fontSize: "1.0625rem", // 17px
                  fontWeight: 590,
                  lineHeight: 1.6,
                  color: tokens.text.primary,
                  margin: "20px 0 6px",
                }}
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
                style={{
                  fontFamily: fontFamily.inter,
                  fontFeatureSettings: '"cv01", "ss03"',
                  fontSize: "0.9375rem", // 15px
                  fontWeight: 590,
                  lineHeight: 1.6,
                  letterSpacing: "-0.165px",
                  color: tokens.text.primary,
                  margin: "16px 0 4px",
                }}
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
                style={{
                  fontFamily: fontFamily.inter,
                  fontFeatureSettings: '"cv01", "ss03"',
                  fontSize: "0.8125rem", // 13px
                  fontWeight: 590,
                  lineHeight: 1.5,
                  letterSpacing: "-0.13px",
                  color: tokens.text.tertiary,
                  margin: "16px 0 4px",
                }}
              >
                {children}
              </h6>
            );
          },

          // ── Paragraph ──
          p: ({ children }) => (
            <p
              style={{
                fontFamily: fontFamily.inter,
                fontFeatureSettings: '"cv01", "ss03"',
                fontSize: "0.9375rem", // 15px
                fontWeight: 400,
                lineHeight: 1.6,
                letterSpacing: "-0.165px",
                color: tokens.text.secondary,
                margin: "0 0 12px",
              }}
            >
              {children}
            </p>
          ),

          // ── Bold ──
          strong: ({ children }) => (
            <strong
              style={{
                fontFamily: fontFamily.inter,
                fontFeatureSettings: '"cv01", "ss03"',
                fontWeight: 590,
                color: tokens.text.primary,
              }}
            >
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
                  style={{
                    color: tokens.brand.violet,
                    textDecoration: "none",
                    borderBottom: "1px solid transparent",
                    transition: "border-color 0.15s, color 0.15s",
                    fontFamily: fontFamily.inter,
                    fontFeatureSettings: '"cv01", "ss03"',
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderBottomColor = tokens.brand.violet;
                    e.currentTarget.style.color = tokens.brand.hover;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderBottomColor = "transparent";
                    e.currentTarget.style.color = tokens.brand.violet;
                  }}
                >
                  <svg
                    style={{
                      display: "inline-block",
                      width: 12,
                      height: 12,
                      marginRight: 3,
                      verticalAlign: "-1px",
                    }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  {children}
                </a>
              );
            }

            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: tokens.brand.violet,
                  textDecoration: "none",
                  borderBottom: "1px solid transparent",
                  transition: "border-color 0.15s, color 0.15s",
                  fontFamily: fontFamily.inter,
                  fontFeatureSettings: '"cv01", "ss03"',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderBottomColor = tokens.brand.violet;
                  e.currentTarget.style.color = tokens.brand.hover;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderBottomColor = "transparent";
                  e.currentTarget.style.color = tokens.brand.violet;
                }}
              >
                {isWikiLink && (
                  <svg
                    style={{
                      display: "inline-block",
                      width: 12,
                      height: 12,
                      marginRight: 3,
                      verticalAlign: "-1px",
                    }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                )}
                {children}
              </a>
            );
          },

          // ── Bullet lists ──
          ul: ({ children }) => (
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: "0 0 16px",
                display: "flex",
                flexDirection: "column",
                gap: "6px",
              }}
            >
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
                  style={{
                    fontFamily: fontFamily.inter,
                    fontFeatureSettings: '"cv01", "ss03"',
                    fontSize: "0.9375rem", // 15px
                    fontWeight: 400,
                    lineHeight: 1.6,
                    letterSpacing: "-0.165px",
                    color: checked ? tokens.text.quaternary : tokens.text.secondary,
                    paddingLeft: 0,
                    position: "relative",
                    display: "flex",
                    alignItems: "flex-start",
                    margin: 0,
                    listStyle: "none",
                  }}
                >
                  <CheckboxIndicator checked={!!checked} />
                  <span style={{ flex: 1, ...(checked ? { textDecoration: "line-through" } : {}) }}>
                    {children}
                  </span>
                </li>
              );
            }

            // Regular list item
            return (
              <li
                style={{
                  fontFamily: fontFamily.inter,
                  fontFeatureSettings: '"cv01", "ss03"',
                  fontSize: "0.9375rem", // 15px
                  fontWeight: 400,
                  lineHeight: 1.6,
                  letterSpacing: "-0.165px",
                  color: tokens.text.secondary,
                  paddingLeft: "16px",
                  position: "relative",
                  display: "flex",
                  alignItems: "flex-start",
                  listStyle: "none",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    left: 0,
                    top: "9px",
                    width: "4px",
                    height: "4px",
                    borderRadius: "50%",
                    backgroundColor: tokens.text.quaternary,
                    flexShrink: 0,
                  }}
                />
                <span style={{ flex: 1 }}>{children}</span>
              </li>
            );
          },

          // ── Ordered lists ──
          ol: ({ children }) => (
            <ol
              style={{
                listStyle: "none",
                padding: 0,
                margin: "0 0 16px",
                display: "flex",
                flexDirection: "column",
                gap: "6px",
                counterReset: "markdown-ol",
              }}
            >
              {children}
            </ol>
          ),

          // ── Code inline ──
          code: ({ className, children, ...props }: any) => {
            // If there's a language class, it's a code block (handled by pre)
            const isCodeBlock = className && className.startsWith("language-");
            if (isCodeBlock || !className) {
              return (
                <code
                  style={{
                    fontFamily: fontFamily.mono,
                    fontSize: "0.875em",
                    backgroundColor: "rgba(255,255,255,0.04)",
                    padding: "0.15em 0.4em",
                    borderRadius: 4,
                    color: tokens.brand.violet,
                  }}
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <code
                style={{
                  fontFamily: fontFamily.mono,
                  fontSize: "0.875em",
                  backgroundColor: "rgba(255,255,255,0.04)",
                  padding: "0.15em 0.4em",
                  borderRadius: 4,
                  color: tokens.brand.violet,
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
              style={{
                backgroundColor: tokens.bg.surface,
                color: tokens.text.primary,
                padding: "16px 20px",
                borderRadius: 8,
                border: `1px solid ${tokens.border.standard}`,
                overflowX: "auto",
                fontSize: "0.8125rem", // 13px
                lineHeight: 1.6,
                margin: "0 0 16px",
                fontFamily: fontFamily.mono,
              }}
            >
              {children}
            </pre>
          ),

          // ── Blockquote ──
          blockquote: ({ children }) => (
            <blockquote
              style={{
                borderLeft: `2px solid ${tokens.brand.indigo}`,
                margin: "0 0 16px",
                padding: "8px 16px",
                backgroundColor: "rgba(94,106,210,0.04)",
                color: tokens.text.secondary,
                fontFamily: fontFamily.inter,
                fontFeatureSettings: '"cv01", "ss03"',
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
                background: tokens.border.subtle,
                margin: "24px 0",
              }}
            />
          ),

          // ── Table ──
          table: ({ children }) => (
            <div style={{ overflowX: "auto", margin: "0 0 16px" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "0.875rem", // 14px
                  fontFamily: fontFamily.inter,
                  fontFeatureSettings: '"cv01", "ss03"',
                }}
              >
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead
              style={{
                borderBottom: `1px solid ${tokens.border.standard}`,
              }}
            >
              {children}
            </thead>
          ),
          th: ({ children }) => (
            <th
              style={{
                textAlign: "left",
                padding: "8px 12px",
                fontSize: "0.6875rem", // 11px
                fontWeight: 590,
                letterSpacing: "0.08em",
                textTransform: "uppercase" as const,
                color: tokens.text.quaternary,
                fontFamily: fontFamily.inter,
                fontFeatureSettings: '"cv01", "ss03"',
              }}
            >
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td
              style={{
                padding: "8px 12px",
                borderBottom: `1px solid ${tokens.border.subtle}`,
                color: tokens.text.secondary,
                fontFamily: fontFamily.inter,
                fontFeatureSettings: '"cv01", "ss03"',
                fontSize: "0.875rem", // 14px
              }}
            >
              {children}
            </td>
          ),

          // ── Checkbox input (GFM task lists) ──
          // We suppress the raw input element; rendering is handled by the li component
          input: ({ checked, ...props }) => {
            return null;
          },
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}

// ─── Checkbox rendering helper ────────────────────────────────────────
// Renders Obsidian-style checkboxes: checked = filled circle, unchecked = empty circle
export function CheckboxIndicator({ checked }: { checked: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 16,
        height: 16,
        borderRadius: "50%",
        border: checked ? "none" : "1.5px solid rgba(255,255,255,0.2)",
        backgroundColor: checked ? tokens.brand.indigo : "transparent",
        flexShrink: 0,
        marginRight: 8,
        transition: "background-color 0.15s, border-color 0.15s",
      }}
    >
      {checked && (
        <svg
          width={8}
          height={8}
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 6L9 17l-5-5" />
        </svg>
      )}
    </span>
  );
}

// ─── Status dot component ─────────────────────────────────────────────
// Renders a 6px colored circle for status indicators
export function StatusDot({
  status,
  size = 6,
}: {
  status: "ok" | "warn" | "error" | "stale" | "fresh" | "in_progress" | "open" | "done" | "blocked" | string;
  size?: number;
}) {
  const colorMap: Record<string, string> = {
    ok: "#10b981",
    fresh: "#10b981",
    done: "#10b981",
    in_progress: "#f59e0b",
    warn: "#f59e0b",
    blocked: "#ef4444",
    error: "#ef4444",
    stale: "#62666d",
    open: "#3b82f6",
  };

  const color = colorMap[status] || "#62666d";

  return (
    <span
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        backgroundColor: color,
        flexShrink: 0,
      }}
    />
  );
}