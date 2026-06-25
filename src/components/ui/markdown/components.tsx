"use client";

/**
 * createMarkdownComponents — factory that produces the react-markdown
 * component override map (Components) used by MarkdownRenderer.
 *
 * This is a pure presentational config module: no state, no effects.
 * The only closure dep threaded through the factory args is `onNavigate`
 * (the async vault:// link handler).
 */

import React, { useEffect, useRef, useState } from "react";
import type { Components } from "react-markdown";
import { CheckboxIndicator } from "../StatusDot";
import { CodeBlock } from "../CodeBlock";
import { Callout } from "../Callout";
import { parseWikiTarget } from "@/lib/markdown/wikilink";
import { slugifyHeading, type AnchorValidation } from "@/lib/markdown/anchors";
import { parseCallout, stripCalloutLine } from "@/lib/markdown/callout";
import { MermaidBlock } from "./MermaidBlock";
import { textToId, wikiLinkIcon, CopyHeadingLink } from "./CopyHeadingLink";
import { Embed } from "./Embed";

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
 * Strip the callout marker (`[!type][-+]? optional title`) AND the title text
 * from the first paragraph's children, returning the remainder, or the tail
 * paragraphs when the first paragraph is entirely consumed.
 *
 * `title` must be the `parseCallout().title` value (null when no custom title).
 * When non-null, the title text is also removed from the first text node so
 * that a line like `[!note] My Title` does not duplicate "My Title" in the body
 * (Obsidian parity — the marker line is consumed entirely as the header).
 *
 * The marker regex is imported from callout.ts so it cannot drift.
 */
function stripMarkerFromFirstPara(
  children: React.ReactNode,
  title: string | null,
): React.ReactNode {
  const arr = React.Children.toArray(children);
  if (!arr.length) return children;

  const firstEl = arr[0];
  if (!React.isValidElement(firstEl)) return children;

  // Extract first-para text children, minus the marker (and title) prefix
  const paraProps = firstEl.props as { children?: React.ReactNode };
  const paraChildren = React.Children.toArray(paraProps.children);

  // Find the first text node that contains the marker and strip it
  let markerStripped = false;
  const newParaChildren = paraChildren.map((c) => {
    if (!markerStripped && typeof c === "string") {
      markerStripped = true;
      return stripCalloutLine(c, title);
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
  onNavigate?: (path: string, anchor?: string) => void;
}

// ─── WikiLink ─────────────────────────────────────────────────────────────────

/**
 * WikiLink — stateful wiki-link anchor component.
 *
 * Pre-fetches `/api/resolve` on mount to determine anchor validity, then:
 * - Applies `md-link--broken-anchor` styling when the anchor is invalid.
 * - On click: navigates to the resolved path, passing the anchor slug
 *   (heading slug or block id with `^` prefix) to onNavigate so the
 *   sheet can scroll-to and highlight the target.
 */
function WikiLink({
  raw,
  children,
  onNavigate,
}: {
  raw: string;
  children: React.ReactNode;
  onNavigate: (path: string, anchor?: string) => void;
}) {
  // Resolved destination path (without anchor) and anchor validation result.
  // undefined = initial state (resolution not yet attempted);
  // null = resolution was attempted but the API returned no valid path;
  // string = resolved vault path (anchor stripped).
  const [resolvedPath, setResolvedPath] = useState<string | null | undefined>(undefined);
  const [anchorInfo, setAnchorInfo] = useState<AnchorValidation | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    const controller = new AbortController();
    const { target } = parseWikiTarget(raw);
    // Pass the full raw (including anchor) so the route can validate it.
    fetch(`/api/resolve?path=${encodeURIComponent(raw)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as {
          resolved: string | null;
          anchor?: AnchorValidation;
        };
        // Strip the re-appended anchor from the resolved path so we can
        // pass path and anchor separately to onNavigate.
        const basePath = data.resolved ? data.resolved.split("#")[0] : null;
        setResolvedPath(basePath ?? target);
        if (data.anchor) setAnchorInfo(data.anchor);
      })
      .catch((err: unknown) => {
        // Ignore aborts (component unmounted); only set state on real failures.
        if (err instanceof DOMException && err.name === "AbortError") return;
        setResolvedPath(target);
      });

    return () => {
      controller.abort();
    };
  }, [raw]);

  const isBrokenAnchor =
    anchorInfo !== null && anchorInfo.kind !== "none" && !anchorInfo.valid;

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    const { target } = parseWikiTarget(raw);
    const dest = resolvedPath ?? target;

    // Build the anchor slug to pass to onNavigate (sheet.open).
    let anchorSlug: string | undefined;
    if (anchorInfo && anchorInfo.kind !== "none" && anchorInfo.valid) {
      if (anchorInfo.kind === "block") {
        // Pass block id with `^` prefix so DetailPage can differentiate.
        anchorSlug = `^${anchorInfo.value}`;
      } else {
        // Heading: pass the slug form that matches the rendered heading id.
        anchorSlug = slugifyHeading(anchorInfo.value);
      }
    }
    onNavigate(dest, anchorSlug);
  }

  return (
    <a
      href="#"
      onClick={handleClick}
      className={`md-link focus-ring${isBrokenAnchor ? " md-link--broken-anchor" : ""}`}
    >
      {wikiLinkIcon}
      {children}
    </a>
  );
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
      // embed:// sentinel — rendered by the Embed component, NOT an anchor.
      // The preprocessor emits `[](embed://<urlencoded-inner>)` on its own
      // line so react-markdown places it outside a <p> (no invalid nesting).
      if (href?.startsWith("embed://")) {
        const inner = decodeURIComponent(href.slice("embed://".length));
        return <Embed inner={inner} onNavigate={onNavigate} />;
      }

      const isObsidianLink = href?.startsWith("obsidian://");
      const isVaultLink = href?.startsWith("vault://");
      const isWikiLink = isObsidianLink || isVaultLink;

      // For vault:// links with onNavigate, use WikiLink for anchor validation
      // + broken-anchor styling + block/heading scroll on navigation.
      if (isVaultLink && onNavigate && href) {
        const raw = decodeURIComponent(href.replace("vault://", ""));
        return (
          <WikiLink raw={raw} onNavigate={onNavigate}>
            {children}
          </WikiLink>
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

      // Callout: strip the marker (and title) from the first paragraph, pass body to <Callout>
      const body = stripMarkerFromFirstPara(children, meta.title);
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
