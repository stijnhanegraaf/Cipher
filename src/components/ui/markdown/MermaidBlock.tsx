"use client";

import React from "react";

// ── Mermaid block ──
// Dynamically imports mermaid and renders the SVG on mount / code change.
export function MermaidBlock({ code }: { code: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const mod = await import("mermaid");
        const mermaid = (mod as unknown as { default?: unknown }).default ?? mod;
        // Using `as any` because mermaid's types aren't perfectly loose.
        (mermaid as unknown as { initialize: (o: object) => void }).initialize({
          startOnLoad: false,
          securityLevel: "loose",
        });
        const id = `m-${Math.random().toString(36).slice(2)}`;
        const { svg } = await (mermaid as unknown as {
          render: (id: string, code: string) => Promise<{ svg: string }>;
        }).render(id, code);
        if (alive && ref.current) ref.current.innerHTML = svg;
      } catch (err) {
        if (alive && ref.current) {
          ref.current.innerHTML = `<pre style="color:var(--status-danger);padding:12px">${String(err).replace(/[<>&]/g, "")}</pre>`;
        }
      }
    })();
    return () => { alive = false; };
  }, [code]);
  return <div ref={ref} className="mermaid-block" style={{ margin: "0 0 16px" }} />;
}
