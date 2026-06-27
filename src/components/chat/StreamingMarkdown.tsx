"use client";

/**
 * StreamingMarkdown — renders LLM token streams as live markdown.
 *
 * Design goals:
 *  - No flicker: sanitizeStreamingMarkdown's 6 steps keep mid-stream syntax
 *    well-formed so react-markdown never sees broken AST nodes.
 *  - No citation loss: [^N] markers are protected to private sentinels BEFORE
 *    remark-gfm can eat them as footnotes, then rendered as CitationMarker
 *    buttons via remarkCitationTokens + a custom rehype handler.
 *  - No reparse storm: the markdown subtree is throttled to ~33ms (one rAF
 *    budget) while the cursor and scroll track the live tail on every token.
 *  - Monotonic: the sanitizer's prefix-safe transforms guarantee stable
 *    prefixes never re-layout.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import type { Plugin } from "unified";
import type { Root, Text, Parent } from "mdast";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkUnwrapImages from "remark-unwrap-images";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import { visit } from "unist-util-visit";
import { h } from "hastscript";
import { sanitizeStreamingMarkdown, protectCitations, CITATION_SENTINEL_OPEN, CITATION_SENTINEL_CLOSE } from "@/lib/markdown/streaming";
import { createMarkdownComponents } from "@/components/ui/markdown/components";
import { ensureHljsCss } from "@/components/ui/markdown/hljs-theme";

// ─── Citation mdast node ─────────────────────────────────────────────────────

interface CitationNode {
  type: "citation";
  id: number;
}

// Extend mdast types for our custom node
declare module "mdast" {
  interface RootContentMap {
    citation: CitationNode;
  }
}

// ─── remarkCitationTokens ────────────────────────────────────────────────────

/**
 * remarkCitationTokens — remark plugin that walks text nodes and converts
 * private-use sentinels ({id}) back into custom `citation` mdast nodes.
 *
 * The companion remarkRehypeOptions.handlers entry below converts these to
 * `cite-ref` hast elements, which react-markdown maps via the `cite-ref`
 * component override.
 */
const remarkCitationTokens: Plugin<[], Root> = () => (tree) => {
  const sentinelRe = new RegExp(
    `${CITATION_SENTINEL_OPEN}(\\d+)${CITATION_SENTINEL_CLOSE}`,
    "g"
  );

  visit(tree, "text", (node: Text, index, parent) => {
    if (!parent || index === undefined) return;

    if (!sentinelRe.test(node.value)) {
      sentinelRe.lastIndex = 0;
      return;
    }
    sentinelRe.lastIndex = 0;

    const children: (Text | CitationNode)[] = [];
    let last = 0;
    let m: RegExpExecArray | null;

    while ((m = sentinelRe.exec(node.value)) !== null) {
      if (m.index > last) {
        children.push({ type: "text", value: node.value.slice(last, m.index) });
      }
      children.push({ type: "citation", id: parseInt(m[1], 10) });
      last = m.index + m[0].length;
    }
    if (last < node.value.length) {
      children.push({ type: "text", value: node.value.slice(last) });
    }

    // Replace the text node with the split children in the parent
    (parent as Parent).children.splice(index, 1, ...(children as Parent["children"]));

    // Skip over the inserted nodes to avoid re-visiting new text nodes
    return [true, index + children.length];
  });
};

// Handler converts `citation` mdast node → `cite-ref` hast element.
// We use a custom element name to avoid colliding with built-in HTML elements.
const citationToHast = (_state: unknown, node: CitationNode) =>
  h("cite-ref", { "data-id": String(node.id) });

const remarkRehypeOptions = {
  handlers: {
    citation: citationToHast,
  },
};

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  /** Concatenated token stream so far. */
  text: string;
  /** When false the stream is complete — render verbatim, hide cursor. */
  active: boolean;
  /** Fired when a [^N] inline citation is clicked. */
  onCitationClick?: (id: number) => void;
}

