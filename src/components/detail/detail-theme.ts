/**
 * Theme-aware token indirection for the Detail subsystem.
 *
 * Values point to CSS custom properties defined in globals.css so
 * light/dark mode switching is automatic. Previously inlined in DetailPage.tsx.
 */
export const theme = {
  bg: {
    marketing: "var(--bg-marketing)",
    panel: "var(--bg-panel)",
    surface: "var(--bg-surface)",
    secondary: "var(--bg-elevated)",
  },
  text: {
    primary: "var(--text-primary)",
    secondary: "var(--text-secondary)",
    tertiary: "var(--text-tertiary)",
    quaternary: "var(--text-quaternary)",
  },
  brand: {
    indigo: "var(--accent-brand)",
    violet: "var(--accent-violet)",
    hover: "var(--accent-hover)",
  },
  border: {
    subtle: "var(--border-subtle)",
    standard: "var(--border-standard)",
    solid: "var(--border-solid-primary)",
  },
} as const;
