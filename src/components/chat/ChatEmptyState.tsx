"use client";

/**
 * ChatEmptyState — heading + centered Composer + inline hint chips.
 *
 * When a vault is connected, two of the hint chips pull real entity /
 * project names from the vault index. Fallback strings render when the
 * vault isn't connected or no entities/projects are indexed.
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
        const next: string[] = ["summarise this week's notes"];
        const firstEntity = data.entities?.[0];
        const firstProject = data.projects?.[0];
        next.push(firstEntity ? `what is ${firstEntity} working on` : FALLBACK_HINTS[1]);
        next.push(firstProject ? `find notes related to ${firstProject}` : FALLBACK_HINTS[2]);
        setHints(next);
      } catch {
        /* keep fallbacks */
      }
    })();
    return () => { cancelled = true; };
  }, [vault.connected]);

  return (
    <div
      className="editorial-glow"
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        padding: "24px",
      }}
    >
      <h1
        className="heading-2-serif"
        style={{
          color: "var(--text-secondary)",
          margin: 0,
          textAlign: "center",
        }}
      >
        Ask about your vault
      </h1>
      {banner}
      <div style={{ width: "100%", maxWidth: 560 }}>
        <Composer onSubmit={onSubmit} autoFocus />
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: 6,
          maxWidth: 560,
          marginTop: 4,
        }}
      >
        {hints.map((h) => (
          <button
            key={h}
            type="button"
            onClick={() => onSubmit(h)}
            className="caption focus-ring"
            style={{
              background: "var(--bg-surface-alpha-2)",
              border: "1px solid var(--border-subtle)",
              padding: "5px 10px",
              borderRadius: 999,
              color: "var(--text-tertiary)",
              cursor: "pointer",
              fontSize: 12,
              lineHeight: 1.4,
              transition: "background var(--motion-hover) var(--ease-default), color var(--motion-hover) var(--ease-default), border-color var(--motion-hover) var(--ease-default)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--bg-surface-alpha-4)";
              e.currentTarget.style.color = "var(--text-primary)";
              e.currentTarget.style.borderColor = "var(--border-standard)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--bg-surface-alpha-2)";
              e.currentTarget.style.color = "var(--text-tertiary)";
              e.currentTarget.style.borderColor = "var(--border-subtle)";
            }}
          >
            {h}
          </button>
        ))}
      </div>
    </div>
  );
}