export function StreamingMarkdown({ text, active, onCitationClick }: Props) {
  const tailRef = useRef<HTMLSpanElement>(null);
  // Explicit reduced-motion gate for the blinking cursor.
  // The global @layer base rule in globals.css also zeroes animation-duration
  // via `animation-duration: 0.01ms !important`, which covers inline styles
  // too. We gate explicitly here so the intent is clear and does not rely on
  // CSS cascade order.
  const prefersReducedMotion = useReducedMotion();

  // Throttled text: updated at most once per rAF (~33ms) while streaming.
  // This prevents react-markdown re-parsing on every single token (can be
  // many per second) while keeping the cursor tracking live.
  // When the stream completes (active→false), we schedule one final rAF flush.
  const [throttledText, setThrottledText] = useState(text);
  const rafRef = useRef<number | null>(null);
  const latestTextRef = useRef(text);

  useEffect(() => {
    // Keep the latest text accessible in rAF callbacks without stale closure.
    latestTextRef.current = text;

    // Always schedule an rAF (both while active and on the final done flush).
    // This avoids calling setState synchronously inside an effect body.
    if (rafRef.current !== null) {
      // Already pending: cancel so we re-schedule with latest text
      cancelAnimationFrame(rafRef.current);
    }

    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setThrottledText(latestTextRef.current);
    });

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [text, active]);

  // Scroll the tail into view while streaming
  useEffect(() => {
    if (
      active &&
      tailRef.current &&
      typeof tailRef.current.scrollIntoView === "function"
    ) {
      tailRef.current.scrollIntoView({ block: "nearest", behavior: "auto" });
    }
  }, [text, active]);

  useEffect(() => { ensureHljsCss(); }, []);

  // Sanitize the throttled text while active; when done, still protect citations
  // (the sanitizer returns raw verbatim for active:false, so we apply citation
  // protection separately to ensure [^N] always renders as buttons, not as
  // GFM footnotes eaten by remark-gfm).
  const sanitized = useMemo(() => {
    if (active) {
      // Full sanitize — step 1 (citations) runs internally as the first step
      return sanitizeStreamingMarkdown(throttledText, { active: true });
    }
    // Stream done: skip flicker-guards but still protect citations
    return protectCitations(throttledText);
  }, [throttledText, active]);

  // Build the component map, injecting citation node renderer.
  // `cite-ref` is a custom element name that maps to the citation button.
  // react-markdown passes `data-id` as a prop so we can read the citation id.
  const components = useMemo(() => {
    const base = createMarkdownComponents({});
    return {
      ...base,
      // Custom citation element — matches the superscript style from StreamingText
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      "cite-ref": ({ "data-id": dataId }: { "data-id"?: string; [key: string]: any }) => {
        const id = parseInt(dataId ?? "0", 10);
        return (
          <button
            type="button"
            aria-label={`Source ${id}`}
            onClick={() => onCitationClick?.(id)}
            style={{
              fontSize: 10,
              verticalAlign: "super",
              lineHeight: 1,
              padding: "0 2px",
              margin: "0 1px",
              background: "transparent",
              border: "none",
              color: "var(--accent-brand)",
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
            }}
          >
            [{id}]
          </button>
        );
      },
    };
  }, [onCitationClick]);

  return (
    <div className="markdown-content typeset">
      <ReactMarkdown
        remarkPlugins={[remarkCitationTokens, remarkGfm, remarkMath, remarkUnwrapImages]}
        rehypePlugins={[rehypeKatex, [rehypeHighlight, { detect: true, ignoreMissing: true }]] as unknown as Parameters<typeof ReactMarkdown>[0]["rehypePlugins"]}
        remarkRehypeOptions={remarkRehypeOptions as Parameters<typeof ReactMarkdown>[0]["remarkRehypeOptions"]}
        components={components as Parameters<typeof ReactMarkdown>[0]["components"]}
      >
        {sanitized}
      </ReactMarkdown>
      {active && (
        <span
          aria-hidden
          style={{
            display: "inline-block",
            marginLeft: 2,
            fontFamily: "var(--font-mono)",
            color: "var(--text-primary)",
            animation: prefersReducedMotion
              ? "none"
              : "cipher-cursor-blink 1200ms ease-in-out infinite",
          }}
        >
          ▌
        </span>
      )}
      <span ref={tailRef} />
    </div>
  );
}
