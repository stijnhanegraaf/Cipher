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
      {children}
    </pre>
  );
}
