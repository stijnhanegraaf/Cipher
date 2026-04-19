"use client";

/**
 * ChatEmptyState — single heading + centered Composer + three hint chips.
 *
 * When a vault is connected, two of the hint chips use real entity /
 * project names pulled from the vault index. Fallback strings render
 * when the vault isn't connected or no entities/projects are indexed.
 */

import { useEffect, useState } from "react";
import { useVault } from "@/lib/hooks/useVault";
import { Composer } from "./Composer";

interface Props {
  onSubmit: (query: string) => void;
  /** Optional health banner (rendered above the composer). */
  banner?: React.ReactNode;
}

const FALLBACK_HINTS = [
  "summarise this week's notes",
  "what is Alice working on",
  "find notes related to Q3 plan",
];

export function ChatEmptyState({ onSubmit, banner }: Props) {
  const vault = useVault();
  const [hints, setHints] = useState<string[]>(FALLBACK_HINTS);

  useEffect(() => {
    if (!vault.connected) {
      setHints(FALLBACK_HINTS);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/browse/hints", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { entities?: string[]; projects?: string[] };
        if (cancelled) return;
        const hints: string[] = ["summarise this week's notes"];
        const firstEntity = data.entities?.[0];
        const firstProject = data.projects?.[0];
        if (firstEntity) hints.push(`what is ${firstEntity} working on`);
        else hints.push(FALLBACK_HINTS[1]);
        if (firstProject) hints.push(`find notes related to ${firstProject}`);
        else hints.push(FALLBACK_HINTS[2]);
        setHints(hints);
      } catch {
        /* keep fallbacks */
      }
    })();
    return () => { cancelled = true; };
  }, [vault.connected]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 20,
        paddingTop: "30dvh",
      }}
    >
      <h1
        className="heading-3"
        style={{ color: "var(--text-tertiary)", margin: 0, fontWeight: 500 }}
      >
        Ask about your vault.
      </h1>
      {banner}
      <div style={{ width: "100%", maxWidth: 520 }}>
        <Composer onSubmit={onSubmit} hideKbd={false} autoFocus />
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, marginTop: 8 }}>
        <span className="mono-label" style={{ color: "var(--text-quaternary)", letterSpacing: "0.08em" }}>
          TRY
        </span>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {hints.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => onSubmit(h)}
              className="caption-large focus-ring"
              style={{
                background: "transparent",
                border: "none",
                padding: "4px 8px",
                borderRadius: 6,
                color: "var(--text-secondary)",
                cursor: "pointer",
                textAlign: "center",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-surface-alpha-2)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              • {h}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
