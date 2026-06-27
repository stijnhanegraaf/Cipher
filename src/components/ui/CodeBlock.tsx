"use client";

import React from "react";

/**
 * CodeBlock — wraps a fenced code `<pre>` with a hover-revealed copy button.
 *
 * The copy button reads `innerText` from the child `<code>` element so it
 * copies only the code text, not its own "Copy" label. Styling lives in
 * `.typeset pre` / `.code-copy` (globals.css).
 */
export function CodeBlock({ children }: { children: React.ReactNode }) {
  const ref = React.useRef<HTMLPreElement>(null);
  const [copied, setCopied] = React.useState(false);

  const copy = () => {
    // Prefer reading from the <code> child to avoid including the button label.
    const codeEl = ref.current?.querySelector("code");
    const text = codeEl ? (codeEl.innerText ?? codeEl.textContent ?? "") : (ref.current?.innerText ?? "");
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    }).catch(() => {});
  };

  return (
    <pre ref={ref}>
      <button
        type="button"
        className="code-copy"
        data-copied={copied || undefined}
        aria-label={copied ? "Copied" : "Copy code"}
        onClick={copy}
      >
        {copied ? "Copied" : "Copy"}
      </button>
      {/* Polite live region — announces the copy confirmation to screen readers
          without interrupting ongoing speech. Visually hidden via clip-pattern. */}
      <span
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: "absolute",
          width: "1px",
          height: "1px",
          padding: 0,
          margin: "-1px",
          overflow: "hidden",
          clip: "rect(0,0,0,0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      >
        {copied ? "Copied to clipboard" : ""}
      </span>
      {children}
    </pre>
  );
}
