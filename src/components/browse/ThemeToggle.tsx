"use client";
import { useEffect, useState } from "react";
import { applyTheme, readTheme, watchSystemTheme, writeTheme, type ThemeChoice } from "@/lib/browse/theme";

const SUN = (
  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  </svg>
);
const MOON = (
  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);
const AUTO = (
  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="14" rx="2" />
    <path d="M8 20h8M12 18v2" />
  </svg>
);

const ICONS: Record<ThemeChoice, React.ReactNode> = {
  light: SUN,
  dark: MOON,
  system: AUTO,
};

const LABELS: Record<ThemeChoice, string> = {
  light: "Light theme",
  dark: "Dark theme",
  system: "Match system theme",
};

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
          aria-label={LABELS[t]}
          title={LABELS[t]}
          className="focus-ring"
          style={{
            width: 26, height: 24,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            border: "none",
            background: choice === t ? "var(--bg-surface-alpha-4)" : "transparent",
            color: choice === t ? "var(--text-primary)" : "var(--text-tertiary)",
            cursor: "pointer",
          }}
        >
          {ICONS[t]}
        </button>
      ))}
    </div>
  );
}
