"use client";
import { useEffect, useState } from "react";
import { applyTheme, readTheme, watchSystemTheme, writeTheme, type ThemeChoice } from "@/lib/browse/theme";

export function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>("system");
  useEffect(() => {
    setChoice(readTheme());
    return watchSystemTheme(() => { if (readTheme() === "system") applyTheme("system"); });
  }, []);
  const pick = (c: ThemeChoice) => { setChoice(c); writeTheme(c); };
  const items: ThemeChoice[] = ["light", "dark", "system"];
  return (
    <div role="group" aria-label="Theme" style={{
      display: "inline-flex", borderRadius: 6, overflow: "hidden",
      border: "1px solid var(--border-subtle)",
    }}>
      {items.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => pick(t)}
          aria-pressed={choice === t}
          className="focus-ring caption"
          style={{
            padding: "4px 8px",
            border: "none",
            background: choice === t ? "var(--bg-surface-alpha-4)" : "transparent",
            color: "var(--text-primary)",
            cursor: "pointer",
            textTransform: "capitalize",
          }}
        >
          {t}
        </button>
      ))}
    </div>
  );
}
