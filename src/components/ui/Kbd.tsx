"use client";

/**
 * Kbd — keyboard shortcut chip.
 * Linear-style: 11px mono, thin border, subtle surface bg, tight padding.
 * Used in hint chips, command palette rows, and anywhere a hotkey is displayed.
 */
export function Kbd({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={`inline-flex items-center justify-center micro text-text-tertiary ${className}`}
      style={{
        minWidth: "var(--kbd-size)",
        height: "var(--kbd-size)",
        padding: "0 4px",
        borderRadius: "var(--radius-small)",
        background: "var(--bg-surface-alpha-5)",
        border: "1px solid var(--border-standard)",
        boxShadow: "var(--shadow-micro)",
        lineHeight: 1,
        letterSpacing: 0,
      }}
    >
      {children}
    </kbd>
  );
}
