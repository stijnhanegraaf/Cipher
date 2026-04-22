"use client";

import { useState } from "react";

interface Props { folderPath: string; filePath: string | null }

export function BrowsePage({ folderPath, filePath }: Props) {
  const [treeWidth] = useState(280);
  return (
    <div style={{ display: "flex", height: "100dvh", minWidth: 0 }}>
      <aside style={{ width: treeWidth, borderRight: "1px solid var(--border-subtle)", flexShrink: 0, overflow: "hidden" }}>
        <div style={{ padding: 12, fontSize: 12, color: "var(--text-tertiary)" }}>
          Tree for: {folderPath || "(root)"}
        </div>
      </aside>
      <main style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
        <div style={{ padding: 16 }}>Preview: {filePath ?? "(no file)"}</div>
      </main>
    </div>
  );
}
