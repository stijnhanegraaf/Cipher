"use client";

/**
 * StreamingText — renders buffered LLM tokens with a live blinking cursor.
 *
 * Converts inline [^N] footnote markers into small superscript buttons
 * that, when clicked, scroll the matching SourcesRow pill into view and
 * briefly tint it. Reuses the `cipher-cursor-blink` keyframe.
 */

import { useEffect, useRef } from "react";

interface Props {
  /** Concatenated token stream so far. */
  text: string;
  /** When false, the cursor is hidden (stream complete). */
  active: boolean;
  /** Optional hook fired when a [^N] marker is clicked. */
  onCitationClick?: (id: number) => void;
}

export function StreamingText({ text, active, onCitationClick }: Props) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    // Scroll the end into view while streaming so the reader tracks the tail.
    if (active && ref.current) {
      ref.current.scrollIntoView({ block: "nearest", behavior: "auto" });
    }
  }, [text, active]);

  const parts = splitWithCitations(text);

  return (
    <span
      style={{
        color: "var(--text-primary)",
        fontSize: 15,
        lineHeight: 1.55,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {parts.map((p, i) =>
        p.kind === "text" ? (
          <span key={i}>{p.value}</span>
        ) : (
          <button
            key={i}
            type="button"
            aria-label={`Source ${p.id}`}
            onClick={() => onCitationClick?.(p.id)}
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
            [{p.id}]
          </button>
        )
      )}
      {active && (
        <span
          aria-hidden
          style={{
            display: "inline-block",
            marginLeft: 2,
            fontFamily: "var(--font-mono)",
            color: "var(--text-primary)",
            animation: "cipher-cursor-blink 1200ms ease-in-out infinite",
          }}
        >
          ▌
        </span>
      )}
      <span ref={ref} />
    </span>
  );
}

type Part = { kind: "text"; value: string } | { kind: "cite"; id: number };

function splitWithCitations(text: string): Part[] {
  const out: Part[] = [];
  const re = /\[\^(\d+)\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ kind: "text", value: text.slice(last, m.index) });
    out.push({ kind: "cite", id: parseInt(m[1], 10) });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", value: text.slice(last) });
  return out;
}
