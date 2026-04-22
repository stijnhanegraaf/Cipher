"use client";
import { useEffect, useRef } from "react";

export function SourceView({ content }: { content: string }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let view: { destroy: () => void } | null = null;
    let alive = true;
    (async () => {
      const [
        { EditorState },
        { EditorView },
        // commands is imported for future use; unused here but we keep the dep warm
        {},
        { markdown },
        { oneDark },
      ] = await Promise.all([
        import("@codemirror/state"),
        import("@codemirror/view"),
        import("@codemirror/commands"),
        import("@codemirror/lang-markdown"),
        import("@codemirror/theme-one-dark"),
      ]);
      if (!alive || !hostRef.current) return;
      const state = EditorState.create({
        doc: content,
        extensions: [
          EditorView.editable.of(false),
          EditorView.lineWrapping,
          markdown(),
          oneDark,
        ],
      });
      view = new EditorView({ state, parent: hostRef.current });
    })();
    return () => { alive = false; view?.destroy(); };
  }, [content]);

  return <div ref={hostRef} style={{ height: "100%", overflow: "auto" }} />;
}
