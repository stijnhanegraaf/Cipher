"use client";

/**
 * createMarkdownComponents — factory that produces the react-markdown
 * component override map (Components) used by MarkdownRenderer.
 *
 * This is a pure presentational config module: no state, no effects.
 * The only closure dep threaded through the factory args is `onNavigate`
 * (the async vault:// link handler).
 */

import React from "react";
import type { Components } from "react-markdown";
import { CheckboxIndicator } from "../StatusDot";
import { CodeBlock } from "../CodeBlock";
import { Callout } from "../Callout";
import { parseWikiTarget } from "@/lib/markdown/wikilink";
import { parseCallout } from "@/lib/markdown/callout";
import { MermaidBlock } from "./MermaidBlock";
import { textToId, wikiLinkIcon, CopyHeadingLink } from "./CopyHeadingLink";

/**
 * Extract a flat string from the first text run in React children.
 * react-markdown wraps each blockquote line in a <p>; the first child
 * of blockquote is thus a <p> whose children contain the opening text.
 * We recurse into the first valid element only — enough to read the
 * `[!type]` marker without walking the whole tree.
 */
function firstLineText(children: React.ReactNode): string {
  let text = "";
  React.Children.forEach(children, (child) => {
    if (text) return; // only first child
    if (typeof child === "string") {
      text = child;
    } else if (typeof child === "number") {
      text = String(child);
    } else if (React.isValidElement(child)) {
      const props = child.props as { children?: React.ReactNode };
      text = firstLineText(props.children);
    }
  });
  return text;
}

/**
 * Strip the callout marker (`[!type][-+]? optional title`) from the
 * first paragraph's children, returning the remainder text, or null
 * if the first paragraph is entirely consumed.
 */
function stripMarkerFromFirstPara(children: React.ReactNode): React.ReactNode {
  const arr = React.Children.toArray(children);
  if (!arr.length) return children;

  const firstEl = arr[0];
  if (!React.isValidElement(firstEl)) return children;

  // Extract first-para text children, minus the marker prefix
  const paraProps = firstEl.props as { children?: React.ReactNode };
  const paraChildren = React.Children.toArray(paraProps.children);

  // Find the first text node that contains the marker
  let markerStripped = false;
  const newParaChildren = paraChildren.map((c) => {
    if (!markerStripped && typeof c === "string") {
      // Strip the `[!type][-+]? title` prefix (with optional leading >)
      const stripped = c.replace(/^\s*>?\s*\[![^\]]+\][-+]?\s*/, "").trimStart();
      markerStripped = true;
      return stripped;
    }
    return c;
  }).filter((c) => c !== "");

  // If first paragraph is now empty, drop it from the body
  const newPara =
    newParaChildren.length === 0
      ? null
      : React.cloneElement(firstEl, {}, ...newParaChildren);

  const rest = arr.slice(1);
  return newPara ? [newPara, ...rest] : rest;
}

export interface MarkdownComponentOptions {
  onNavigate?: (path: string) => void;
}

export function createMarkdownComponents({ onNavigate }: MarkdownComponentOptions): Components {
  return {
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

    // ── Blockquote — detects Obsidian callouts ──
    blockquote: ({ children }) => {
      // Extract the first line to check for callout syntax
      const firstLine = firstLineText(children);
      const meta = parseCallout(firstLine);

      // No callout marker — render as normal blockquote (zero regression)
      if (!meta) {
        return <blockquote>{children}</blockquote>;
      }

      // Callout: strip the marker from the first paragraph, pass body to <Callout>
      const body = stripMarkerFromFirstPara(children);
      return <Callout meta={meta} body={body} />;
    },

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
  } satisfies Components;
}
