"use client";

import { GraphView } from "@/components/browse/GraphView";
import { useSheet } from "@/lib/hooks/useSheet";

// /browse/graph — Vault graph view.
// AppShell provides sidebar, palette, vault drawer, hint chip and the sheet overlay.
// Node clicks open a file via `?sheet=<path>` — see useSheet.

export default function GraphPage() {
  const sheet = useSheet();
  return (
    <div style={{ height: "100dvh", minHeight: 0, display: "flex", flexDirection: "column" }}>
      <GraphView onOpen={sheet.open} />
    </div>
  );
}
