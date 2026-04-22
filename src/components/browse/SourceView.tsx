"use client";
import { useEffect, useRef } from "react";

/**
 * Read-only markdown source view. Styled to match the rendered view —
 * same background, same typography scale, same readable max-width.
 * No syntax theme override so it inherits the app's current theme.
 */
export function SourceView({ content }: { content: string }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let view: { destroy: () => void } | null = null;
    let alive = true;
    (async () => {
      const [
        { EditorState },
        { EditorView },
        { markdown },
      ] = await Promise.all([
        import("@codemirror/state"),
        import("@codemirror/view"),
        import("@codemirror/lang-markdown"),
      ]);
      if (!alive || !hostRef.current) return;
      const state = EditorState.create({
        doc: content,
        extensions: [
          EditorView.editable.of(false),
          EditorView.lineWrapping,
          markdown(),
          EditorView.theme({
            "&": {
              background: "transparent",
              color: "var(--text-primary)",
              height: "100%",
              fontSize: "calc(var(--md-size, 15px) * var(--md-zoom, 1))",
            },
            ".cm-scroller": {
              fontFamily: "var(--font-mono, ui-monospace, Menlo, monospace)",
              lineHeight: "var(--md-line-height, 1.6)",
              padding: "32px 24px",
            },
            ".cm-content": {
              maxWidth: "var(--md-max-width, 72ch)",
              margin: "0 auto",
              padding: 0,
            },
            ".cm-focused": { outline: "none" },
            ".cm-selectionBackground, ::selection": {
              backgroundColor: "var(--bg-surface-alpha-4)",
            },
          }),
        ],
      });
      view = new EditorView({ state, parent: hostRef.current });
    })();
    return () => { alive = false; view?.destroy(); };
  }, [content]);

  return <div ref={hostRef} style={{ height: "100%", overflow: "auto" }} />;
}
