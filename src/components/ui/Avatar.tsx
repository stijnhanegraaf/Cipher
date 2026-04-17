"use client";

/**
 * Avatar — initial-based circle in the Linear-native style.
 * Used for both AI ("C" for Cipher) and human teammates — the "AI as peer" treatment.
 *
 *   <Avatar initial="C" tone="brand" />   // AI / Cipher
 *   <Avatar initial="S" tone="neutral" /> // User
 */
interface AvatarProps {
  initial: string;
  /** "brand" = accent-brand fill (AI / primary). "neutral" = subtle surface with border (human/user). */
  tone?: "brand" | "neutral";
  size?: number;
  /** Optional accessible label. Falls back to `${initial} avatar`. */
  label?: string;
}

export function Avatar({ initial, tone = "brand", size = 28, label }: AvatarProps) {
  const isBrand = tone === "brand";
  return (
    <span
      role="img"
      aria-label={label ?? `${initial} avatar`}
      className="inline-flex items-center justify-center shrink-0 select-none"
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        background: isBrand ? "var(--accent-brand)" : "var(--bg-elevated)",
        color: isBrand ? "var(--text-on-brand)" : "var(--text-primary)",
        border: isBrand ? "none" : "1px solid var(--border-standard)",
        fontSize: Math.round(size * 0.46),
        fontWeight: 590,
        lineHeight: 1,
        letterSpacing: 0,
      }}
    >
      {initial.slice(0, 1).toUpperCase()}
    </span>
  );
}
