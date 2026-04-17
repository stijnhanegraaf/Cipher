"use client";

/**
 * Kbd — keyboard shortcut chip.
 * Linear-style: 11px mono, thin border, subtle surface bg, tight padding.
 * Used in hint chips, command palette rows, and anywhere a hotkey is displayed.
 */
export function Kbd({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={`inline-flex items-center justify-center mono-label text-text-tertiary ${className}`}
      style={{
        minWidth: 16,
        height: 16,
        padding: "0 4px",
        borderRadius: 4,
        background: "var(--bg-surface-alpha-5)",
        border: "1px solid var(--border-standard)",
        boxShadow: "var(--shadow-micro)",
        fontSize: 11,
        lineHeight: 1,
        letterSpacing: 0,
      }}
    >
      {children}
    </kbd>
  );
}
