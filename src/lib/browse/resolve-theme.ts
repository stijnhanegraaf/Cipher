/**
 * Pure theme resolver — no DOM/localStorage access.
 * Used by:
 *   1. The inline bootstrap script in layout.tsx (logic inlined there)
 *   2. The theme-toggle component (window.__setThemeColor)
 *
 * @param stored  Value from localStorage.getItem('brain-theme'), or null.
 * @param osDark  Whether prefers-color-scheme: dark is active.
 */
export function resolveTheme(
  stored: string | null,
  osDark: boolean
): "light" | "dark" {
  if (stored === "light") return "light";
  if (stored === "dark") return "dark";
  return osDark ? "dark" : "light";
}
